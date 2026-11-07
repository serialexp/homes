import { describe, expect, it } from "vitest";
import { parseRetrievalStatus, retrievalStatusFields, type RetrievalStatus } from "./redis.server.js";

const full: RetrievalStatus = {
  status: "running",
  message: "Found 12 items",
  progress: 3,
  total: 12,
  sectionsToFetch: 4,
  sectionsProcessed: 1,
  startTime: new Date("2026-11-07T10:30:00.000Z"),
  endTime: new Date("2026-11-07T11:00:00.000Z"),
  error: "boom",
  processId: "p-1",
  estimatedCompletionTime: new Date("2026-11-07T11:20:00.000Z"),
  processingStartTime: new Date("2026-11-07T10:31:00.000Z"),
};

describe("retrievalStatusFields and parseRetrievalStatus", () => {
  it("round-trips a full status", () => {
    expect(parseRetrievalStatus(retrievalStatusFields(full))).toEqual(full);
  });

  it("leaves unset optional fields out of the hash", () => {
    const minimal: RetrievalStatus = {
      status: "queued",
      message: "Waiting",
      progress: 0,
      total: 0,
      sectionsToFetch: 0,
      sectionsProcessed: 0,
      startTime: new Date("2026-11-07T10:30:00.000Z"),
    };
    const fields = retrievalStatusFields(minimal);
    expect(fields).not.toHaveProperty("endTime");
    expect(fields).not.toHaveProperty("processId");
    expect(fields).not.toHaveProperty("processingStartTime");
    expect(parseRetrievalStatus(fields)).toEqual({ ...minimal, error: undefined, processId: undefined });
  });

  it("reads an empty hash as no status", () => {
    expect(parseRetrievalStatus({})).toBeNull();
  });

  it("reads a hash without a status field as 'unknown' instead of failing", () => {
    const parsed = parseRetrievalStatus({ message: "partial", progress: "4" });
    expect(parsed).not.toBeNull();
    expect(parsed?.status).toBe("unknown");
    expect(parsed?.message).toBe("partial");
    expect(parsed?.progress).toBe(4);
  });

  it("reads an unrecognised status name as 'unknown'", () => {
    expect(parseRetrievalStatus({ status: "exploded", message: "" })?.status).toBe("unknown");
  });

  it("accepts every known status name", () => {
    for (const name of ["idle", "queued", "running", "completed", "failed", "cancelled"]) {
      expect(parseRetrievalStatus({ status: name, message: "" })?.status).toBe(name);
    }
  });
});
