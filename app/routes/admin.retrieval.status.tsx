import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { getRetrievalProcessStatus } from "../services/retrievalQueue.server.js";
import { requireAdminAuth } from "../utils/auth.server.js";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdminAuth(request);
  const status = await getRetrievalProcessStatus();
  return json({ status });
}
