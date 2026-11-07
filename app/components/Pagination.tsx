import type { ReactNode } from "react";
import { Link } from "@remix-run/react";
import { pageWindow } from "../utils/pagination.js";

const PAGER_BASE = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-field px-3.5 text-sm no-underline";
const PAGER_IDLE = `${PAGER_BASE} border border-base-300 bg-base-100 font-medium text-base-content hover:bg-base-200`;
const PAGER_CURRENT = `${PAGER_BASE} border border-neutral bg-neutral font-semibold text-neutral-content`;
const PAGER_DISABLED = `${PAGER_BASE} border border-base-300 bg-base-100 text-base-content/40`;
const ELLIPSIS = "px-1 text-base-content/60";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  summary: ReactNode;
  pageHref: (page: number) => string;
}

export function Pagination({ currentPage, totalPages, summary, pageHref }: PaginationProps) {
  if (totalPages <= 1) return null;

  const { start, end } = pageWindow(currentPage, totalPages);
  const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-4">
      <span className="text-sm text-base-content/70">{summary}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {currentPage > 1 ? (
          <Link to={pageHref(currentPage - 1)} className={PAGER_IDLE}>Previous</Link>
        ) : (
          <span aria-disabled="true" className={PAGER_DISABLED}>Previous</span>
        )}

        {start > 1 && (
          <>
            <Link to={pageHref(1)} className={PAGER_IDLE}>1</Link>
            {start > 2 && <span aria-hidden="true" className={ELLIPSIS}>…</span>}
          </>
        )}

        {pages.map((page) => (
          <Link
            key={page}
            to={pageHref(page)}
            aria-current={page === currentPage ? "page" : undefined}
            className={page === currentPage ? PAGER_CURRENT : PAGER_IDLE}
          >
            {page}
          </Link>
        ))}

        {end < totalPages && (
          <>
            {end < totalPages - 1 && <span aria-hidden="true" className={ELLIPSIS}>…</span>}
            <Link to={pageHref(totalPages)} className={PAGER_IDLE}>{totalPages}</Link>
          </>
        )}

        {currentPage < totalPages ? (
          <Link to={pageHref(currentPage + 1)} className={PAGER_IDLE}>Next</Link>
        ) : (
          <span aria-disabled="true" className={PAGER_DISABLED}>Next</span>
        )}
      </div>
    </nav>
  );
}
