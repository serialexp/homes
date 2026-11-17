/**
 * Images are never loaded from Suumo directly. Every Suumo image URL goes through our own
 * /img route, which fetches it once, caches it, and serves it from this site.
 */

export const IMAGE_PROXY_PATH = "/img";

/** The only hosts the proxy will fetch from. Anything else is refused, so the proxy can't be used to reach arbitrary URLs. */
const ALLOWED_IMAGE_HOSTS: ReadonlySet<string> = new Set(["img01.suumo.com"]);

/** True when a source image URL is one the proxy will fetch. */
export function isAllowedImageSource(source: string): boolean {
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return false;
  }
  return url.protocol === "https:" && ALLOWED_IMAGE_HOSTS.has(url.hostname);
}

/**
 * The address to render for a source image, or undefined when the source is missing or not one
 * the proxy fetches. Callers pass the result straight to `src`; undefined renders no image.
 */
export function proxiedImageUrl(source: string | null | undefined): string | undefined {
  if (!source || !isAllowedImageSource(source)) {
    return undefined;
  }
  return `${IMAGE_PROXY_PATH}?u=${encodeURIComponent(source)}`;
}
