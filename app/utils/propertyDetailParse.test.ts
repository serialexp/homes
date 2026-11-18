import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePropertyDetailPage } from "./propertyDetailParse.js";

const fixture = readFileSync(new URL("./__fixtures__/suumo-detail-21745243.html", import.meta.url), "utf8");

describe("parsePropertyDetailPage", () => {
  const page = parsePropertyDetailPage(fixture, "https://suumo.jp/chukoikkodate/hokkaido_/sc_sapporoshiminami/nc_21745243/");

  it("returns every distinct gallery photo with its caption", () => {
    expect(page.photos).toHaveLength(16);
    expect(new Set(page.photos.map(photo => photo.url)).size).toBe(16);
    expect(page.photos.every(photo => photo.url.startsWith("https://img01.suumo.com/jj/resizeImage?src=gazo"))).toBe(true);
    expect(page.photos.map(photo => photo.caption)).toEqual(expect.arrayContaining(["現地外観写真", "間取り図", "トイレ"]));
  });

  it("reads the spec table, keeping the first occurrence of each label", () => {
    const completion = page.facts.filter(fact => fact.label.normalize("NFKC") === "完成時期(築年月)");
    expect(completion).toEqual([{ label: "完成時期（築年月）", value: "1978年3月" }]);
    expect(page.facts.find(fact => fact.label === "土地面積")?.value).toBe("153.08m2（46.30坪）（登記）");
    expect(page.facts.find(fact => fact.label === "構造・工法")?.value).toBe("木造2階建");
  });

  it("drops empty and placeholder rows and Suumo's link text", () => {
    expect(page.facts.some(fact => fact.value === "-" || fact.value === "")).toBe(false);
    expect(page.facts.some(fact => fact.value.includes("["))).toBe(false);
    const labels = page.facts.map(fact => fact.label.normalize("NFKC"));
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("returns nothing for a page without details", () => {
    expect(parsePropertyDetailPage("<html><body><p>no listing</p></body></html>", "https://suumo.jp/")).toEqual({
      facts: [],
      photos: [],
      outlineUrl: null,
    });
  });
});
