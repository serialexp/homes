import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { getReconcileJobStatus } from "../services/reconcileLinesService.server.js";

export async function loader({ request: _request }: LoaderFunctionArgs) {
  const status = await getReconcileJobStatus();
  return json({ status });
}
