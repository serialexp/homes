import RetrieveCommand from '../../src/commands/RetrieveCommand.js';
import { areas, propertyTypes } from '../data/propertyData.js';
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
    let totalPages = 0;
    let pagesDownloaded = 0;
    let lastStatusUpdate = Date.now();
    const UPDATE_INTERVAL = 2000; // Update status at most every 2 seconds
    let processingStartTime: Date | null = null;
    
    // Track which phase we're in
    let currentPhase: 'calculation' | 'download' | 'processing' = 'calculation';

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
          // Only update the fields that changed
          updateRetrievalStatusField({
            total: totalItems,
            message: `Found ${total} items to process`
          });
        });

        // Listen for page download progress
        retrieveCommand.on('page-download-progress', (pagesProcessed: number, pagesTotalNew: number) => {
          pagesDownloaded = pagesProcessed;
          totalPages = pagesTotalNew;

          // Only update if we're in the download phase
          if (currentPhase === 'download') {
            const estimatedCompletionTime = processingStartTime
              ? calculateEstimatedCompletionTime(processingStartTime, pagesDownloaded, totalPages)
              : undefined;

            updateRetrievalStatusField({
              progress: pagesDownloaded,
              total: totalPages,
              estimatedCompletionTime,
              message: `Downloading pages: ${pagesDownloaded}/${totalPages} pages (${Math.round((pagesDownloaded / totalPages) * 100)}%)`
            });
          }
        });

        // Listen for download progress
        retrieveCommand.on('download-progress', (sectionsProcessed: number, sectionsTotal: number, itemsTotal: number) => {
          // Only update if we're in the download phase
          if (currentPhase === 'download') {
            updateRetrievalStatusField({
              message: `Downloading pages: ${sectionsProcessed}/${sectionsTotal} sections (${itemsTotal} items found)`,
              sectionsProcessed,
              sectionsToFetch: sectionsTotal
            });
          }
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
          
          // If sections processed is reset to 0, we're moving to a new phase
          if (sectionsProcessedNew === 0) {
            // Determine which phase we're moving to based on current phase
            if (currentPhase === 'calculation') {
              currentPhase = 'download';
              processingStartTime = new Date();
              updateRetrievalStatusField({
                processingStartTime,
                message: `Starting download phase for ${totalPages} pages across ${sectionsToFetch} sections`,
                progress: 0,
                total: totalPages
              });
            } else if (currentPhase === 'download') {
              currentPhase = 'processing';
              processingStartTime = new Date();
              updateRetrievalStatusField({
                processingStartTime,
                message: `Starting processing phase for ${totalItems} items`,
                progress: 0,
                total: totalItems
              });
            }
            return;
          }
          
          // Calculate estimated completion time
          if (processingStartTime && sectionsProcessed > 0) {
            const estimatedCompletionTime = calculateEstimatedCompletionTime(
              processingStartTime,
              sectionsProcessed,
              sectionsToFetch
            );
            
            let message = '';
            switch (currentPhase) {
              case 'calculation':
                message = `Calculation phase: ${sectionsProcessed}/${sectionsToFetch} sections`;
                break;
              case 'download':
                message = `Download phase: ${sectionsProcessed}/${sectionsToFetch} sections (${pagesDownloaded}/${totalPages} pages)`;
                break;
              case 'processing':
                message = `Processing phase: ${sectionsProcessed}/${sectionsToFetch} sections`;
                break;
            }
            
            updateRetrievalStatusField({
              sectionsProcessed,
              estimatedCompletionTime,
              message
            });
          } else {
            updateRetrievalStatusField({
              sectionsProcessed
            });
          }
        });
        
        retrieveCommand.on('items-processed', (newProcessedItems: number, regionId: string, provinceId: string, type: string) => {
          processedItems = newProcessedItems;
          
          // Only update Redis if enough time has passed since the last update
          const now = Date.now();
          if (now - lastStatusUpdate >= UPDATE_INTERVAL) {
            lastStatusUpdate = now;
            
            const areaName = areas[regionId as keyof typeof areas].name;
            const provinceName = areas[regionId as keyof typeof areas].provinces[provinceId];
            const propertyTypeName = propertyTypes[type as keyof typeof propertyTypes];

            const estimatedCompletionTime = processingStartTime && processedItems > 0
              ? calculateEstimatedCompletionTime(processingStartTime, processedItems, totalItems)
              : undefined;

            updateRetrievalStatusField({
              message: `Processing items in ${areaName} ${provinceName} ${propertyTypeName} (${processedItems}/${totalItems})`,
              progress: processedItems,
              total: totalItems,
              estimatedCompletionTime
            });
          }
        });

        // Add cancellation check only before fetching pages (not for every item)
        retrieveCommand.on('before-page-fetch', async (page: number, totalPages: number) => {
          // Check if the process has been cancelled
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
          progress: processedItems,
          total: totalItems,
          startTime: new Date(),
          sectionsToFetch: sectionsToFetch,
          sectionsProcessed: sectionsProcessed,
          endTime: new Date(),
          processId
        });

        // Update the retrieval job record
        await completeRetrievalJob(processId, {
          status: 'completed',
          totalItems,
          processedItems,
          totalPages,
          downloadedPages: pagesDownloaded
        });

        return result;
      } catch (error) {
        // Check if the error is due to cancellation
        if (error instanceof Error && error.message === 'Retrieval process was cancelled') {
          await storeRetrievalStatus({
            status: 'cancelled',
            message: 'Retrieval process was cancelled by user',
            progress: processedItems,
            total: totalItems,
            startTime: new Date(),
            sectionsToFetch: sectionsToFetch,
            sectionsProcessed: sectionsProcessed,
            endTime: new Date(),
            processId
          });

          // Update the retrieval job record
          await completeRetrievalJob(processId, {
            status: 'cancelled',
            totalItems,
            processedItems,
            totalPages,
            downloadedPages: pagesDownloaded
          });
        } else {
          // Update status on error
          const errorMessage = error instanceof Error ? error.message : String(error);
          
          await storeRetrievalStatus({
            status: 'failed',
            message: 'Retrieval process failed',
            progress: processedItems,
            total: totalItems,
            startTime: new Date(),
            sectionsToFetch: sectionsToFetch,
            sectionsProcessed: sectionsProcessed,
            endTime: new Date(),
            error: errorMessage,
            processId
          });

          // Update the retrieval job record
          await completeRetrievalJob(processId, {
            status: 'failed',
            totalItems,
            processedItems,
            totalPages,
            downloadedPages: pagesDownloaded,
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