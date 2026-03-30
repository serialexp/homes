import { createCookieSessionStorage, redirect } from "@remix-run/node";

const SESSION_SECRET = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || "dev-secret";

const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__admin_session",
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
    sameSite: "lax",
    secrets: [SESSION_SECRET],
    secure: process.env.NODE_ENV === "production",
  },
});

export async function getSession(request: Request) {
  return sessionStorage.getSession(request.headers.get("Cookie"));
}

export async function requireAdminAuth(request: Request) {
  const adminPassword = process.env.ADMIN_PASSWORD;

  // If no password configured, allow access (dev convenience)
  if (!adminPassword) {
    return;
  }

  const session = await getSession(request);
  if (session.get("authenticated")) {
    return;
  }

  const url = new URL(request.url);
  throw redirect(`/admin/login?redirectTo=${encodeURIComponent(url.pathname)}`);
}

export async function login(password: string) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword || password !== adminPassword) {
    return null;
  }

  const session = await sessionStorage.getSession();
  session.set("authenticated", true);
  return sessionStorage.commitSession(session);
}

export async function logout(request: Request) {
  const session = await getSession(request);
  return sessionStorage.destroySession(session);
}
