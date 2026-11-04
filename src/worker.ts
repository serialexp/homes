import { startRetrievalWorker } from '../app/services/retrievalWorker.server.js';

// Runs retrieval jobs queued by the web app. Exits on startup failure so the
// container restarts and retries the recovery step.
startRetrievalWorker().catch(error => {
  console.error('Retrieval worker failed to start:', error);
  process.exit(1);
});
