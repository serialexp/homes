/** One transit entry as stored in the `stations` JSON column of a building or unit. */
export interface StationInfo {
  line?: string;
  station?: string;
  walking_minutes?: number;
}

/**
 * Parses the stored `stations` JSON. Returns an empty list when the column is
 * empty or holds malformed JSON, so a bad row shows "no stations" instead of
 * breaking the page.
 */
export function parseStations(raw: string | null | undefined): StationInfo[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StationInfo[]) : [];
  } catch {
    return [];
  }
}
