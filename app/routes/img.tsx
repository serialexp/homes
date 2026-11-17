import type { LoaderFunctionArgs } from "@remix-run/node";
import { getCachedImage } from "../utils/imageCache.server.js";
import { isAllowedImageSource } from "../utils/imageProxy.js";

const BROWSER_CACHE_SECONDS = 7 * 24 * 60 * 60;

/**
 * Serves a Suumo image from this site. The source URL is in ?u=; only allowed hosts are fetched,
 * and each image is fetched once and then served from the disk cache.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const source = new URL(request.url).searchParams.get("u") ?? "";
  if (!isAllowedImageSource(source)) {
    throw new Response("Not found", { status: 404 });
  }

  const image = await getCachedImage(source);
  if (!image) {
    throw new Response("Image unavailable", { status: 502, headers: { "Cache-Control": "no-store" } });
  }

  return new Response(image.bytes, {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": `public, max-age=${BROWSER_CACHE_SECONDS}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
