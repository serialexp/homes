import type { LoaderFunctionArgs } from "@remix-run/node";
import { Outlet } from "@remix-run/react";
import { requireAdminAuth } from "../utils/auth.server.js";

export async function loader({ request }: LoaderFunctionArgs) {
  const authResponse = requireAdminAuth(request);
  if (authResponse) return authResponse;
  return null;
}

export default function AdminLayout() {
  return <Outlet />;
}
