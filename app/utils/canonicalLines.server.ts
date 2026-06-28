import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { areas } from "../data/propertyData.js";

/**
 * Canonical Japanese railway line, loaded from data/canonical-rail-lines.json
 * (derived from ekidata.jp + Wikipedia via piuccio/open-data-jp-railway-lines).
 *
 * The stable identifier is `id` (ekidata_id). Upstream `code` is empty for ~77%
 * of rows and several lines share one ekidata_id under different code variants,
 * so we dedupe by ekidata_id at load time. See data/README.md.
 */
export interface CanonicalLine {
  /** ekidata_id — the stable canonical identifier. */
  id: string;
  /** Upstream `code` (e.g. "JR-East.Sobu"), or "" when unknown. */
  code: string;
  name_kanji: string;
  name_kana: string;
  /** Romaji display name; falls back to name_kanji when upstream is empty. */
  name_romaji: string;
  /** Japanese/kana alternative spellings used for matching. */
  alternative_names: string[];
  /** JIS prefecture codes, e.g. ["13","14"]. */
  prefectures: string[];
}

interface RawLine {
  code: string;
  ekidata_id: string;
  name_kanji: string;
  name_kana: string;
  name_romaji: string;
  alternative_names: string[];
  prefectures: string[];
  logo: string;
}

let cache: CanonicalLine[] | null = null;

/** Load + dedupe the canonical dataset (cached for the process lifetime). */
export function getCanonicalLines(): CanonicalLine[] {
  if (cache) return cache;

  const path = fileURLToPath(
    new URL("../../data/canonical-rail-lines.json", import.meta.url)
  );
  const raw = JSON.parse(readFileSync(path, "utf8")) as RawLine[];

  // Merge rows sharing an ekidata_id (same line under different code variants).
  const byId = new Map<string, CanonicalLine>();
  for (const r of raw) {
    if (!r.ekidata_id) continue;
    const existing = byId.get(r.ekidata_id);
    if (!existing) {
      byId.set(r.ekidata_id, {
        id: r.ekidata_id,
        code: r.code ?? "",
        name_kanji: r.name_kanji ?? "",
        name_kana: r.name_kana ?? "",
        name_romaji: r.name_romaji || r.name_kanji || "",
        alternative_names: [...(r.alternative_names ?? [])],
        prefectures: [...(r.prefectures ?? [])],
      });
    } else {
      // Prefer a non-empty code/romaji; union alt names + prefectures.
      if (!existing.code && r.code) existing.code = r.code;
      if (
        (!existing.name_romaji || existing.name_romaji === existing.name_kanji) &&
        r.name_romaji
      ) {
        existing.name_romaji = r.name_romaji;
      }
      for (const a of r.alternative_names ?? []) {
        if (a && !existing.alternative_names.includes(a)) {
          existing.alternative_names.push(a);
        }
      }
      for (const p of r.prefectures ?? []) {
        if (p && !existing.prefectures.includes(p)) existing.prefectures.push(p);
      }
    }
  }

  cache = [...byId.values()];
  return cache;
}

/**
 * Normalize a raw scraped line label for matching:
 * - NFKC fold (full-width ＪＲ → JR, full-width digits → ASCII)
 * - drop bracketed route segments 〔…〕 […] (…) ［…］
 * - strip 駅/station and common trailing route noise
 * - collapse whitespace
 */
export function normalizeName(s: string): string {
  if (!s) return "";
  let out = s.normalize("NFKC");
  // Remove bracketed segments (route qualifiers, vias, etc.)
  out = out.replace(/[〔［\[(（【].*?[〕］\])）】]/g, "");
  // Drop everything after a separator that introduces a destination/via.
  out = out.replace(/[\/／:：~～].*$/, "");
  // Strip trailing 駅 (station) and 方面/行/経由 (direction/bound-for/via).
  out = out.replace(/駅.*$/, "").replace(/(方面|行き?|経由|停).*$/, "");
  out = out.replace(/\s+/g, "").trim();
  return out;
}

/** Character bigram set of a string. */
function bigrams(s: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  if (s.length === 1) set.add(s);
  return set;
}

/** Dice coefficient between two strings' character bigrams (0..1). */
function dice(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return (2 * inter) / (A.size + B.size);
}

/** Best similarity of `norm` against a canonical line's Japanese forms. */
function scoreLine(norm: string, line: CanonicalLine): number {
  const targets = [line.name_kanji, line.name_kana, ...line.alternative_names]
    .map((t) => t.normalize("NFKC"))
    .filter(Boolean);
  let best = 0;
  for (const t of targets) {
    // Substring containment is a strong signal (e.g. "JR中央線" ⊃ "中央線").
    if (norm && t.includes(norm)) best = Math.max(best, 0.85);
    if (norm && norm.includes(t)) best = Math.max(best, 0.8);
    best = Math.max(best, dice(norm, t));
  }
  return best;
}

export interface ScoredCandidate {
  line: CanonicalLine;
  score: number;
}

/**
 * Rank canonical lines for a raw scraped label. Lines whose prefectures
 * intersect the region's prefecture codes get a small boost.
 */
export function buildCandidates(
  rawName: string,
  region?: string,
  limit = 20
): ScoredCandidate[] {
  const norm = normalizeName(rawName);
  if (!norm) return [];

  const regionPrefectures = region
    ? new Set(Object.keys(areas[region as keyof typeof areas]?.provinces ?? {}))
    : null;

  const scored: ScoredCandidate[] = [];
  for (const line of getCanonicalLines()) {
    let score = scoreLine(norm, line);
    if (score <= 0) continue;
    if (
      regionPrefectures &&
      line.prefectures.some((p) => regionPrefectures.has(p))
    ) {
      score += 0.05;
    }
    scored.push({ line, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/**
 * Cheap heuristic: does this label look like a bus route/stop rather than a
 * rail line? Used to skip the LLM for the obvious-bus majority.
 */
export function looksLikeBus(rawName: string): boolean {
  const s = (rawName ?? "").normalize("NFKC");
  if (!s) return false;
  // Explicit bus / route markers.
  if (/(バス|系統|方面|経由|循環|ライナー(?!.*線))/.test(s)) return true;
  if (/(行き?|停|乗場|のりば)/.test(s)) return true;
  // Route brackets like 〔…〕 [..] (including unclosed/truncated openers).
  if (/[〔［\[【]/.test(s)) return true;
  const compact = s.replace(/\s/g, "");
  // Short route codes: optional 1-2 kanji + digits (小72, 亀26, 渋11, 013, 黒06).
  if (/^[\p{Script=Han}]{0,2}\d{1,3}([-.・]\d{1,3})?$/u.test(compact)) return true;
  // Embedded route code (kanji+2 digits) next to a route separator — catches
  // truncated multi-route strings like "小72・新小71[小岩…".
  if (/[\p{Script=Han}]\d{2}/u.test(compact) && /[・,、]/.test(compact))
    return true;
  return false;
}
