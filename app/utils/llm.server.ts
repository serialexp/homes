import OpenAI from "openai";
import prisma from "./db.server.js";
import { areas } from "../data/propertyData.js";
import {
  buildCandidates,
  looksLikeBus,
  type ScoredCandidate,
} from "./canonicalLines.server.js";

/** Moonshot model id used for all translation/romanization calls. */
const MODEL = "kimi-k2.6";

/**
 * Shared chat-completion options. kimi-k2.6 defaults to "thinking" mode, but
 * these are deterministic extraction/matching tasks, so we run in instant
 * (non-thinking) mode for speed and stable output.
 *
 * `thinking` is a Moonshot-specific body field (not in the OpenAI types); the
 * official endpoint accepts `{ type: "disabled" }`. If MOONSHOT_ENDPOINT ever
 * points at a self-hosted vLLM/SGLang deployment instead, this needs to become
 * `chat_template_kwargs: { thinking: false }`. Centralized here so it's a
 * one-line change. NOTE: untestable without a live MOONSHOT_API_KEY.
 */
const CHAT_DEFAULTS = {
  model: MODEL,
  // kimi-k2.6 rejects any other value: "only 0.6 is allowed for this model".
  temperature: 0.6,
  thinking: { type: "disabled" },
};

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.MOONSHOT_API_KEY;
    const baseURL = process.env.MOONSHOT_ENDPOINT;
    if (!apiKey || !baseURL) {
      throw new Error("MOONSHOT_API_KEY and MOONSHOT_ENDPOINT must be set");
    }
    client = new OpenAI({ apiKey, baseURL: baseURL.replace(/\/?$/, "/v1") });
  }
  return client;
}

/**
 * Translate a batch of Japanese strings to English, using the translation cache.
 * Only calls the LLM for strings not already cached. Returns a map of source -> translated.
 */
export async function translateWithCache(
  texts: string[]
): Promise<Map<string, string>> {
  const unique = [...new Set(texts.filter(t => t && t.trim()))];
  if (unique.length === 0) return new Map();

  // Check cache for all unique texts
  const cached = await prisma.translationCache.findMany({
    where: { source_text: { in: unique } },
  });

  const results = new Map<string, string>();
  const cachedSet = new Set<string>();
  for (const entry of cached) {
    results.set(entry.source_text, entry.translated_text);
    cachedSet.add(entry.source_text);
  }

  // Find what's missing
  const missing = unique.filter((t) => !cachedSet.has(t));
  if (missing.length === 0) return results;

  // Batch translate via LLM
  const itemList = missing.map((text, i) => `${i + 1}. ${text}`).join("\n");

  const prompt = `Translate these Japanese real estate terms to natural English. These come from property listings (building types, building age, number of floors, addresses, etc).

Rules:
- "築X年" means "X years old" (built X years ago)
- "X階建" means "X floors" or "X stories"
- Building types like "賃貸マンション" should become "Rental apartment", "賃貸アパート" → "Rental apartment (wooden)", "賃貸一戸建て" → "Rental house", etc.
- Place names (prefectures, cities, districts): romanize using Hepburn romanization. Keep suffixes like -ku, -shi, -cho, -to, -fu, -ken (e.g. "港区" → "Minato-ku", "東京都" → "Tokyo-to", "新宿区" → "Shinjuku-ku"). IMPORTANT: translate ONLY the text given — do not add surrounding context like city or prefecture names. For example "一ツ家１" is just "1 Hitotsuya", not "1 Hitotsuya, Adachi-ku, Tokyo".
- Keep translations short and natural
- If it's already a number or doesn't need translation, return it as-is

Items:
${itemList}

Respond with ONLY a numbered list of translations, one per line, matching the input numbering. No explanations.`;

  try {
    const response = await getClient().chat.completions.create({
      ...CHAT_DEFAULTS,
      messages: [{ role: "user", content: prompt }],
    } as never);

    const text = response.choices[0]?.message?.content?.trim();
    if (!text) return results;

    const lines = text.split("\n");
    const toCache: Array<{ source_text: string; translated_text: string }> = [];

    for (const line of lines) {
      const match = line.match(/^\d+[.)]\s*(.+)$/);
      if (match) {
        const index = parseInt(line) - 1;
        if (index >= 0 && index < missing.length) {
          const translated = match[1].trim();
          results.set(missing[index], translated);
          toCache.push({
            source_text: missing[index],
            translated_text: translated,
          });
        }
      }
    }

    // Store new translations in cache
    if (toCache.length > 0) {
      await prisma.translationCache.createMany({
        data: toCache,
        skipDuplicates: true,
      });
    }
  } catch (error) {
    console.error("LLM translation error:", error);
  }

  return results;
}

