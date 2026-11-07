import { describe, expect, it } from "vitest";
import { proposalPage } from "./proposalPage.js";

function proposals(count: number, changedEvery: number) {
  return Array.from({ length: count }, (_, i) => ({ id: i + 1, changed: (i + 1) % changedEvery === 0 }));
}

describe("proposalPage", () => {
  it("lists changed rows first, then by id", () => {
    const page = proposalPage(
      [
        { id: 3, changed: false },
        { id: 1, changed: true },
        { id: 2, changed: false },
        { id: 4, changed: true },
      ],
      1,
      10
    );
    expect(page.rows.map((p) => p.id)).toEqual([1, 4, 2, 3]);
  });

  it("splits the stored list into pages of the given size", () => {
    const all = proposals(120, 1000);
    expect(proposalPage(all, 1, 50).rows).toHaveLength(50);
    expect(proposalPage(all, 2, 50).rows).toHaveLength(50);
    const last = proposalPage(all, 3, 50);
    expect(last.rows).toHaveLength(20);
    expect(last.totalPages).toBe(3);
    expect(last.currentPage).toBe(3);
  });

  it("counts changes across every page, not just the one shown", () => {
    const page = proposalPage(proposals(120, 10), 1, 50);
    expect(page.total).toBe(120);
    expect(page.changedTotal).toBe(12);
  });

  it("clamps out-of-range and non-integer pages", () => {
    const all = proposals(120, 1000);
    expect(proposalPage(all, 0, 50).currentPage).toBe(1);
    expect(proposalPage(all, -3, 50).currentPage).toBe(1);
    expect(proposalPage(all, Number.NaN, 50).currentPage).toBe(1);
    expect(proposalPage(all, 99, 50).currentPage).toBe(3);
  });

  it("has one empty page when nothing is stored", () => {
    const page = proposalPage([], 5, 50);
    expect(page).toEqual({ rows: [], total: 0, changedTotal: 0, currentPage: 1, totalPages: 1 });
  });
});
