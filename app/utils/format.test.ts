import { describe, expect, it } from "vitest";
import { floorAreaOf, photoCount, shortYen } from "./format.js";

describe("shortYen", () => {
  it("uses millions from one million up", () => {
    expect(shortYen(1_100_000)).toBe("¥1.1M");
    expect(shortYen(2_000_000)).toBe("¥2.0M");
  });

  it("uses thousands below one million", () => {
    expect(shortYen(800_000)).toBe("¥800K");
  });
});

describe("floorAreaOf", () => {
  it("uses building area when it is stored", () => {
    expect(floorAreaOf({ building_area: 62.5, area: 80 })).toBe(62.5);
  });

  it("falls back to the land figure when building area is zero", () => {
    expect(floorAreaOf({ building_area: 0, area: 80 })).toBe(80);
  });
});

describe("photoCount", () => {
  it("counts the main image and each additional URL", () => {
    expect(photoCount({ main_image_url: "a.jpg", additional_image_urls: "b.jpg, c.jpg" })).toBe(3);
  });

  it("counts nothing when there are no images and ignores empty entries", () => {
    expect(photoCount({ main_image_url: null, additional_image_urls: null })).toBe(0);
    expect(photoCount({ main_image_url: "a.jpg", additional_image_urls: "b.jpg," })).toBe(2);
  });
});
