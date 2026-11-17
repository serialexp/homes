import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { isAllowedImageSource, normalizedImageSource } from "./imageProxy.js";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;

export interface CachedImage {
  bytes: Uint8Array;
  contentType: string;
}

/** Where cached images live. The container mounts a volume here (see docker-compose.yml). */
function cacheDir(): string {
  return process.env.IMAGE_CACHE_DIR || path.resolve("data/image-cache");
}

/** Concurrent requests for one picture share a single upstream fetch and cache write. */
const inFlight = new Map<string, Promise<CachedImage | null>>();

/**
 * The image for a Suumo source URL, from the disk cache or fetched once and then cached.
 * Returns null when the source isn't allowed or the image can't be fetched.
 */
export function getCachedImage(requested: string): Promise<CachedImage | null> {
  if (!isAllowedImageSource(requested)) {
    return Promise.resolve(null);
  }
  const source = normalizedImageSource(requested);

  const key = createHash("sha256").update(source).digest("hex");
  const pending = inFlight.get(key);
  if (pending) {
    return pending;
  }

  const job = loadImage(key, source).finally(() => inFlight.delete(key));
  inFlight.set(key, job);
  return job;
}

async function loadImage(key: string, source: string): Promise<CachedImage | null> {
  const dir = cacheDir();
  const base = path.join(dir, key);

  const cached = await readCached(base);
  if (cached) {
    return cached;
  }

  const fetched = await fetchImage(source);
  if (!fetched) {
    return null;
  }

  try {
    await writeCached(dir, base, fetched);
  } catch (error) {
    // The image is still served this time; the next request fetches it again
    console.error(`Could not cache image ${source}:`, error);
  }
  return fetched;
}

async function readCached(base: string): Promise<CachedImage | null> {
  try {
    const contentType = (await readFile(`${base}.type`, "utf8")).trim();
    const bytes = new Uint8Array(await readFile(`${base}.bin`));
    return { bytes, contentType };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(`Could not read cached image ${base}:`, error);
    }
    return null;
  }
}

const MAX_REDIRECTS = 3;
const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

/**
 * Fetches an image, following redirects only while every hop stays on an allowed host.
 * The redirects and the body share one time budget.
 */
async function fetchFollowingAllowedRedirects(source: string): Promise<Response> {
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  let url = source;
  for (let redirects = 0; ; redirects++) {
    const response = await fetch(url, { redirect: "manual", signal });
    if (!REDIRECT_STATUSES.has(response.status)) {
      return response;
    }
    await response.body?.cancel();
    const location = response.headers.get("location");
    if (!location || redirects >= MAX_REDIRECTS) {
      throw new Error(`Too many redirects or no location while fetching ${source}`);
    }
    url = new URL(location, url).toString();
    if (!isAllowedImageSource(url)) {
      throw new Error(`Redirect to a host that is not allowed: ${url}`);
    }
  }
}

async function fetchImage(source: string): Promise<CachedImage | null> {
  let response: Response;
  try {
    response = await fetchFollowingAllowedRedirects(source);
  } catch (error) {
    console.warn(`Image fetch failed for ${source}:`, error);
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (!response.ok || !contentType.startsWith("image/") || declaredLength > MAX_IMAGE_BYTES) {
    await response.body?.cancel();
    console.warn(`Image ${source} rejected: HTTP ${response.status}, ${contentType || "no content type"}`);
    return null;
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    return null;
  }
  return { bytes, contentType };
}

async function writeCached(dir: string, base: string, image: CachedImage): Promise<void> {
  await mkdir(dir, { recursive: true });
  // Write each file under a temporary name, then rename it, so a reader never sees a partial file.
  // The content type is written last: a reader only returns a hit when both files are present.
  const bin = `${base}.${randomUUID()}.tmp`;
  await writeFile(bin, image.bytes);
  await rename(bin, `${base}.bin`);

  const type = `${base}.${randomUUID()}.tmp`;
  await writeFile(type, image.contentType);
  await rename(type, `${base}.type`);
}
