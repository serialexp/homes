import RetrieveCommand, { type SectionSummary } from '../../src/commands/RetrieveCommand.js';
import { storeRetrievalStatus, isRetrievalCancelled, updateRetrievalStatusField } from './redis.server.js';
import { completeRetrievalJob, recordRetrievalJobSection } from './retrievalJobService.server.js';
import type { RetrievalJob } from '@prisma/client';

const CANCELLED_MESSAGE = 'Retrieval process was cancelled';

/**
 * Calculate estimated completion time based on progress so far
 */
function calculateEstimatedCompletionTime(
  processingStartTime: Date,
  unitsProcessed: number,
  unitsTotal: number
): Date | undefined {
  if (unitsProcessed === 0 || unitsTotal === 0) {
    return undefined;
  }

  const elapsedMs = Date.now() - processingStartTime.getTime();
  const avgTimePerUnitMs = elapsedMs / unitsProcessed;
  const remainingUnits = unitsTotal - unitsProcessed;
  const remainingTimeMs = avgTimePerUnitMs * remainingUnits;

  return new Date(Date.now() + remainingTimeMs);
}

/**
 * Execute the retrieval process
 */
async function executeRetrieval(options: {
  region?: string;
  province?: string;
  type?: string;
}, processId: string) {
  try {
    // A fresh command per run: its listeners and cancel flag are per-run state
    const retrieveCommand = new RetrieveCommand();

    // Add event listeners to track progress
    let totalItems = 0;
    let processedItems = 0;
    let sectionsToFetch = 0;
    let sectionsProcessed = 0;
    let pagesProcessed = 0;
    let lastStatusUpdate = Date.now();
    const UPDATE_INTERVAL = 2000; // Update status at most every 2 seconds
    let processingStartTime: Date | null = null;
    // Section rows are written as each section finishes. They must all be stored
    // before the job row is marked done, so every path awaits this list.
    const sectionWrites: Promise<void>[] = [];

    // Track which phase we're in (2-phase model: calculation → retrieval)
    let currentPhase: 'calculation' | 'retrieval' = 'calculation';

    // Wrap the run to track progress and record its outcome
    const runJob = async (input: { region?: string; province?: string; type?: string }) => {
      try {
        // Update status before starting
        await storeRetrievalStatus({
          status: 'running',
          message: 'Starting retrieval process...',
          progress: 0,
          total: 0,
          startTime: new Date(),
          sectionsToFetch: 0,
          sectionsProcessed: 0,
          processId,
          error: undefined
        });

        // Add event listeners for progress tracking
        retrieveCommand.on('total-items', (total) => {
          totalItems = total;
          updateRetrievalStatusField({
            total: totalItems,
            message: `Found ${total} items across all sections`
          });
        });

        retrieveCommand.on('sections-to-fetch', (sectionsToFetchNew: number) => {
          sectionsToFetch = sectionsToFetchNew;

          // Set processing start time when we first get sections to fetch
          if (!processingStartTime) {
            processingStartTime = new Date();
            updateRetrievalStatusField({
              processingStartTime,
              sectionsToFetch,
              message: `Starting calculation phase for ${sectionsToFetch} sections`
            });
          } else {
            updateRetrievalStatusField({
              sectionsToFetch
            });
          }
        });

        retrieveCommand.on('sections-processed', (sectionsProcessedNew: number) => {
          sectionsProcessed = sectionsProcessedNew;

          // If sections processed is reset to 0, we're transitioning from calculation to retrieval
          if (sectionsProcessedNew === 0 && currentPhase === 'calculation') {
            currentPhase = 'retrieval';
            processingStartTime = new Date();
            updateRetrievalStatusField({
              processingStartTime,
              message: `Starting retrieval phase for ${sectionsToFetch} sections (${totalItems} items, sorted by recency)`,
              progress: 0,
              total: sectionsToFetch
            });
            return;
          }

          // Calculate estimated completion time
          if (processingStartTime && sectionsProcessed > 0) {
            const estimatedCompletionTime = calculateEstimatedCompletionTime(
              processingStartTime,
              sectionsProcessed,
              sectionsToFetch
            );

            const message = currentPhase === 'calculation'
              ? `Calculation phase: ${sectionsProcessed}/${sectionsToFetch} sections`
              : `Retrieval phase: ${sectionsProcessed}/${sectionsToFetch} sections`;

            updateRetrievalStatusField({
              sectionsProcessed,
              progress: sectionsProcessed,
              total: sectionsToFetch,
              estimatedCompletionTime,
              message
            });
          } else {
            updateRetrievalStatusField({
              sectionsProcessed
            });
          }
        });

        // Per-section progress: tracks pages fetched and items found within a section
        retrieveCommand.on('section-progress', (sectionKey: string, page: number, totalPages: number, newItems: number, updatedItems: number) => {
          pagesProcessed++;

          const now = Date.now();
          if (now - lastStatusUpdate >= UPDATE_INTERVAL) {
            lastStatusUpdate = now;
            updateRetrievalStatusField({
              message: `Retrieving ${sectionKey}: page ${page}/${totalPages} (${newItems} new, ${updatedItems} updated)`
            });
          }
        });

        retrieveCommand.on('section-early-stop', (sectionKey: string, page: number, totalPages: number) => {
          updateRetrievalStatusField({
            message: `${sectionKey}: caught up at page ${page}/${totalPages}, moving to next section`
          });
        });

        retrieveCommand.on('section-timeout', (sectionKey: string, page: number, totalPages: number) => {
          updateRetrievalStatusField({
            message: `${sectionKey}: timed out at page ${page}/${totalPages}, moving to next section`
          });
        });

        // Track total items processed across all sections for job completion reporting.
        // items-processed emits cumulative count per section, so we track the last
        // section key and reset when it changes.
        let lastItemsSectionKey = '';
        let lastSectionItemCount = 0;
        retrieveCommand.on('items-processed', (sectionProcessedItems: number, regionId: string, provinceId: string, type: string) => {
          const sectionKey = `${regionId}-${provinceId}-${type}`;
          if (sectionKey !== lastItemsSectionKey) {
            // New section started — the previous section's total was already accumulated
            lastItemsSectionKey = sectionKey;
            lastSectionItemCount = 0;
          }
          // Accumulate the delta since the last event within this section
          processedItems += (sectionProcessedItems - lastSectionItemCount);
          lastSectionItemCount = sectionProcessedItems;
        });

        // Add cancellation check before fetching pages
        retrieveCommand.on('before-page-fetch', async (page: number, totalPages: number) => {
          const cancelled = await isRetrievalCancelled(processId);
          if (cancelled) {
            retrieveCommand.cancelled = true;
          }
        });

        retrieveCommand.on('section-finished', (summary: SectionSummary) => {
          sectionWrites.push(
            recordRetrievalJobSection(processId, summary).catch(error => {
              console.error(`Could not record section ${summary.sectionKey} for job ${processId}:`, error);
            })
          );
        });

        const result = await retrieveCommand.execute(input);
        await Promise.all(sectionWrites);

        // The command returns normally when cancelled, so check the flag to record a cancellation
        if (retrieveCommand.cancelled) {
          throw new Error(CANCELLED_MESSAGE);
        }

        // Update status on completion
        await storeRetrievalStatus({
          status: 'completed',
          message: 'Retrieval process completed successfully',
          progress: sectionsProcessed,
          total: sectionsToFetch,
          startTime: new Date(),
          sectionsToFetch,
          sectionsProcessed,
          endTime: new Date(),
          processId
        });

        // Update the retrieval job record
        await completeRetrievalJob(processId, {
          status: 'completed',
          totalItems,
          processedItems,
          totalPages: pagesProcessed,
          downloadedPages: pagesProcessed
        });

        return result;
      } catch (error) {
        await Promise.all(sectionWrites);
        // Check if the error is due to cancellation
        if (error instanceof Error && error.message === CANCELLED_MESSAGE) {
          await storeRetrievalStatus({
            status: 'cancelled',
            message: 'Retrieval process was cancelled by user',
            progress: sectionsProcessed,
            total: sectionsToFetch,
            startTime: new Date(),
            sectionsToFetch,
            sectionsProcessed,
            endTime: new Date(),
            processId
          });

          await completeRetrievalJob(processId, {
            status: 'cancelled',
            totalItems,
            processedItems,
            totalPages: pagesProcessed,
            downloadedPages: pagesProcessed
          });
        } else {
          const errorMessage = error instanceof Error ? error.message : String(error);

          await storeRetrievalStatus({
            status: 'failed',
            message: 'Retrieval process failed',
            progress: sectionsProcessed,
            total: sectionsToFetch,
            startTime: new Date(),
            sectionsToFetch,
            sectionsProcessed,
            endTime: new Date(),
            error: errorMessage,
            processId
          });

          await completeRetrievalJob(processId, {
            status: 'failed',
            totalItems,
            processedItems,
            totalPages: pagesProcessed,
            downloadedPages: pagesProcessed,
            errorMessage
          });
        }
        throw error;
      } finally {
        // Remove all event listeners to prevent memory leaks
        retrieveCommand.removeAllListeners();
      }
    };

    return await runJob(options);
  } catch (error) {
    if (!(error instanceof Error && error.message === CANCELLED_MESSAGE)) {
      console.error('Error in executeRetrieval:', error);
    }
    throw error;
  }
}

/**
 * Run a job claimed from the queue. Progress and outcome go to Redis and the
 * retrieval_job row, which is where the web process reads them.
 */
export async function runRetrievalJob(job: RetrievalJob) {
  try {
    await executeRetrieval({
      region: job.region ?? undefined,
      province: job.province ?? undefined,
      type: job.type ?? undefined
    }, job.processId);
  } catch (error) {
    // A user cancel is an expected outcome, already recorded in Redis and the job row
    if (error instanceof Error && error.message === CANCELLED_MESSAGE) {
      return;
    }
    throw error;
  }
} 