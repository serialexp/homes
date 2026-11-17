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

const PHOTO_PREFIX = "https://img01.suumo.com/jj/resizeImage?src=gazo";

const collapse = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();

/** Suumo's link text next to a value, e.g. "[ □支払シミュレーション ]". It is not part of the value. */
const stripLinkText = (text: string) => text.replace(/\[[^\]]*\]/g, "").trim();

/** Same label however Suumo typed it: full-width and half-width brackets are the same label. */
const labelKey = (label: string) => label.normalize("NFKC");

/** The parser reports every Suumo markup quirk through the error handler. They are not ours to act on. */
const quietParser = new DOMParser({
  errorHandler: { warning: () => {}, error: () => {}, fatalError: () => {} },
});

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
 * Reads the spec table and the photo gallery from a Suumo detail page. Labels are the
 * `th` cells that carry Suumo's side-label styling; each value is the `td` that follows.
 * Photos are the unique resize URLs in the page, in the order they appear.
 */
export function parsePropertyDetailPage(html: string): PropertyDetailPage {
  const document = quietParser.parseFromString(html, "text/html");

  const facts: PropertyDetailFact[] = [];
  const seenLabels = new Set<string>();
  const headers = document.getElementsByTagName("th");
  for (let i = 0; i < headers.length; i++) {
    const th = headers[i] as Element;
    if (!(th.getAttribute("class") ?? "").includes("thSideLGray")) {
      continue;
    }
    const labelElement = th.getElementsByTagName("div")[0] as Element | undefined;
    const label = collapse(labelElement ? labelElement.textContent : th.textContent);
    const cell = nextElement(th);
    const value = cell && cell.tagName === "td" ? stripLinkText(collapse(cell.textContent)) : "";
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

  return { facts, photos };
}
