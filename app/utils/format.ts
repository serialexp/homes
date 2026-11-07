const yenFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

/** Full yen amount, e.g. ¥16,370,000. */
export const yen = (amount: number): string => yenFormatter.format(amount);

/** Man-yen figure used in Japanese listings, e.g. 1,637万円. */
export const man = (amount: number): string => `${Math.round(amount / 10_000).toLocaleString("ja-JP")}万円`;

/** Square metres to one decimal, e.g. 27.7 m². */
export const sqm = (area: number): string => `${area.toLocaleString("en-US", { maximumFractionDigits: 1 })} m²`;

/** Compact yen for badges, e.g. ¥1.1M or ¥800K. */
export function shortYen(amount: number): string {
  return amount >= 1_000_000 ? `¥${(amount / 1_000_000).toFixed(1)}M` : `¥${Math.round(amount / 1_000)}K`;
}

/** Floor area: the building area when stored, otherwise the land figure. */
export function floorAreaOf(property: { building_area: number; area: number }): number {
  return property.building_area > 0 ? property.building_area : property.area;
}

/** Photos on a listing: the main image plus the comma-separated additional image URLs. */
export function photoCount(property: { main_image_url: string | null; additional_image_urls: string | null }): number {
  const extra = (property.additional_image_urls ?? "").split(",").filter((url) => url.trim() !== "").length;
  return (property.main_image_url ? 1 : 0) + extra;
}
