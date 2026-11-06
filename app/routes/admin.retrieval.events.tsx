import type { LoaderFunctionArgs } from "@remix-run/node";
import { subscribeRetrievalStatus } from "../services/redis.server.js";
import { getRetrievalProcessStatus } from "../services/retrievalQueue.server.js";
import { requireAdminAuth } from "../utils/auth.server.js";

const HEARTBEAT_MS = 15_000;

/**
 * Server-sent events of retrieval progress. Sends the current status on connect, then every
 * change the worker publishes. A comment line every few seconds keeps idle connections open.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdminAuth(request);

  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let closeSubscription: (() => Promise<void>) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  // Both a client disconnect and a server-side cancel end up here; only the first one does any work
  const teardown = async () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    await closeSubscription?.();
    try {
      controller.close();
    } catch {
      // Already closed by the stream machinery
    }
  };

  const send = (chunk: string) => {
    if (!closed) {
      controller.enqueue(encoder.encode(chunk));
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(streamController) {
      controller = streamController;
      // Subscribe before reading the snapshot, so no change can fall between the two
      closeSubscription = await subscribeRetrievalStatus(status => {
        send(`data: ${JSON.stringify(status)}\n\n`);
      });
      send(`data: ${JSON.stringify(await getRetrievalProcessStatus())}\n\n`);
      heartbeat = setInterval(() => send(": keep-alive\n\n"), HEARTBEAT_MS);
      request.signal.addEventListener("abort", () => {
        void teardown();
      });
    },
    cancel: teardown
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
