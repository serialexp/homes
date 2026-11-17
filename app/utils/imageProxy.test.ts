import { describe, expect, it } from "vitest";
import { isAllowedImageSource, normalizedImageSource, proxiedImageUrl } from "./imageProxy.js";

const suumo = "https://img01.suumo.com/jj/resizeImage?src=gazo%2Fbukken%2F030%2Fa.jpg&w=192&h=144";

describe("isAllowedImageSource", () => {
  it("accepts https images on img01.suumo.com", () => {
    expect(isAllowedImageSource(suumo)).toBe(true);
  });

  it("refuses other hosts, including lookalikes and userinfo tricks", () => {
    expect(isAllowedImageSource("https://example.com/a.jpg")).toBe(false);
    expect(isAllowedImageSource("https://img01.suumo.com.example.com/a.jpg")).toBe(false);
    expect(isAllowedImageSource("https://img01.suumo.com@example.com/a.jpg")).toBe(false);
    expect(isAllowedImageSource("https://img02.suumo.com/a.jpg")).toBe(false);
  });

  it("refuses plain http and anything that isn't a URL", () => {
    expect(isAllowedImageSource("http://img01.suumo.com/a.jpg")).toBe(false);
    expect(isAllowedImageSource("javascript:alert(1)")).toBe(false);
    expect(isAllowedImageSource("")).toBe(false);
    expect(isAllowedImageSource("not a url")).toBe(false);
  });
});

describe("normalizedImageSource", () => {
  it("pins a Suumo resize URL to the 1024x768 size, whatever size it asked for", () => {
    const pinned = normalizedImageSource("https://img01.suumo.com/jj/resizeImage?src=gazo%2Fa.jpg&w=192&h=144");
    expect(pinned).toBe("https://img01.suumo.com/jj/resizeImage?src=gazo%2Fa.jpg&w=1024&h=768");
    expect(normalizedImageSource("https://img01.suumo.com/jj/resizeImage?src=gazo%2Fa.jpg")).toBe("https://img01.suumo.com/jj/resizeImage?src=gazo%2Fa.jpg&w=1024&h=768");
  });

  it("leaves other allowed URLs unchanged", () => {
    expect(normalizedImageSource("https://img01.suumo.com/gazo/a.jpg")).toBe("https://img01.suumo.com/gazo/a.jpg");
  });
});

describe("proxiedImageUrl", () => {
  it("points a resize URL at the proxy with the pinned size", () => {
    const pinned = "https://img01.suumo.com/jj/resizeImage?src=gazo%2Fa.jpg&w=1024&h=768";
    expect(proxiedImageUrl("https://img01.suumo.com/jj/resizeImage?src=gazo%2Fa.jpg&w=192&h=144")).toBe(`/img?u=${encodeURIComponent(pinned)}`);
  });

  it("points an allowed source at the proxy with the source encoded", () => {
    expect(proxiedImageUrl(suumo)).toBe(`/img?u=${encodeURIComponent("https://img01.suumo.com/jj/resizeImage?src=gazo%2Fbukken%2F030%2Fa.jpg&w=1024&h=768")}`);
  });

  it("returns nothing for a missing or disallowed source, so no image is rendered from it", () => {
    expect(proxiedImageUrl(null)).toBeUndefined();
    expect(proxiedImageUrl(undefined)).toBeUndefined();
    expect(proxiedImageUrl("")).toBeUndefined();
    expect(proxiedImageUrl("https://example.com/a.jpg")).toBeUndefined();
  });
});
