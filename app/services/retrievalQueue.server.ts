import { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { storeRetrievalStatus, getRetrievalStatus, clearCancellationSignal, cancelRetrievalProcess } from './redis.server.js';
import type { RetrievalStatus } from './redis.server.js';
import { enqueueRetrievalJob, completeRetrievalJob } from './retrievalJobService.server.js';

/**
 * Queue a retrieval for the worker process. The web process never runs one itself.
 * Throws if another retrieval is already queued or running.
 */
export async function enqueueRetrieval(options: {
  region?: string;
  province?: string;
  type?: string;
  refresh?: boolean;
}) {
  const processId = uuidv4();

  try {
    await enqueueRetrievalJob({
      processId,
      region: options.region,
      province: options.province,
      type: options.type,
      refresh: options.refresh || false
    });
  } catch (error) {
    // The active_slot unique index rejects a second active job
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && String(error.meta?.target).includes('activeSlot')) {
      throw new Error('A retrieval process is already running');
    }
    throw error;
  }

  // Clear any cancellation left over from a previous run, then show the job as queued
  await clearCancellationSignal();

  const initialStatus: RetrievalStatus = {
    status: 'queued',
    message: 'Waiting for the retrieval worker...',
    progress: 0,
    total: 0,
    sectionsToFetch: 0,
    sectionsProcessed: 0,
    startTime: new Date(),
    processId
  };

  await storeRetrievalStatus(initialStatus);

  return {
    processId,
    message: 'Retrieval process queued'
  };
}

/**
 * Get the current retrieval status
 */
export async function getRetrievalProcessStatus() {
  return getRetrievalStatus();
}

/**
 * Cancel the current retrieval process, whether it is queued or running
 */
export async function cancelRetrieval() {
  const status = await getRetrievalStatus();

  if (!status || (status.status !== 'running' && status.status !== 'queued')) {
    return false;
  }

  const success = await cancelRetrievalProcess();

  // If cancellation was successful and we have a process ID, update the job record
  if (success && status.processId) {
    try {
      await completeRetrievalJob(status.processId, {
        status: 'cancelled',
        totalItems: status.total,
        processedItems: status.progress
      });
    } catch (error) {
      console.error('Error updating retrieval job record:', error);
      // Don't fail the cancellation if the job record update fails
    }
  }

  return success;
}
