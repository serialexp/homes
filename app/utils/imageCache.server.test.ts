import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCachedImage } from "./imageCache.server.js";

const source = "https://img01.suumo.com/gazo/bukken/030/a.jpg";
const photo = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

let dir: string;

function jpegResponse(body: Uint8Array = photo): Response {
  return new Response(body, { status: 200, headers: { "content-type": "image/jpeg" } });
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "image-cache-test-"));
  process.env.IMAGE_CACHE_DIR = dir;
});

afterEach(async () => {
  vi.unstubAllGlobals();
  delete process.env.IMAGE_CACHE_DIR;
  await rm(dir, { recursive: true, force: true });
});

describe("getCachedImage", () => {
  it("fetches an image once, then serves later requests from disk", async () => {
    const fetchMock = vi.fn(async () => jpegResponse());
    vi.stubGlobal("fetch", fetchMock);

    const first = await getCachedImage(source);
    const second = await getCachedImage(source);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first?.contentType).toBe("image/jpeg");
    expect(Array.from(second?.bytes ?? [])).toEqual(Array.from(photo));
    expect((await readdir(dir)).filter(name => name.endsWith(".bin") || name.endsWith(".type"))).toHaveLength(2);
  });

  it("shares one upstream fetch between concurrent requests for the same image", async () => {
    const fetchMock = vi.fn(async () => jpegResponse());
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([getCachedImage(source), getCachedImage(source), getCachedImage(source)]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refuses a redirect to a host that is not allowed, and caches nothing", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(null, { status: 302, headers: { location: "https://maintenance.suumo.jp/maintenance.jpg" } })
    );
    vi.stubGlobal("fetch", fetchMock);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await getCachedImage(source)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await readdir(dir)).toHaveLength(0);
    warn.mockRestore();
  });

  it("follows a redirect that stays on an allowed host", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: "https://img01.suumo.com/gazo/b.jpg" } }))
      .mockResolvedValueOnce(jpegResponse());
    vi.stubGlobal("fetch", fetchMock);

    expect((await getCachedImage(source))?.contentType).toBe("image/jpeg");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not cache a response that is not an image", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>maintenance</html>", { status: 200, headers: { "content-type": "text/html" } })));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await getCachedImage(source)).toBeNull();
    expect(await readdir(dir)).toHaveLength(0);
    warn.mockRestore();
  });

  it("refuses a source outside the allowlist without fetching it", async () => {
    const fetchMock = vi.fn(async () => jpegResponse());
    vi.stubGlobal("fetch", fetchMock);

    expect(await getCachedImage("https://example.com/a.jpg")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
