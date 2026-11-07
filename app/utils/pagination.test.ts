import { describe, expect, it } from "vitest";
import { pageWindow } from "./pagination.js";

describe("pageWindow", () => {
  it("shows the first pages when near the start", () => {
    expect(pageWindow(1, 3)).toEqual({ start: 1, end: 3 });
    expect(pageWindow(1, 40)).toEqual({ start: 1, end: 5 });
  });

  it("centres on the current page in the middle", () => {
    expect(pageWindow(50, 521)).toEqual({ start: 48, end: 52 });
  });

  it("shows the last pages when near the end", () => {
    expect(pageWindow(521, 521)).toEqual({ start: 517, end: 521 });
    expect(pageWindow(3, 5)).toEqual({ start: 1, end: 5 });
  });

  it("returns an empty range when there are no pages", () => {
    expect(pageWindow(1, 0)).toEqual({ start: 1, end: 0 });
  });
});
