/** One page of stored reconcile proposals, changed rows first. */
export interface ProposalPage<T> {
  rows: T[];
  /** Every stored proposal, across all pages. */
  total: number;
  /** How many of every stored proposal would change, across all pages. */
  changedTotal: number;
  currentPage: number;
  totalPages: number;
}

/**
 * Sorts proposals changed-first (then by id) and returns one page of them. The requested page is
 * clamped to the pages that exist, so a stale or hand-edited ?page= never gives an empty table.
 */
export function proposalPage<T extends { id: number; changed: boolean }>(
  all: readonly T[],
  requestedPage: number,
  perPage: number
): ProposalPage<T> {
  const sorted = [...all].sort((a, b) => Number(b.changed) - Number(a.changed) || a.id - b.id);
  const totalPages = Math.max(1, Math.ceil(sorted.length / perPage));
  const currentPage = Number.isInteger(requestedPage) ? Math.min(Math.max(requestedPage, 1), totalPages) : 1;
  const start = (currentPage - 1) * perPage;

  return {
    rows: sorted.slice(start, start + perPage),
    total: sorted.length,
    changedTotal: sorted.filter((p) => p.changed).length,
    currentPage,
    totalPages,
  };
}
