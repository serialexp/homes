import { createRequestHandler } from "@remix-run/express";
import express from "express";
import cron from "node-cron";

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

// Import the RetrieveCommand service
import { getRetrieveCommand, startRetrieval } from "./app/services/retrieveCommandService.server.js";
import { getRedisClient, storeRetrievalStatus } from "./app/services/redis.server.js";

const app = express();
app.use(express.static("build/client"));

// Initialize Redis connection
async function initializeRedis() {
  try {
    const redisClient = await getRedisClient();
    console.log("Redis connection established");
    
    // Initialize retrieval status if not exists
    await storeRetrievalStatus({
      status: 'idle',
      message: 'No retrieval process running',
      progress: 0,
      total: 0,
      startTime: new Date(),
      sectionsToFetch: 0,
      sectionsProcessed: 0
    });
  } catch (error) {
    console.error("Failed to connect to Redis:", error);
  }
}

// Initialize Redis
initializeRedis().catch(console.error);

// Schedule the retrieve command to run daily at 10:30
cron.schedule("30 10 * * *", async () => {
  console.log("Running scheduled data retrieval...");
  try {
    await startRetrieval({ refresh: true });
    console.log("Data retrieval scheduled successfully");
  } catch (error) {
    console.error("Error scheduling data retrieval:", error);
  }
});

console.log("Data retrieval scheduler initialized (runs daily at 10:30)");

// Handle all routes with Remix
app.all("*", createRequestHandler({ build }));

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`App listening on http://localhost:${port}`);
}); 