/**
 * Basic HTTP authentication for admin routes.
 *
 * Checks the `Authorization: Basic ...` header against the ADMIN_PASSWORD env var.
 * If ADMIN_PASSWORD is not set, access is granted unconditionally (dev convenience).
 * The expected username is "admin"; only the password is validated.
 */
export function requireAdminAuth(request: Request): Response | null {
  const adminPassword = process.env.ADMIN_PASSWORD;

  // If no password is configured, allow access (dev mode convenience)
  if (!adminPassword) {
    return null;
  }

  const authHeader = request.headers.get("Authorization");

  if (authHeader?.startsWith("Basic ")) {
    const decoded = atob(authHeader.slice(6));
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex !== -1) {
      const password = decoded.slice(separatorIndex + 1);
      if (password === adminPassword) {
        return null; // Authenticated
      }
    }
  }

  // Return a 401 response prompting the browser for Basic Auth credentials
  return new Response("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Admin Area"',
    },
  });
}
