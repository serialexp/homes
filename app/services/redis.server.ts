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

const RETRIEVAL_STATUS_KEY = 'retrieval:status';

/** Every state a retrieval can report. 'unknown' is what a status hash without a readable state reads as. */
export const RETRIEVAL_STATUSES = ['unknown', 'idle', 'queued', 'running', 'completed', 'failed', 'cancelled'] as const;

/**
 * Retrieval status interface
 */
export interface RetrievalStatus {
  status: (typeof RETRIEVAL_STATUSES)[number];
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
 * The hash fields that describe a status. Unset optional fields are left out, so they read back as unset.
 */
export function retrievalStatusFields(status: RetrievalStatus): Record<string, string> {
  const fields: Record<string, string> = {
    status: status.status,
    message: status.message,
    progress: status.progress.toString(),
    total: status.total.toString(),
    sectionsToFetch: status.sectionsToFetch.toString(),
    sectionsProcessed: status.sectionsProcessed.toString(),
    startTime: status.startTime.toISOString(),
    error: status.error || '',
  };

  if (status.endTime) fields.endTime = status.endTime.toISOString();
  if (status.estimatedCompletionTime) fields.estimatedCompletionTime = status.estimatedCompletionTime.toISOString();
  if (status.processingStartTime) fields.processingStartTime = status.processingStartTime.toISOString();
  if (status.processId) fields.processId = status.processId;

  return fields;
}

/**
 * Read a status hash. Returns null when there is no hash at all. A hash whose status is missing or
 * not a known name reads as 'unknown', so a partial or foreign value never breaks the readers.
 */
export function parseRetrievalStatus(data: Record<string, string>): RetrievalStatus | null {
  if (Object.keys(data).length === 0) {
    return null;
  }

  const state = (RETRIEVAL_STATUSES as readonly string[]).includes(data.status)
    ? (data.status as RetrievalStatus['status'])
    : 'unknown';

  const status: RetrievalStatus = {
    status: state,
    message: data.message ?? '',
    progress: parseInt(data.progress || '0', 10),
    total: parseInt(data.total || '0', 10),
    sectionsToFetch: parseInt(data.sectionsToFetch || '0', 10),
    sectionsProcessed: parseInt(data.sectionsProcessed || '0', 10),
    startTime: new Date(data.startTime),
    processId: data.processId,
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
 * Store retrieval command status in Redis
 */
export async function storeRetrievalStatus(status: RetrievalStatus) {
  const client = await getRedisClient();
  // One MULTI: the previous fields are dropped and the new ones land together,
  // so no reader can see a half-written status.
  await client
    .multi()
    .del(RETRIEVAL_STATUS_KEY)
    .hSet(RETRIEVAL_STATUS_KEY, retrievalStatusFields(status))
    .exec();

  await publishRetrievalStatus();
}

/**
 * Get retrieval command status from Redis
 */
export async function getRetrievalStatus(): Promise<RetrievalStatus | null> {
  return parseRetrievalStatus(await getAllRedisHash(RETRIEVAL_STATUS_KEY));
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

  if (!status || (status.status !== 'running' && status.status !== 'queued')) {
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
 * Update specific fields of the retrieval status without overwriting the entire object
 * This is more efficient than updating the entire status object
 */
export async function updateRetrievalStatusField(fields: Partial<RetrievalStatus>) {
  const client = await getRedisClient();

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

      multi.hSet(RETRIEVAL_STATUS_KEY, fieldName, stringValue);
    }
  }

  // Execute all commands in a single round trip
  await multi.exec();

  await publishRetrievalStatus();
}

const RETRIEVAL_STATUS_CHANNEL = 'retrieval:status:events';

/**
 * Publish the current status so admin pages can follow progress without polling.
 * The worker publishes; the web process forwards to browsers (see subscribeRetrievalStatus).
 */
async function publishRetrievalStatus() {
  const status = await getRetrievalStatus();
  if (status) {
    const client = await getRedisClient();
    await client.publish(RETRIEVAL_STATUS_CHANNEL, JSON.stringify(status));
  }
}

/**
 * Subscribe to status changes. Returns a function that closes the subscription.
 * Uses its own connection, since a subscribed Redis client can't run other commands.
 */
export async function subscribeRetrievalStatus(onStatus: (status: RetrievalStatus) => void): Promise<() => Promise<void>> {
  const subscriber = (await getRedisClient()).duplicate();
  subscriber.on('error', err => {
    console.error('Redis subscriber error:', err);
  });
  await subscriber.connect();
  await subscriber.subscribe(RETRIEVAL_STATUS_CHANNEL, message => {
    onStatus(JSON.parse(message) as RetrievalStatus);
  });

  return async () => {
    await subscriber.quit();
  };
}