/**
 * Translate Japanese train line and station names to their standard English/romanized forms.
 * Batches multiple names in a single LLM call for efficiency.
 */
export async function translateTrainNames(
  items: Array<{ japanese: string; type: "line" | "station" }>,
  regionName?: string
): Promise<Map<string, string>> {
  if (items.length === 0) return new Map();

  const regionContext = regionName ? ` in the ${regionName} region of Japan` : " in Japan";

  const itemList = items
    .map((item, i) => `${i + 1}. [${item.type}] ${item.japanese}`)
    .join("\n");

  const prompt = `You are a Japanese railway expert. Translate/romanize these Japanese train line and station names to their standard English names${regionContext}.

Rules:
- Use the official English name if one exists (e.g. JR Yamanote Line, Tokyo Metro Ginza Line)
- For train lines, always end with "Line" (e.g. "Tokyu Toyoko Line")
- For stations, just give the romanized name without "Station" suffix (e.g. "Shibuya", "Shin-Yokohama")
- Use standard Hepburn romanization
- Do NOT translate literally — romanize proper nouns (e.g. 東口 in a station name is "Higashiguchi", not "East Exit")
- If an item is NOT a real railway/subway/tram/monorail line or train station — e.g. a bus route number or code (小72, 013, 黒06), a bus stop, a destination/"…行", or text you cannot confidently romanize as a rail line or station — respond with exactly "unknown" for that item. Do NOT invent a plausible rail name. It is better to answer "unknown" than to guess.

Items:
${itemList}

Respond with ONLY a numbered list of translations, one per line, matching the input numbering. Use "unknown" for any item that is not a real rail line/station. No explanations.`;

  try {
    const response = await getClient().chat.completions.create({
      ...CHAT_DEFAULTS,
      messages: [{ role: "user", content: prompt }],
    } as never);

    const text = response.choices[0]?.message?.content?.trim();
    if (!text) return new Map();

    const results = new Map<string, string>();
    const lines = text.split("\n");

    for (const line of lines) {
      // Match patterns like "1. Tokyu Toyoko Line" or "1) Tokyu Toyoko Line"
      const match = line.match(/^\d+[.)]\s*(.+)$/);
      if (match) {
        const index = parseInt(line) - 1;
        if (index >= 0 && index < items.length) {
          const value = match[1].trim();
          // "unknown" → leave translated_name null so the UI falls back to the
          // original Japanese label (instead of a hallucinated rail name for a
          // bus route/stop). See reconcileTrainLine for the line classification.
          if (value.toLowerCase() === "unknown") continue;
          results.set(items[index].japanese, value);
        }
      }
    }

    return results;
  } catch (error) {
    console.error("LLM translation error:", error);
    return new Map();
  }
}

// ---------------------------------------------------------------------------
// Canonical line reconciliation
// ---------------------------------------------------------------------------

export type TransitKind =
  | "rail"
  | "subway"
  | "tram"
  | "monorail"
  | "shinkansen"
  | "bus"
  | "unknown";

const VALID_KINDS = new Set<TransitKind>([
  "rail",
  "subway",
  "tram",
  "monorail",
  "shinkansen",
  "bus",
  "unknown",
]);

export interface ReconcileResult {
  kind: TransitKind;
  /** ekidata_id of the matched canonical line, or null when not a rail match. */
  canonical_id: string | null;
  /** Romaji display name of the matched line, or null. */
  canonical_name: string | null;
}

/** Candidates scoring below this are too weak to short-circuit a bus decision. */
const MIN_CANDIDATE_SCORE = 0.55;
/** Max candidates handed to the model (keeps the prompt small). */
const MAX_PROMPT_CANDIDATES = 15;

/**
 * Parse + validate the model's reconcile reply against the candidate set.
 * Pure (no I/O) so it can be unit-tested. A canonical_id is only accepted if it
 * matches one of the supplied candidates — the model cannot invent a line.
 */
