import { createClient } from 'redis';

// Redis client singleton
let redisClient: ReturnType<typeof createClient> | null = null;

/**
 * Get or create a Redis client
 */
export async function getRedisClient() {
  if (!redisClient) {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    redisClient = createClient({ url });
    
    // Handle connection errors
    redisClient.on('error', (err) => {
      console.error('Redis connection error:', err);
    });
    
    // Connect to Redis
    await redisClient.connect();
  }
  
  return redisClient;
}

/**
 * Set a value in Redis with optional expiration
 */
export async function setRedisValue(key: string, value: string, expirationSeconds?: number) {
  const client = await getRedisClient();
  
  if (expirationSeconds) {
    await client.setEx(key, expirationSeconds, value);
  } else {
    await client.set(key, value);
  }
}

/**
 * Get a value from Redis
 */
export async function getRedisValue(key: string): Promise<string | null> {
  const client = await getRedisClient();
  return client.get(key);
}

/**
 * Set a hash field in Redis
 */
export async function setRedisHash(key: string, field: string, value: string) {
  const client = await getRedisClient();
  await client.hSet(key, field, value);
}

/**
 * Get a hash field from Redis
 */
export async function getRedisHash(key: string, field: string): Promise<string | null> {
  const client = await getRedisClient();
  const result = await client.hGet(key, field);
  return result === undefined ? null : result;
}

/**
 * Get all hash fields from Redis
 */
export async function getAllRedisHash(key: string): Promise<Record<string, string>> {
  const client = await getRedisClient();
  return client.hGetAll(key);
}

/**
 * Store retrieval command status in Redis
 */
export async function storeRetrievalStatus(status: RetrievalStatus) {
  const key = 'retrieval:status';
  // Clear all previous fields before writing new status
  const client = await getRedisClient();
  await client.del(key);
  await setRedisHash(key, 'status', status.status);
  await setRedisHash(key, 'message', status.message);
  await setRedisHash(key, 'progress', status.progress.toString());
  await setRedisHash(key, 'total', status.total.toString());
  await setRedisHash(key, 'sectionsToFetch', status.sectionsToFetch.toString());
  await setRedisHash(key, 'sectionsProcessed', status.sectionsProcessed.toString());
  await setRedisHash(key, 'startTime', status.startTime.toISOString());
  
  if (status.endTime) {
    await setRedisHash(key, 'endTime', status.endTime.toISOString());
  }
  
  if (status.estimatedCompletionTime) {
    await setRedisHash(key, 'estimatedCompletionTime', status.estimatedCompletionTime.toISOString());
  }
  
  if (status.processingStartTime) {
    await setRedisHash(key, 'processingStartTime', status.processingStartTime.toISOString());
  }
  
  await setRedisHash(key, 'error', status.error || '');
  
  if (status.processId) {
    await setRedisHash(key, 'processId', status.processId);
  }
}

/**
 * Get retrieval command status from Redis
 */
export async function getRetrievalStatus(): Promise<RetrievalStatus | null> {
  const key = 'retrieval:status';
  const data = await getAllRedisHash(key);
  
  if (!data || Object.keys(data).length === 0) {
    return null;
  }
  
  const status: RetrievalStatus = {
    status: data.status as 'idle' | 'running' | 'completed' | 'failed' | 'cancelled',
    message: data.message,
    progress: parseInt(data.progress || '0', 10),
    total: parseInt(data.total || '0', 10),
    sectionsToFetch: parseInt(data.sectionsToFetch || '0', 10),
    sectionsProcessed: parseInt(data.sectionsProcessed || '0', 10),
    startTime: new Date(data.startTime),
    processId: data.processId
  };
  
  if (data.endTime) {
    status.endTime = new Date(data.endTime);
  }
  
  if (data.error) {
    status.error = data.error;
  }
  
  if (data.estimatedCompletionTime) {
    status.estimatedCompletionTime = new Date(data.estimatedCompletionTime);
  }
  
  if (data.processingStartTime) {
    status.processingStartTime = new Date(data.processingStartTime);
  }
  
  return status;
}

/**
 * Check if a retrieval process has been cancelled
 */
export async function isRetrievalCancelled(processId: string): Promise<boolean> {
  // Check the dedicated cancellation key first
  const cancellationKey = 'retrieval:cancellation';
  const cancelledProcessId = await getRedisValue(cancellationKey);
  
  // If there's a cancellation signal and it matches the current process ID, or it's '*' (cancel all)
  if (cancelledProcessId && (cancelledProcessId === processId || cancelledProcessId === '*')) {
    return true;
  }
  
  // Fallback to checking the status (for backward compatibility)
  const status = await getRetrievalStatus();
  return !status || status.processId !== processId || status.status === 'cancelled';
}

/**
 * Cancel the current retrieval process
 */
export async function cancelRetrievalProcess(): Promise<boolean> {
  const status = await getRetrievalStatus();
  
  if (!status || status.status !== 'running') {
    return false;
  }
  
  // Set the cancellation signal with the process ID
  const cancellationKey = 'retrieval:cancellation';
  if (status.processId) {
    await setRedisValue(cancellationKey, status.processId, 3600); // Expire after 1 hour
  } else {
    // If no process ID, use a wildcard to cancel any running process
    await setRedisValue(cancellationKey, '*', 3600);
  }
  
  // Also update the status (for UI and backward compatibility)
  await storeRetrievalStatus({
    ...status,
    status: 'cancelled',
    message: 'Retrieval process cancelled by user',
    endTime: new Date()
  });
  
  return true;
}

/**
 * Clear any existing cancellation signal
 */
export async function clearCancellationSignal(): Promise<void> {
  const cancellationKey = 'retrieval:cancellation';
  await clearRedisValue(cancellationKey);
}

/**
 * Clear redis value
 */
export async function clearRedisValue(key: string) {
  const client = await getRedisClient();
  await client.del(key);
}

/**
 * Retrieval status interface
 */
export interface RetrievalStatus {
  status: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';
  message: string;
  progress: number;
  total: number;
  sectionsToFetch: number;
  sectionsProcessed: number;
  startTime: Date;
  endTime?: Date;
  error?: string;
  processId?: string;
  estimatedCompletionTime?: Date;
  processingStartTime?: Date; // When actual processing started (after initial setup)
}

/**
 * Update specific fields of the retrieval status without overwriting the entire object
 * This is more efficient than updating the entire status object
 */
export async function updateRetrievalStatusField(fields: Partial<RetrievalStatus>) {
  const client = await getRedisClient();
  const key = 'retrieval:status';
  
  // Use multi to batch Redis operations
  const multi = client.multi();
  
  // Only update the fields that are provided
  for (const [fieldName, value] of Object.entries(fields)) {
    if (value !== undefined) {
      // Convert value to string based on its type
      let stringValue: string;
      if (value instanceof Date) {
        stringValue = value.toISOString();
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        stringValue = value.toString();
      } else {
        stringValue = value as string;
      }
      
      multi.hSet(key, fieldName, stringValue);
    }
  }
  
  // Execute all commands in a single round trip
  await multi.exec();
} 