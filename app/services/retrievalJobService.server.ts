import prisma from '../utils/db.server.js';
import type { RetrievalJob } from '@prisma/client';
import type { SectionSummary } from '../../src/commands/RetrieveCommand.js';

/**
 * Enqueue a retrieval job record. The worker picks it up via claimNextQueuedJob.
 * Throws a Prisma P2002 error if another job already holds the active slot.
 */
export async function enqueueRetrievalJob(data: {
  processId: string;
  region?: string;
  province?: string;
  type?: string;
  refresh: boolean;
}) {
  return prisma.retrievalJob.create({
    data: {
      processId: data.processId,
      status: 'queued',
      activeSlot: 'active',
      region: data.region || null,
      province: data.province || null,
      type: data.type || null,
      refresh: data.refresh
    }
  });
}

/**
 * Atomically move the oldest queued job to 'running' and return it.
 * Returns null when nothing is queued, or when the job was cancelled between
 * the read and the update.
 */
export async function claimNextQueuedJob(): Promise<RetrievalJob | null> {
  const next = await prisma.retrievalJob.findFirst({
    where: { status: 'queued' },
    orderBy: { id: 'asc' }
  });
  if (!next) {
    return null;
  }

  const { count } = await prisma.retrievalJob.updateMany({
    where: { id: next.id, status: 'queued' },
    data: { status: 'running' }
  });
  if (count === 0) {
    return null;
  }

  return { ...next, status: 'running' };
}

/**
 * Find jobs left 'running' by a previous worker process. Only valid while exactly
 * one worker runs, since any 'running' row is then necessarily orphaned at startup.
 */
export async function findInterruptedJobs(): Promise<RetrievalJob[]> {
  return prisma.retrievalJob.findMany({
    where: { status: 'running' }
  });
}

/**
 * Update a retrieval job record when it completes
 */
export async function completeRetrievalJob(processId: string, data: {
  status: 'completed' | 'failed' | 'cancelled';
  totalItems?: number;
  processedItems?: number;
  totalPages?: number;
  downloadedPages?: number;
  errorMessage?: string;
}) {
  return prisma.retrievalJob.update({
    where: { processId },
    data: {
      status: data.status,
      activeSlot: null,
      endTime: new Date(),
      totalItems: data.totalItems || 0,
      processedItems: data.processedItems || 0,
      totalPages: data.totalPages || 0,
      downloadedPages: data.downloadedPages || 0,
      errorMessage: data.errorMessage
    }
  });
}

/**
 * Store what one search section did during a job, as it finishes.
 */
export async function recordRetrievalJobSection(processId: string, section: SectionSummary) {
  await prisma.retrievalJob.update({
    where: { processId },
    data: {
      sections: {
        create: {
          sectionKey: section.sectionKey,
          regionId: section.regionId,
          provinceId: section.provinceId,
          sectionType: section.sectionType,
          calcTotalItems: section.calcTotalItems,
          scrapedPages: section.scrapedPages,
          computedPages: section.computedPages,
          totalPages: section.totalPages,
          pagesFetched: section.pagesFetched,
          itemsProcessed: section.itemsProcessed,
          newItems: section.newItems,
          updatedItems: section.updatedItems,
          stopReason: section.stopReason,
          startedAt: section.startedAt,
          finishedAt: section.finishedAt,
          errorMessage: section.errorMessage
        }
      }
    }
  });
}

/**
 * Get a retrieval job with its per-section rows, in the order the sections ran.
 */
export async function getRetrievalJobWithSections(id: number) {
  return prisma.retrievalJob.findUnique({
    where: { id },
    include: { sections: { orderBy: { id: 'asc' } } }
  });
}

/**
 * Get all retrieval jobs with pagination
 */
export async function getRetrievalJobs(page: number = 1, limit: number = 10) {
  const skip = (page - 1) * limit;
  
  const [jobs, total] = await Promise.all([
    prisma.retrievalJob.findMany({
      skip,
      take: limit,
      orderBy: { startTime: 'desc' }
    }),
    prisma.retrievalJob.count()
  ]);
  
  return {
    jobs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

/**
 * Get a specific retrieval job by ID
 */
export async function getRetrievalJobById(id: number) {
  return prisma.retrievalJob.findUnique({
    where: { id }
  });
}

/**
 * Get a specific retrieval job by process ID
 */
export async function getRetrievalJobByProcessId(processId: string) {
  return prisma.retrievalJob.findUnique({
    where: { processId }
  });
}

/**
 * Get the most recent retrieval job
 */
export async function getMostRecentRetrievalJob() {
  return prisma.retrievalJob.findFirst({
    orderBy: { startTime: 'desc' }
  });
}

/**
 * Get statistics about retrieval jobs
 */
export async function getRetrievalJobStats() {
  const total = await prisma.retrievalJob.count();
  const completed = await prisma.retrievalJob.count({
    where: { status: 'completed' }
  });
  const failed = await prisma.retrievalJob.count({
    where: { status: 'failed' }
  });
  const cancelled = await prisma.retrievalJob.count({
    where: { status: 'cancelled' }
  });
  
  return {
    total,
    completed,
    failed,
    cancelled,
    successRate: total > 0 ? Math.round((completed / total) * 100) : 0
  };
} 