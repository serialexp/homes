import { fetchSuumoHtml } from '../../src/commands/suumoClient.js';
import prisma from '../utils/db.server.js';
import { parsePropertyDetailPage } from '../utils/propertyDetailParse.js';
import {
  claimNextPropertyDetailRequest,
  dropPropertyDetailRequest,
  failPropertyDetailRequest,
  savePropertyDetails,
} from './propertyDetailService.server.js';

const POLL_INTERVAL_MS = 2000;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Only pages on Suumo's own site are read; anything else is refused before a request is made. */
function isSuumoDetailUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && (parsed.hostname === 'suumo.jp' || parsed.hostname.endsWith('.suumo.jp'));
  } catch {
    return false;
  }
}

/**
 * Reads queued property detail pages, one at a time, for as long as the worker runs. Requests go through the
 * shared Suumo client, so they share the retrieval pace. A failed read is recorded on the request, not retried here.
 */
export async function runPropertyDetailLoop(): Promise<void> {
  while (true) {
    let propertyId: number | null;
    try {
      propertyId = await claimNextPropertyDetailRequest();
    } catch (error) {
      console.error('Property detail queue could not be read:', error);
      await sleep(POLL_INTERVAL_MS);
      continue;
    }
    if (propertyId === null) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    try {
      const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { url: true } });
      if (!property) {
        await dropPropertyDetailRequest(propertyId);
        continue;
      }
      if (!isSuumoDetailUrl(property.url)) {
        throw new Error(`Refusing to read a non-Suumo listing URL: ${property.url}`);
      }

      const html = await fetchSuumoHtml(property.url);
      await savePropertyDetails(propertyId, parsePropertyDetailPage(html));
      console.log(`Property ${propertyId}: details read from Suumo`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Property ${propertyId}: details could not be read: ${message}`);
      await failPropertyDetailRequest(propertyId, message).catch(recordError => {
        console.error(`Property ${propertyId}: failure could not be recorded:`, recordError);
      });
    }
  }
}
