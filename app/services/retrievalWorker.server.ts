import cron from 'node-cron';
import { claimNextQueuedJob, completeRetrievalJob, findInterruptedJobs, getRetrievalJobByProcessId } from './retrievalJobService.server.js';
import { getRetrievalStatus, storeRetrievalStatus } from './redis.server.js';
import type { RetrievalStatus } from './redis.server.js';
import { runRetrievalJob } from './retrieveCommandService.server.js';
import { enqueueRetrieval } from './retrievalQueue.server.js';

const POLL_INTERVAL_MS = 5000;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fail jobs left 'running' by a previous worker and make the Redis status agree.
 * Only valid while exactly one worker runs: any 'running' row is then orphaned.
 */
async function recoverInterruptedJobs() {
  const previousStatus = await getRetrievalStatus();
  const interrupted = await findInterruptedJobs();
  const interruptedIds = new Set(interrupted.map(job => job.processId));

  for (const job of interrupted) {
    await completeRetrievalJob(job.processId, {
      status: 'failed',
      totalItems: job.totalItems,
      processedItems: job.processedItems,
      totalPages: job.totalPages,
      downloadedPages: job.downloadedPages,
      errorMessage: 'Interrupted by worker restart'
    });
    console.warn(`Retrieval job ${job.processId} was interrupted by worker restart, marked as failed`);
  }

  if (!previousStatus) {
    return;
  }

  const stillQueued = previousStatus.status === 'queued' && previousStatus.processId
    ? (await getRetrievalJobByProcessId(previousStatus.processId))?.status === 'queued'
    : false;

  if (previousStatus.status === 'running' && previousStatus.processId && interruptedIds.has(previousStatus.processId)) {
    await storeRetrievalStatus({
      ...previousStatus,
      status: 'failed',
      message: 'Interrupted by worker restart',
      endTime: new Date()
    });
  } else if ((previousStatus.status === 'running' || previousStatus.status === 'queued') && !stillQueued) {
    await resetStatusToIdle();
  }
}

async function resetStatusToIdle() {
  const idleStatus: RetrievalStatus = {
    status: 'idle',
    message: 'No retrieval process running',
    progress: 0,
    total: 0,
    sectionsToFetch: 0,
    sectionsProcessed: 0,
    startTime: new Date()
  };
  await storeRetrievalStatus(idleStatus);
}

/**
 * Claim and run queued jobs one at a time, forever. Sleeps only when the queue is empty.
 */
async function workLoop() {
  while (true) {
    const job = await claimNextQueuedJob();
    if (!job) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    console.log(`Starting retrieval job ${job.processId}`);
    try {
      await runRetrievalJob(job);
    } catch (error) {
      console.error(`Retrieval job ${job.processId} threw:`, error);
      // runRetrievalJob records its own outcome; this only catches failures before it
      // got that far, so the job does not hold the active slot forever.
      const row = await getRetrievalJobByProcessId(job.processId);
      if (row?.status === 'running') {
        await completeRetrievalJob(job.processId, {
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }
}

/**
 * Entry point for the worker process: recover from the last run, schedule the
 * nightly retrieval, then process the queue.
 */
export async function startRetrievalWorker() {
  await recoverInterruptedJobs();

  cron.schedule("30 10 * * *", async () => {
    console.log("Running scheduled data retrieval...");
    try {
      await enqueueRetrieval({ refresh: true });
      console.log("Data retrieval queued successfully");
    } catch (error) {
      console.error("Error queueing scheduled data retrieval:", error);
    }
  });

  console.log("Data retrieval scheduler initialized (runs daily at 10:30)");
  console.log("Retrieval worker started");

  await workLoop();
}
