import type { ReactNode } from "react";
import { Form, NavLink } from "@remix-run/react";

/** Card surface shared by the admin pages. */
export const PANEL = "rounded-box border border-base-300 bg-base-100";

const BUTTON_BASE =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-field px-4 text-sm font-medium no-underline transition-colors disabled:cursor-not-allowed disabled:opacity-60";
export const BUTTON_PRIMARY = `${BUTTON_BASE} bg-primary font-semibold text-primary-content hover:bg-primary/90`;
export const BUTTON_SECONDARY = `${BUTTON_BASE} border border-base-300 bg-base-100 text-base-content hover:bg-base-200`;
export const BUTTON_DANGER = `${BUTTON_BASE} border border-error bg-base-100 font-semibold text-error hover:bg-error/5`;
export const BUTTON_DANGER_SOLID = `${BUTTON_BASE} bg-error font-semibold text-error-content hover:bg-error/90`;

export const INPUT =
  "min-h-11 w-full rounded-field border border-base-300 bg-base-100 px-3 text-sm text-base-content disabled:opacity-60";
export const LABEL = "text-sm font-semibold text-base-content/80";
/** Monospace block for JSON, HTML and other machine output. */
export const CODE_BLOCK =
  "m-0 overflow-auto whitespace-pre-wrap break-all rounded-field bg-neutral p-4 font-mono text-[13px] leading-relaxed text-neutral-content";

const STATUS_TONE: Record<string, string> = {
  queued: "bg-[#E4EBFB] text-[#1F3F99]",
  running: "bg-[#E4EBFB] text-[#1F3F99]",
  completed: "bg-[#E3F1E8] text-[#1A5C3A]",
  failed: "bg-[#FBEDEA] text-[#8F2414]",
  cancelled: "bg-[#FBF0D9] text-[#6E4400]",
};

/** Job or run status as a coloured pill. Unknown statuses fall back to a neutral tone. */
export function StatusPill({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? "bg-base-200 text-base-content/70";
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="m-0 font-display text-[clamp(26px,3.5vw,32px)] leading-[1.15] tracking-[-0.02em]">{title}</h1>
        {description && <p className="m-0 max-w-3xl text-base-content/70">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

const ADMIN_LINKS: { to: string; label: string; end?: boolean; icon: string }[] = [
  { to: "/admin", label: "Dashboard", end: true, icon: "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z" },
  { to: "/admin/retrieval", label: "Retrieval", end: true, icon: "M12 3v12M7 10l5 5 5-5M5 21h14" },
  { to: "/admin/retrieval/history", label: "Job history", icon: "M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 7v5l3 2" },
  { to: "/admin/rentals", label: "Rentals", icon: "M5 21V4h14v17M3 21h18M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" },
  { to: "/admin/reconcile", label: "Train lines", icon: "M7 3h10a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zM4 10h16M8 21l2-4M16 21l-2-4" },
  { to: "/admin/xpath-debug", label: "XPath debug", icon: "M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" },
];

/**
 * Side navigation for every admin screen. A column on wide screens, a
 * horizontally scrolling strip on phones.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6 px-4 pb-10 pt-6 sm:px-8 md:flex-row md:items-start md:gap-8 md:pt-8">
      <aside className="md:sticky md:top-6 md:w-56 md:shrink-0">
        <div className={`${PANEL} flex flex-col gap-2 p-2 md:p-3`}>
          <nav aria-label="Admin">
            <ul className="m-0 flex list-none gap-1 overflow-x-auto p-0 md:flex-col md:overflow-visible">
              {ADMIN_LINKS.map((link) => (
                <li key={link.to} className="shrink-0">
                  <NavLink
                    to={link.to}
                    end={link.end}
                    prefetch="intent"
                    className={({ isActive }) =>
                      `flex min-h-11 items-center gap-2.5 whitespace-nowrap rounded-field px-3 text-sm no-underline ${
                        isActive
                          ? "bg-base-200 font-semibold text-base-content"
                          : "font-medium text-base-content/80 hover:bg-base-200 hover:text-base-content"
                      }`
                    }
                  >
                    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                      <path d={link.icon} />
                    </svg>
                    {link.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <Form method="post" action="/admin/logout" className="md:mt-2 md:border-t md:border-base-300 md:pt-2">
            <button
              type="submit"
              className="flex min-h-11 w-full items-center gap-2.5 whitespace-nowrap rounded-field px-3 text-sm font-medium text-base-content/80 hover:bg-base-200 hover:text-base-content"
            >
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
              Logout
            </button>
          </Form>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col gap-6">{children}</div>
    </div>
  );
}
