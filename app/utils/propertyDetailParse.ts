import { DOMParser } from "@xmldom/xmldom";

/** One row of the Suumo spec table, as Suumo labels it. */
export interface PropertyDetailFact {
  label: string;
  value: string;
}

/** One photo from the Suumo detail gallery. `url` is the resize URL Suumo serves it at. */
export interface PropertyDetailPhoto {
  url: string;
  caption: string;
}

export interface PropertyDetailPage {
  facts: PropertyDetailFact[];
  photos: PropertyDetailPhoto[];
}

/** A parsed page, with the link to its full outline (物件概要) when the page itself only shows a summary. */
export interface ParsedPropertyDetailPage extends PropertyDetailPage {
  outlineUrl: string | null;
}

const PHOTO_PREFIX = "https://img01.suumo.com/jj/resizeImage?src=gazo";

const collapse = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();

/** Suumo's link text next to a value, e.g. "[ □支払シミュレーション ]". It is not part of the value. */
const stripLinkText = (text: string) => text.replace(/\[[^\]]*\]/g, "").trim();

/**
 * The header cells that label a spec row: `thSideLGray` on resale listing and new mansion unit pages,
 * `overview_table-title` on a new mansion project's summary, `detailtable-title` on its outline page.
 */
const LABEL_CELL = /(^|\s)(thSideLGray|overview_table-title|detailtable-title)(\s|$)/;

/** The "地図を見る" link Suumo puts beside a new mansion's address. It is not part of the value. */
const MAP_LINK = /(^|\s)\S*_map(\s|$)/;

/** Same label however Suumo typed it: full-width and half-width brackets are the same label. */
const labelKey = (label: string) => label.normalize("NFKC");

/** The parser reports every Suumo markup quirk through the error handler. They are not ours to act on. */
const quietParser = new DOMParser({
  errorHandler: { warning: () => {}, error: () => {}, fatalError: () => {} },
});

/** A cell's text, with line breaks read as spaces and without the map link beside an address. */
function cellText(node: Node): string {
  let text = "";
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === 3) {
      text += child.nodeValue ?? "";
      continue;
    }
    if (child.nodeType !== 1) {
      continue;
    }
    const element = child as Element;
    if (element.tagName === "br") {
      text += " ";
    } else if (!(element.tagName === "a" && MAP_LINK.test(element.getAttribute("class") ?? ""))) {
      text += cellText(element);
    }
  }
  return text;
}

/**
 * The page's link to its outline sub-page (`<page>/property/`), without Suumo's tracking query.
 * Only a new mansion project page has one.
 */
function outlineUrlOf(document: Document, pageUrl: string): string | null {
  let page: URL;
  try {
    page = new URL(pageUrl);
  } catch {
    return null;
  }
  const outlinePath = `${page.pathname.replace(/\/?$/, "/")}property/`;
  const anchors = document.getElementsByTagName("a");
  for (let i = 0; i < anchors.length; i++) {
    const href = (anchors[i] as Element).getAttribute("href");
    if (!href) {
      continue;
    }
    let target: URL;
    try {
      target = new URL(href, page);
    } catch {
      continue;
    }
    if (target.origin === page.origin && target.pathname === outlinePath) {
      return `${target.origin}${target.pathname}`;
    }
  }
  return null;
}

/** The element after `node` in document order, skipping text nodes. */
function nextElement(node: Node | null): Element | null {
  let sibling = node?.nextSibling ?? null;
  while (sibling && sibling.nodeType !== 1) {
    sibling = sibling.nextSibling;
  }
  return sibling as Element | null;
}

/** The photo's identity: the source file name inside the resize URL, e.g. 21745243_0003.jpg. */
function photoKey(url: string): string | null {
  const match = url.match(/src=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Reads the spec table and the photo gallery from a Suumo detail page at `pageUrl`. Labels are the
 * `th` cells with one of Suumo's spec-label classes; each value is the `td` that follows.
 * Photos are the unique resize URLs in the page, in the order they appear.
 */
export function parsePropertyDetailPage(html: string, pageUrl: string): ParsedPropertyDetailPage {
  const document = quietParser.parseFromString(html, "text/html");

  const facts: PropertyDetailFact[] = [];
  const seenLabels = new Set<string>();
  const headers = document.getElementsByTagName("th");
  for (let i = 0; i < headers.length; i++) {
    const th = headers[i] as Element;
    if (!LABEL_CELL.test(th.getAttribute("class") ?? "")) {
      continue;
    }
    const labelElement = th.getElementsByTagName("div")[0] as Element | undefined;
    const label = collapse(labelElement ? labelElement.textContent : th.textContent);
    const cell = nextElement(th);
    const value = cell && cell.tagName === "td" ? stripLinkText(collapse(cellText(cell))) : "";
    // Suumo repeats the table for its summary blocks; the first occurrence of a label wins
    if (!label || !value || value === "-" || seenLabels.has(labelKey(label))) {
      continue;
    }
    seenLabels.add(labelKey(label));
    facts.push({ label, value });
  }

  const photos: PropertyDetailPhoto[] = [];
  const seen = new Set<string>();
  const images = document.getElementsByTagName("img");
  for (let i = 0; i < images.length; i++) {
    const img = images[i] as Element;
    const url = img.getAttribute("rel") || img.getAttribute("src") || "";
    if (!url.startsWith(PHOTO_PREFIX)) {
      continue;
    }
    const key = photoKey(url);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    photos.push({ url, caption: collapse(img.getAttribute("alt")) });
  }

  return { facts, photos, outlineUrl: outlineUrlOf(document, pageUrl) };
}
