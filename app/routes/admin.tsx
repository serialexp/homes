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
      <div className="bg-gray-100 border-b border-gray-200 px-4 py-1 flex justify-end">
        <Form method="post" action="/admin/logout">
          <button type="submit" className="text-sm text-gray-500 hover:text-gray-700">
            Logout
          </button>
        </Form>
      </div>
      <Outlet />
    </>
  );
}
