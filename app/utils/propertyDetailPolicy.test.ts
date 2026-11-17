import { describe, expect, it } from "vitest";
import { DETAILS_MAX_AGE_MS, FAILED_RETRY_AFTER_MS, shouldRequestDetails } from "./propertyDetailPolicy.js";

const now = new Date("2026-11-18T12:00:00.000Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("shouldRequestDetails", () => {
  it("requests details for a property never read", () => {
    expect(shouldRequestDetails({ fetchedAt: null, requestStatus: null, requestedAt: null }, now)).toBe(true);
  });

  it("does not request again while details are fresh", () => {
    expect(shouldRequestDetails({ fetchedAt: ago(DETAILS_MAX_AGE_MS - 1000), requestStatus: null, requestedAt: null }, now)).toBe(false);
  });

  it("requests again once details are older than the maximum age", () => {
    expect(shouldRequestDetails({ fetchedAt: ago(DETAILS_MAX_AGE_MS + 1000), requestStatus: null, requestedAt: null }, now)).toBe(true);
  });

  it("does not queue a second read while one is queued or running", () => {
    expect(shouldRequestDetails({ fetchedAt: null, requestStatus: "queued", requestedAt: ago(1000) }, now)).toBe(false);
    expect(shouldRequestDetails({ fetchedAt: null, requestStatus: "running", requestedAt: ago(1000) }, now)).toBe(false);
  });

  it("waits before retrying a failed read, then retries", () => {
    expect(shouldRequestDetails({ fetchedAt: null, requestStatus: "failed", requestedAt: ago(FAILED_RETRY_AFTER_MS - 1000) }, now)).toBe(false);
    expect(shouldRequestDetails({ fetchedAt: null, requestStatus: "failed", requestedAt: ago(FAILED_RETRY_AFTER_MS + 1000) }, now)).toBe(true);
  });
});
