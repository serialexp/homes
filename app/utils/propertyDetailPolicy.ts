const HOUR_MS = 60 * 60 * 1000;

/** Details older than this are read again the next time someone views the property. */
export const DETAILS_MAX_AGE_MS = 7 * 24 * HOUR_MS;

/** A failed read is not retried sooner than this, so a broken page doesn't keep reaching Suumo. */
export const FAILED_RETRY_AFTER_MS = HOUR_MS;

export interface DetailState {
  /** When the detail page was last read successfully. */
  fetchedAt: Date | null;
  /** The state of the pending or last read, or null when none has been requested. */
  requestStatus: 'queued' | 'running' | 'failed' | null;
  requestedAt: Date | null;
}

/** True when viewing the property should queue a read of its Suumo detail page. */
export function shouldRequestDetails(state: DetailState, now: Date): boolean {
  if (state.fetchedAt && now.getTime() - state.fetchedAt.getTime() < DETAILS_MAX_AGE_MS) {
    return false;
  }
  if (state.requestStatus === 'queued' || state.requestStatus === 'running') {
    return false;
  }
  if (state.requestStatus === 'failed' && state.requestedAt && now.getTime() - state.requestedAt.getTime() < FAILED_RETRY_AFTER_MS) {
    return false;
  }
  return true;
}
