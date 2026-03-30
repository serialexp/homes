import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { getRetrievalProcessStatus } from "../services/retrieveCommandService.server.js";

export async function loader({ request }: LoaderFunctionArgs) {
  const status = await getRetrievalProcessStatus();
  return json({ status });
}
