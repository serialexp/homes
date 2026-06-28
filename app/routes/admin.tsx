import type { LoaderFunctionArgs } from "@remix-run/node";
import { Form, NavLink, Outlet } from "@remix-run/react";
import { requireAdminAuth } from "../utils/auth.server.js";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdminAuth(request);
  return null;
}

const ADMIN_LINKS: { to: string; label: string; end?: boolean }[] = [
  { to: "/admin", label: "Dashboard", end: true },
  { to: "/admin/retrieval", label: "Retrieval" },
  { to: "/admin/retrieval/history", label: "Job History" },
  { to: "/admin/rentals", label: "Rentals" },
  { to: "/admin/reconcile", label: "Train Lines" },
  { to: "/admin/xpath-debug", label: "XPath Debug" },
];

export default function AdminLayout() {
  return (
    <>
      <div className="bg-base-200 border-b border-base-300 px-4 py-1 flex items-center justify-between gap-4 overflow-x-auto">
        <nav className="flex items-center gap-1 text-sm">
          {ADMIN_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              prefetch="intent"
              className={({ isActive }) =>
                `px-3 py-1 rounded whitespace-nowrap ${
                  isActive
                    ? "bg-blue-600 text-white"
                    : "text-base-content/70 hover:bg-base-300"
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <Form method="post" action="/admin/logout">
          <button
            type="submit"
            className="text-sm text-base-content/60 hover:text-base-content/70 whitespace-nowrap"
          >
            Logout
          </button>
        </Form>
      </div>
      <Outlet />
    </>
  );
}
