import { describe, expect, it } from "vitest";
import { isAllowedImageSource, proxiedImageUrl } from "./imageProxy.js";

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

describe("proxiedImageUrl", () => {
  it("points an allowed source at the proxy with the source encoded", () => {
    expect(proxiedImageUrl(suumo)).toBe(`/img?u=${encodeURIComponent(suumo)}`);
  });

  it("returns nothing for a missing or disallowed source, so no image is rendered from it", () => {
    expect(proxiedImageUrl(null)).toBeUndefined();
    expect(proxiedImageUrl(undefined)).toBeUndefined();
    expect(proxiedImageUrl("")).toBeUndefined();
    expect(proxiedImageUrl("https://example.com/a.jpg")).toBeUndefined();
  });
});
