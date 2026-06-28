import { describe, it, expect } from "vitest";
import {
  normalizeName,
  looksLikeBus,
  buildCandidates,
  getCanonicalLines,
} from "./canonicalLines.server.js";
import { parseReconcileResponse } from "./llm.server.js";

describe("getCanonicalLines", () => {
  it("loads and dedupes the bundled dataset", () => {
    const lines = getCanonicalLines();
    expect(lines.length).toBeGreaterThan(400);
    // ekidata_id is unique after dedupe
    const ids = new Set(lines.map((l) => l.id));
    expect(ids.size).toBe(lines.length);
  });
});

describe("normalizeName", () => {
  it("NFKC-folds full-width JR to ASCII", () => {
    expect(normalizeName("ＪＲ中央線")).toBe("JR中央線");
  });

  it("strips station suffix and destination tails", () => {
    expect(normalizeName("地下鉄南北線/幌平橋駅 歩24分")).toBe("地下鉄南北線");
    expect(normalizeName("目黒駅行")).toBe("目黒");
  });

  it("normalizes a fully-bracketed label away to empty", () => {
    expect(normalizeName("〔南ルート〕")).toBe("");
  });

  it("drops bracketed route qualifiers", () => {
    expect(normalizeName("臨海２８-１〔東小松川車庫〕")).toBe("臨海28-1");
  });
});

describe("looksLikeBus", () => {
  it("flags bus routes and stops", () => {
    for (const s of [
      "小72",
      "亀26",
      "渋11",
      "013",
      "黒06",
      "西武バス　高松五丁目停",
      "周遊バス〔南ルート〕",
      "目黒駅行",
      "小７２・新小７１[小岩駅-本郷",
    ]) {
      expect(looksLikeBus(s), s).toBe(true);
    }
  });

  it("does not flag real rail lines", () => {
    for (const s of [
      "東急東横線",
      "ＪＲ中央線",
      "東京メトロ銀座線",
      "湘南新宿ライン",
      "つくばエクスプレス",
    ]) {
      expect(looksLikeBus(s), s).toBe(false);
    }
  });
});

describe("buildCandidates", () => {
  it("ranks the exact line first", () => {
    const top = buildCandidates("東急東横線", "030", 5)[0];
    expect(top.line.name_romaji).toBe("Tokyu Toyoko Line");
  });

  it("matches despite a full-width JR prefix", () => {
    const labels = buildCandidates("ＪＲ中央線", "030", 5).map(
      (c) => c.line.name_kanji
    );
    expect(labels.some((n) => n.includes("中央線"))).toBe(true);
  });

  it("surfaces Keisei candidates for a bare operator name", () => {
    const romaji = buildCandidates("京成", "030", 5).map(
      (c) => c.line.name_romaji
    );
    expect(romaji.some((r) => r.includes("Keisei"))).toBe(true);
  });

  it("returns nothing for an empty/normalized-away label", () => {
    expect(buildCandidates("〔南ルート〕", "030", 5)).toEqual([]);
  });
});

describe("parseReconcileResponse", () => {
  const candidates = buildCandidates("東急東横線", "030", 5);
  const id = candidates[0].line.id;

  it("accepts a valid candidate id and fills the romaji name", () => {
    const r = parseReconcileResponse(`{"kind":"rail","canonical_id":"${id}"}`, candidates);
    expect(r).toEqual({
      kind: "rail",
      canonical_id: id,
      canonical_name: "Tokyu Toyoko Line",
    });
  });

  it("rejects an invented id outside the candidate set", () => {
    const r = parseReconcileResponse(`{"kind":"rail","canonical_id":"999999"}`, candidates);
    expect(r.canonical_id).toBeNull();
  });

  it("parses through code fences and prose", () => {
    const r = parseReconcileResponse(
      '```json\n{"kind":"rail","canonical_id":"' + id + '"}\n```',
      candidates
    );
    expect(r.canonical_id).toBe(id);
  });

  it("ignores a canonical_id when kind is bus", () => {
    const r = parseReconcileResponse(`{"kind":"bus","canonical_id":"${id}"}`, candidates);
    expect(r).toEqual({ kind: "bus", canonical_id: null, canonical_name: null });
  });

  it("falls back to unknown on unparseable output", () => {
    const r = parseReconcileResponse("no json here", candidates);
    expect(r.kind).toBe("unknown");
  });
});
