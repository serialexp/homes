import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, useNavigation, useSearchParams } from "@remix-run/react";
import { getSession, login } from "../utils/auth.server.js";
import { BUTTON_PRIMARY, INPUT, LABEL, PANEL } from "../components/AdminUi.js";

// Only same-origin paths are valid redirect targets. Anything else (absolute
// URLs, protocol-relative "//host" or "/\host") falls back to the admin home.
function safeRedirectTarget(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return "/admin";
  }
  return value;
}

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
  const redirectTo = safeRedirectTarget(formData.get("redirectTo") as string | null);

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
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const [searchParams] = useSearchParams();
  const redirectTo = safeRedirectTarget(searchParams.get("redirectTo"));

  return (
    <div className="mx-auto flex w-full max-w-[1280px] justify-center px-4 py-12 sm:px-8 sm:py-20">
      <section aria-labelledby="login-h" className={`${PANEL} w-full max-w-sm p-6 sm:p-8`}>
        <h1 id="login-h" className="m-0 font-display text-[26px] font-bold tracking-[-0.02em]">
          Admin sign in
        </h1>
        <p className="mb-6 mt-1.5 text-sm text-base-content/70">Enter the admin password to continue.</p>

        <Form method="post" className="flex flex-col gap-4">
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className={LABEL}>
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoFocus
              autoComplete="current-password"
              aria-invalid={actionData?.error ? true : undefined}
              aria-describedby={actionData?.error ? "login-error" : undefined}
              className={INPUT}
            />
          </div>
          {actionData?.error && (
            <p id="login-error" role="alert" className="m-0 text-sm font-medium text-error">
              {actionData.error}
            </p>
          )}
          <button type="submit" className={`${BUTTON_PRIMARY} w-full`} disabled={isSubmitting}>
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </Form>
      </section>
    </div>
  );
}
