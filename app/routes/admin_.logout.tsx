import type { ActionFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { logout } from "../utils/auth.server.js";

export async function action({ request }: ActionFunctionArgs) {
  const cookie = await logout(request);
  return redirect("/admin/login", {
    headers: { "Set-Cookie": cookie },
  });
}

// Redirect GET requests to admin
export async function loader() {
  return redirect("/admin");
}
