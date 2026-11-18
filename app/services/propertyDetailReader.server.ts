import { type PropertyDetailPage, parsePropertyDetailPage } from '../utils/propertyDetailParse.js';

/**
 * Reads a listing's details from Suumo. A new mansion project page only shows a summary and links to its
 * outline page (物件概要); the facts then come from the outline page, and the photos from the listing page.
 */
export async function readPropertyDetailPage(
  url: string,
  fetchHtml: (url: string) => Promise<string>,
): Promise<PropertyDetailPage> {
  const page = parsePropertyDetailPage(await fetchHtml(url), url);
  if (!page.outlineUrl) {
    return { facts: page.facts, photos: page.photos };
  }
  const outline = parsePropertyDetailPage(await fetchHtml(page.outlineUrl), page.outlineUrl);
  return { facts: outline.facts.length > 0 ? outline.facts : page.facts, photos: page.photos };
}
