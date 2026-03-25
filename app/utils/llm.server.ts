import OpenAI from "openai";
import prisma from "./db.server.js";

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
      model: "moonshot-v1-8k",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
    });

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

Items:
${itemList}

Respond with ONLY a numbered list of translations, one per line, matching the input numbering. No explanations.`;

  try {
    const response = await getClient().chat.completions.create({
      model: "moonshot-v1-8k",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
    });

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
          results.set(items[index].japanese, match[1].trim());
        }
      }
    }

    return results;
  } catch (error) {
    console.error("LLM translation error:", error);
    return new Map();
  }
}
