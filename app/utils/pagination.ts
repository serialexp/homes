/**
 * Page numbers to show around the current page, clamped to the available range.
 * Returns start > end when there are no pages.
 */
export function pageWindow(currentPage: number, totalPages: number, size = 5): { start: number; end: number } {
  if (totalPages <= 0) return { start: 1, end: 0 };
  const start = Math.max(1, Math.min(currentPage - Math.floor(size / 2), totalPages - size + 1));
  const end = Math.min(totalPages, start + size - 1);
  return { start, end };
}
