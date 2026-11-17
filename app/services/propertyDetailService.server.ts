import prisma from '../utils/db.server.js';
import type { PropertyDetailPage } from '../utils/propertyDetailParse.js';
import { shouldRequestDetails, type DetailState } from '../utils/propertyDetailPolicy.js';

/**
 * Queues a read of a property's Suumo detail page, when the state says one is due. Idempotent: a
 * queued or running read is left alone, so repeated page views queue one read.
 */
export async function requestPropertyDetails(propertyId: number, now: Date = new Date()): Promise<void> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { detail_fetched_at: true, detailRequest: { select: { status: true, requested_at: true } } },
  });
  if (!property) {
    return;
  }

  const state: DetailState = {
    fetchedAt: property.detail_fetched_at,
    requestStatus: (property.detailRequest?.status as DetailState['requestStatus']) ?? null,
    requestedAt: property.detailRequest?.requested_at ?? null,
  };
  if (!shouldRequestDetails(state, now)) {
    return;
  }

  await prisma.propertyDetailRequest.upsert({
    where: { property_id: propertyId },
    create: { property_id: propertyId, status: 'queued', requested_at: now },
    update: { status: 'queued', requested_at: now },
  });
}

/** Takes the oldest queued read and marks it running. Returns null when nothing is queued. */
export async function claimNextPropertyDetailRequest(): Promise<number | null> {
  const next = await prisma.propertyDetailRequest.findFirst({
    where: { status: 'queued' },
    orderBy: { requested_at: 'asc' },
    select: { property_id: true },
  });
  if (!next) {
    return null;
  }

  const { count } = await prisma.propertyDetailRequest.updateMany({
    where: { property_id: next.property_id, status: 'queued' },
    data: { status: 'running' },
  });
  return count === 1 ? next.property_id : null;
}

/** Reads left 'running' by a previous worker go back to the queue. Only valid while one worker runs. */
export async function recoverInterruptedPropertyDetailRequests(): Promise<void> {
  await prisma.propertyDetailRequest.updateMany({
    where: { status: 'running' },
    data: { status: 'queued' },
  });
}

/** Replaces a property's stored details with a fresh read, and clears its request, in one transaction. */
export async function savePropertyDetails(propertyId: number, page: PropertyDetailPage, now: Date = new Date()): Promise<void> {
  await prisma.$transaction([
    prisma.propertyDetailFact.deleteMany({ where: { property_id: propertyId } }),
    prisma.propertyPhoto.deleteMany({ where: { property_id: propertyId } }),
    prisma.propertyDetailFact.createMany({
      data: page.facts.map((fact, index) => ({ property_id: propertyId, sort_order: index, label: fact.label, value: fact.value })),
    }),
    prisma.propertyPhoto.createMany({
      data: page.photos.map((photo, index) => ({ property_id: propertyId, sort_order: index, url: photo.url, caption: photo.caption })),
    }),
    prisma.property.update({ where: { id: propertyId }, data: { detail_fetched_at: now } }),
    prisma.propertyDetailRequest.deleteMany({ where: { property_id: propertyId } }),
  ]);
}

/** Records a failed read. The property keeps any details it already had. */
export async function failPropertyDetailRequest(propertyId: number, message: string, now: Date = new Date()): Promise<void> {
  await prisma.propertyDetailRequest.updateMany({
    where: { property_id: propertyId },
    data: { status: 'failed', requested_at: now, last_error: message, attempts: { increment: 1 } },
  });
}

/** Drops a read whose property no longer exists. */
export async function dropPropertyDetailRequest(propertyId: number): Promise<void> {
  await prisma.propertyDetailRequest.deleteMany({ where: { property_id: propertyId } });
}

/** The stored details for the property page, with the state of its latest read. */
export async function getPropertyDetails(propertyId: number) {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      detail_fetched_at: true,
      details: { orderBy: { sort_order: 'asc' }, select: { label: true, value: true } },
      photos: { orderBy: { sort_order: 'asc' }, select: { url: true, caption: true } },
      detailRequest: { select: { status: true, last_error: true } },
    },
  });
  if (!property) {
    return null;
  }
  return {
    fetchedAt: property.detail_fetched_at,
    facts: property.details,
    photos: property.photos,
    requestStatus: property.detailRequest?.status ?? null,
    lastError: property.detailRequest?.last_error ?? null,
  };
}
