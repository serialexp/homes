import RetrieveCommand from '../../src/commands/RetrieveCommand.js';
import { storeRetrievalStatus, getRetrievalStatus, RetrievalStatus, isRetrievalCancelled, cancelRetrievalProcess, clearCancellationSignal, updateRetrievalStatusField } from './redis.server.js';
import { createRetrievalJob, completeRetrievalJob } from './retrievalJobService.server.js';
import { v4 as uuidv4 } from 'uuid';

// Create a singleton instance of RetrieveCommand
const retrieveCommand = new RetrieveCommand();

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
 * Start a new retrieval process
 */
export async function startRetrieval(options: {
  region?: string;
  province?: string;
  type?: string;
  refresh?: boolean;
}) {
  // Check if a retrieval is already running
  const currentStatus = await getRetrievalStatus();
  if (currentStatus && currentStatus.status === 'running') {
    throw new Error('A retrieval process is already running');
  }

  // Clear any existing cancellation signal
  await clearCancellationSignal();

  // Generate a unique process ID
  const processId = uuidv4();

  // Create a new retrieval job record
  await createRetrievalJob({
    processId,
    region: options.region,
    province: options.province,
    type: options.type,
    refresh: options.refresh || false
  });

  // Initialize status
  const initialStatus: RetrievalStatus = {
    status: 'running',
    message: 'Starting retrieval process...',
    progress: 0,
    total: 0,
    sectionsToFetch: 0,
    sectionsProcessed: 0,
    startTime: new Date(),
    processId
  };
  
  await storeRetrievalStatus(initialStatus);

  // Start the retrieval process in the background
  executeRetrieval(options, processId).catch(error => {
    console.error('Error in retrieval process:', error);
  });

  return {
    processId,
    message: 'Retrieval process started'
  };
}

/**
 * Execute the retrieval process
 */
async function executeRetrieval(options: {
  region?: string;
  province?: string;
  type?: string;
  refresh?: boolean;
}, processId: string) {
  try {
    // Add event listeners to track progress
    let totalItems = 0;
    let processedItems = 0;
    let sectionsToFetch = 0;
    let sectionsProcessed = 0;
    let pagesProcessed = 0;
    let lastStatusUpdate = Date.now();
    const UPDATE_INTERVAL = 2000; // Update status at most every 2 seconds
    let processingStartTime: Date | null = null;

    // Track which phase we're in (2-phase model: calculation → retrieval)
    let currentPhase: 'calculation' | 'retrieval' = 'calculation';

    // Override the original execute method to track progress
    const originalExecute = retrieveCommand.execute.bind(retrieveCommand);
    retrieveCommand.execute = async (input) => {
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

        // Execute the original method
        const result = await originalExecute(input);

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
        // Check if the error is due to cancellation
        if (error instanceof Error && error.message === 'Retrieval process was cancelled') {
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

    // Execute the command
    return await retrieveCommand.execute(options);
  } catch (error) {
    console.error('Error in executeRetrieval:', error);
    throw error;
  }
}

/**
 * Get the current retrieval status
 */
export async function getRetrievalProcessStatus() {
  return getRetrievalStatus();
}

/**
 * Cancel the current retrieval process
 */
export async function cancelRetrieval() {
  const status = await getRetrievalStatus();
  
  if (!status || status.status !== 'running') {
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

/**
 * Get the RetrieveCommand instance
 */
export function getRetrieveCommand() {
  return retrieveCommand;
} 