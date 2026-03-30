import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, useSearchParams } from "@remix-run/react";
import { getSession, login } from "../utils/auth.server.js";

export async function loader({ request }: LoaderFunctionArgs) {
  // If already logged in, redirect to admin
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return redirect("/admin");
  }

  const session = await getSession(request);
  if (session.get("authenticated")) {
    return redirect("/admin");
  }

  return null;
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const password = formData.get("password") as string;
  const redirectTo = formData.get("redirectTo") as string || "/admin";

  const sessionCookie = await login(password);
  if (!sessionCookie) {
    return json({ error: "Invalid password" }, { status: 401 });
  }

  return redirect(redirectTo, {
    headers: { "Set-Cookie": sessionCookie },
  });
}

export default function AdminLogin() {
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") || "/admin";

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-sm">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">Admin Login</h2>
        <Form method="post">
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <div className="mb-4">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoFocus
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          {actionData?.error && (
            <p className="text-red-600 text-sm mb-4">{actionData.error}</p>
          )}
          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Sign in
          </button>
        </Form>
      </div>
    </div>
  );
}
