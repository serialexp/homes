import {
  convertToDBFormat,
  findElementsRecursive,
  findFirstElementRecursive,
  parseArea,
  parseJapaneseAddress,
  parsePrice,
  PREFECTURES,
  type PropertyItem,
  type PropertyItemDB,
} from './parseUtils.js';

/**
 * Parser for Suumo's new-mansion (新築マンション) list pages, served by JJ011FC001. They use a different layout from
 * the other purchase types: each listing is a `cassette` card with label/value basics, one or more price phases
 * (第一期, 第二期, ...) and a photo carousel. A card is a whole project or a single unit; both are stored as one
 * Property, priced at the cheapest phase that has a price.
 */

const hasClass = (name: string) => new RegExp(`(^|\\s)${name}(\\s|$)`);

/** Text content with runs of whitespace collapsed. */
function text(element: Element | null | undefined): string {
  return (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function first(element: Element, nodeType: string, className: string): Element | null {
  return findFirstElementRecursive(element, nodeType, { class: hasClass(className) });
}

function all(element: Element, nodeType: string, className: string): Element[] {
  return findElementsRecursive(element, nodeType, { class: hasClass(className) });
}

/** The page's result total, from its hit count ("890件"). 0 when the page has none. */
export function newMansionTotalItems(document: Document): number {
  const hits = document.documentElement ? first(document.documentElement, 'div', 'hitbox-number') : null;
  const digits = text(hits).replace(/,/g, '').match(/^\d+/);
  return digits ? Number.parseInt(digits[0], 10) : 0;
}

/** One price phase of a card: what it costs, which layouts it offers and from what size. */
interface PricePhase {
  text: string;
  price: number;
  layout: string;
  area: number;
}

function parsePhase(item: Element): PricePhase {
  const accent = text(first(item, 'span', 'cassette_price-accent'));
  // "1LDK+S（納戸）・2LDK+S（納戸） / 78.8m2・83.11m2": layouts, then sizes. A range reads from its smallest.
  const description = text(first(item, 'p', 'cassette_price-description'));
  const split = description.lastIndexOf(' / ');
  const layout = split >= 0 ? description.slice(0, split).trim() : description;
  const areaText = split >= 0 ? description.slice(split + 3).trim() : '';
  return {
    text: text(first(item, 'div', 'cassette_price-value')) || accent,
    price: accent ? parsePrice(accent) : 0,
    layout,
    area: areaText ? parseArea(areaText) || 0 : 0,
  };
}

/** "東急東横線/祐天寺 徒歩3分" (or "徒歩5分～6分"): line, station and the shortest walk. */
function parseAccess(access: string): { line: string; station: string; walkingMinutes: number } {
  const route = access.match(/^([^/]+)\/(\S+)/);
  const walk = access.match(/徒歩(\d+)分/);
  return {
    line: route ? route[1].trim() : '',
    station: route ? route[2].trim() : '',
    walkingMinutes: walk ? Number.parseInt(walk[1], 10) : 0,
  };
}

/**
 * Parses one card. The address often leaves out the prefecture ("目黒区祐天寺１"); it is then taken from the
 * prefecture the page was searched for, so the stored address is complete.
 */
export function parseNewMansionCard(card: Element, provinceId: string): PropertyItem | null {
  const idInput = first(card, 'input', 'js-bsnckey');
  const suumoId = idInput?.getAttribute('value') ?? '';
  if (!suumoId) {
    return null;
  }
  const clipKey = first(card, 'input', 'js-clipkey')?.getAttribute('value') ?? '';

  const titleLink = first(card, 'a', 'cassette_header-title');
  const title = text(titleLink);
  const href = titleLink?.getAttribute('href') ?? '';

  const tagHolder = first(card, 'p', 'cassette_header-pct');
  const tags = tagHolder ? findElementsRecursive(tagHolder, 'span').map(text).filter(Boolean) : [];

  // A card with several photos shows a carousel; one with a single photo shows a plain thumbnail link. The carousel's
  // small navigation thumbnails repeat the same photos and are left out.
  const images = [...all(card, 'a', 'js-cassette_thumbcarousel-item'), ...all(card, 'a', 'cassette_thumb-link')]
    .map((link) => findFirstElementRecursive(link, 'img')?.getAttribute('rel') ?? '')
    .filter(Boolean);

  const basics: Record<string, string> = {};
  for (const item of all(card, 'div', 'cassette_basic-item')) {
    const label = text(first(item, 'p', 'cassette_basic-title'));
    const value = text(first(item, 'p', 'cassette_basic-value'));
    if (label && value) {
      basics[label] = value;
    }
  }

  let address = basics.所在地 ?? '';
  const prefecture = PREFECTURES[Number.parseInt(provinceId, 10) - 1];
  if (address && prefecture && !parseJapaneseAddress(address).province) {
    address = prefecture + address;
  }
  const addressParts = parseJapaneseAddress(address);
  const access = parseAccess(basics.交通 ?? '');

  const phases = all(card, 'li', 'cassette_price-list_item').map(parsePhase);
  const priced = phases.filter((phase) => phase.price > 0);
  const lead = priced.length > 0
    ? priced.reduce((cheapest, phase) => (phase.price < cheapest.price ? phase : cheapest))
    : phases[0];

  const additionalFields: Record<string, string> = {};
  for (const [label, value] of Object.entries(basics)) {
    if (label !== '所在地' && label !== '交通') {
      additionalFields[label] = value;
    }
  }

  return {
    suumo_id: suumoId,
    suumo_js_id: clipKey || suumoId,
    // The caller sets the type from the search section, as for the other purchase types.
    property_type: '',
    property_tags: tags,
    title,
    url: href.startsWith('http') ? href : `https://suumo.jp${href}`,
    main_image_url: images[0] ?? '',
    additional_image_urls: images.slice(1),
    property_name: title,
    price: lead?.price ?? 0,
    price_text: phases.map((phase) => phase.text).join(' / '),
    // A mansion unit has no land of its own; its size is the floor area.
    area: 0,
    land_area: 0,
    building_area: lead?.area ?? 0,
    type: lead?.layout || null,
    address,
    coverage: 0,
    volume: 0,
    train_line: access.line,
    train_station: access.station,
    station_distance: access.walkingMinutes,
    walking_minutes: access.walkingMinutes,
    postal_code: '',
    state: addressParts.province,
    city: addressParts.city,
    district: addressParts.district,
    additional_fields: additionalFields,
    insert_date: new Date().toISOString().split('T')[0],
  };
}

/** Every card on a new-mansion list page, in database format. */
export function parseNewMansionItemsForDB(document: Document, region: string, province: string): PropertyItemDB[] {
  const root = document.documentElement;
  if (!root) {
    return [];
  }
  return all(root, 'div', 'cassette')
    .map((card) => parseNewMansionCard(card, province))
    .filter((item): item is PropertyItem => item !== null)
    .map((item) => convertToDBFormat(item, region, province));
}
