import type { LoaderFunctionArgs } from "@remix-run/node";
import { Form, Outlet } from "@remix-run/react";
import { requireAdminAuth } from "../utils/auth.server.js";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdminAuth(request);
  return null;
}

export default function AdminLayout() {
  return (
    <>
      <div className="bg-base-200 border-b border-base-300 px-4 py-1 flex justify-end">
        <Form method="post" action="/admin/logout">
          <button type="submit" className="text-sm text-base-content/60 hover:text-base-content/70">
            Logout
          </button>
        </Form>
      </div>
      <Outlet />
    </>
  );
}
