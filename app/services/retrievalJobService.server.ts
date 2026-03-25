import prisma from '../utils/db.server.js';
import type { RetrievalJob } from '@prisma/client';

/**
 * Create a new retrieval job record
 */
export async function createRetrievalJob(data: {
  processId: string;
  region?: string;
  province?: string;
  type?: string;
  refresh: boolean;
}) {
  return prisma.retrievalJob.create({
    data: {
      processId: data.processId,
      status: 'running',
      region: data.region || null,
      province: data.province || null,
      type: data.type || null,
      refresh: data.refresh
    }
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