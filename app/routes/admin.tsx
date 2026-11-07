import type { LoaderFunctionArgs } from "@remix-run/node";
import { Outlet } from "@remix-run/react";
import { AdminShell } from "../components/AdminUi.js";
import { requireAdminAuth } from "../utils/auth.server.js";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdminAuth(request);
  return null;
}

export default function AdminLayout() {
  return (
    <AdminShell>
      <Outlet />
    </AdminShell>
  );
}