export function parseReconcileResponse(
  raw: string,
  candidates: ScoredCandidate[]
): ReconcileResult {
  const fallback: ReconcileResult = {
    kind: "unknown",
    canonical_id: null,
    canonical_name: null,
  };
  if (!raw) return fallback;

  // Extract the first JSON object from the reply (handles code fences/prose).
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return fallback;

  let parsed: { kind?: unknown; canonical_id?: unknown };
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return fallback;
  }

  const kind = VALID_KINDS.has(parsed.kind as TransitKind)
    ? (parsed.kind as TransitKind)
    : "unknown";

  const rawId =
    parsed.canonical_id == null ? null : String(parsed.canonical_id).trim();
  const hit =
    rawId && rawId.toLowerCase() !== "null"
      ? candidates.find((c) => c.line.id === rawId)
      : undefined;

  // A canonical match only makes sense for rail-like kinds.
  if (hit && kind !== "bus" && kind !== "unknown") {
    return {
      kind,
      canonical_id: hit.line.id,
      canonical_name: hit.line.name_romaji || hit.line.name_kanji || null,
    };
  }

  return { kind, canonical_id: null, canonical_name: null };
}

/**
 * Classify a scraped transit label and, when it is a railway line, match it to a
 * canonical line from the bundled dataset. The model is only ever allowed to
 * choose among `buildCandidates()` results, so it cannot hallucinate a line that
 * doesn't exist (the failure mode that produced the current garbled data).
 *
 * Obvious bus labels with no strong candidate are resolved without an LLM call.
 */
export async function reconcileTrainLine(
  rawName: string,
  region?: string
): Promise<ReconcileResult> {
  const candidates = buildCandidates(rawName, region, MAX_PROMPT_CANDIDATES);
  const strong = candidates.filter((c) => c.score >= MIN_CANDIDATE_SCORE);

  // Cheap path: clearly a bus and nothing canonical looks close.
  if (strong.length === 0 && looksLikeBus(rawName)) {
    return { kind: "bus", canonical_id: null, canonical_name: null };
  }

  const regionName = region
    ? areas[region as keyof typeof areas]?.name
    : undefined;
  const regionContext = regionName ? ` (region: ${regionName})` : "";

  const candidateList =
    candidates.length > 0
      ? candidates
          .map(
            (c) =>
              `- id=${c.line.id} | ${c.line.name_kanji} | ${
                c.line.name_romaji || "?"
              }`
          )
          .join("\n")
      : "(no canonical candidates found)";

  const prompt = `You are a Japanese transit expert. A real-estate site scraped this nearest-transit label${regionContext}:

"${rawName}"

It may be a railway/subway/tram/monorail/shinkansen LINE, or a BUS route/stop, or junk.

Here are the only canonical railway lines you may match against:
${candidateList}

Decide:
- "kind": one of rail | subway | tram | monorail | shinkansen | bus | unknown
- "canonical_id": the id of the matching canonical line above, or null

Rules:
- Only set canonical_id to an id that appears in the list above. NEVER invent an id.
- If the label is a bus route/stop (route numbers like 小72, operator+stop names, "...行", "...経由", "...系統"), set kind="bus" and canonical_id=null.
- If it is a real rail line but none of the candidates match, set the rail kind and canonical_id=null.
- Subways (地下鉄/メトロ/市営地下鉄) → "subway"; monorails → "monorail"; trams (市電/都電/世田谷線) → "tram"; shinkansen → "shinkansen"; ordinary trains → "rail".

Respond with ONLY a JSON object: {"kind":"...","canonical_id":"..."|null}. No prose.`;

  try {
    const response = await getClient().chat.completions.create({
      ...CHAT_DEFAULTS,
      messages: [{ role: "user", content: prompt }],
    } as never);
    const text = response.choices[0]?.message?.content?.trim() ?? "";
    return parseReconcileResponse(text, candidates);
  } catch (error) {
    console.error("LLM reconcile error:", error);
    // Degrade gracefully: trust the heuristic if we can, else leave unknown.
    if (looksLikeBus(rawName)) {
      return { kind: "bus", canonical_id: null, canonical_name: null };
    }
    return { kind: "unknown", canonical_id: null, canonical_name: null };
  }
}
