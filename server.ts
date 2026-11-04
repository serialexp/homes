import { createRequestHandler } from "@remix-run/express";
import express from "express";

// Validate required environment variables
if (!process.env.DATABASE_URL) {
  console.error("FATAL: DATABASE_URL environment variable is required but not set.");
  process.exit(1);
}

// Warn about optional environment variables
if (!process.env.DEEPL_API_KEY) {
  console.warn("WARNING: DEEPL_API_KEY is not set. DeepL translation features will be unavailable.");
}
if (!process.env.MOONSHOT_API_KEY || !process.env.MOONSHOT_ENDPOINT) {
  console.warn("WARNING: MOONSHOT_API_KEY and/or MOONSHOT_ENDPOINT not set. LLM translation features will be unavailable.");
}

// Import Remix build
import * as build from "./build/server/index.js";

const app = express();
app.use(express.static("build/client"));

// Handle all routes with Remix. Retrieval jobs run in the worker process (src/worker.ts),
// so this process only serves requests.
app.all("*", createRequestHandler({ build }));

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`App listening on http://localhost:${port}`);
});
