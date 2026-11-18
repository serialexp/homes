import { readFileSync } from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';
import { newMansionTotalItems, parseNewMansionItemsForDB } from './newMansionParseUtils.js';

const html = readFileSync(new URL('./__fixtures__/suumo-new-mansion-list-tokyo.html', import.meta.url), 'utf8');
const quiet = { warning() {}, error() {}, fatalError() {} };
const parse = (source: string) => new DOMParser({ errorHandler: quiet }).parseFromString(source, 'text/html');

describe('new-mansion list page (JJ011FC001)', () => {
  const document = parse(html);
  const items = parseNewMansionItemsForDB(document, '030', '13');
  const byId = (id: string) => {
    const item = items.find((candidate) => candidate.suumo_id === id);
    if (!item) throw new Error(`no item ${id}`);
    return item;
  };

  it('reads the result total from the hit count', () => {
    expect(newMansionTotalItems(document)).toBe(890);
  });

  it('parses every card, keyed like the other purchase types (type code + Suumo id)', () => {
    expect(items.map((item) => item.suumo_id)).toEqual([
      '01067738170',
      '01022190093',
      '01067731070',
      '01067734465',
      '01067733954',
    ]);
    expect(byId('01067738170').suumo_js_id).toBe('67738170_010');
  });

  it('reads a project: name, link, pills, photos, access, handover date and its price list', () => {
    const item = byId('01067738170');
    expect(item.title).toBe('フォルステラス祐天寺');
    expect(item.property_name).toBe('フォルステラス祐天寺');
    expect(item.url).toBe('https://suumo.jp/ms/shinchiku/tokyo/sc_meguro/nc_67738170/');
    expect(item.property_tags).toBe('新着');
    expect(item.main_image_url).toContain('67738170_000022.jpg');
    expect(item.additional_image_urls?.split(',')).toHaveLength(4);
    expect(item.train_line).toBe('東急東横線');
    expect(item.train_station).toBe('祐天寺');
    expect(item.walking_minutes).toBe(3);
    expect(JSON.parse(item.additional_fields ?? '{}')).toEqual({ 引渡時期: '2027年1月下旬予定' });

    // "9980万円・1億2480万円／予定": priced from the lower figure, with the whole text kept.
    expect(item.price).toBe(99_800_000);
    expect(item.price_text).toBe('9980万円・1億2480万円／予定 （第一期）');
    expect(item.type).toBe('1LDK+S（納戸）・2LDK+S（納戸）');
    expect(item.building_area).toBe(78.8);
    expect(item.area).toBe(0);
  });

  it('completes an address that leaves out the prefecture, from the searched prefecture', () => {
    const item = byId('01067738170');
    expect(item.address).toBe('東京都目黒区祐天寺１');
    expect(item.state).toBe('東京都');
    expect(item.city).toBe('目黒区');
    expect(item.district).toBe('祐天寺１');
    // An address that already names it is left as it is.
    expect(byId('01022190093').address).toBe('東京都世田谷区松原１');
  });

  it('reads a single unit with one photo shown as a plain thumbnail', () => {
    const item = byId('01022190093');
    expect(item.price).toBe(69_100_000);
    expect(item.price_text).toBe('6910万円');
    expect(item.type).toBe('1DK');
    expect(item.building_area).toBe(32.43);
    expect(item.main_image_url).toContain('22190093_0001.jpg');
    expect(item.additional_image_urls).toBe('');
  });

  it('prices a card with several phases at its cheapest priced phase, and keeps every phase in the text', () => {
    // 7368万円～, 6400万円台～／予定 and 6988万円～: the 6400万 phase leads, with its layouts and smallest size.
    const phases = byId('01067731070');
    expect(phases.price).toBe(64_000_000);
    expect(phases.type).toBe('2LDK+S（納戸）～4LDK');
    expect(phases.building_area).toBe(62.72);
    expect(phases.price_text?.split(' / ')).toHaveLength(3);
    // "徒歩5分～6分" reads as the shorter walk.
    expect(phases.walking_minutes).toBe(5);

    // Four phases, one of them 価格未定: the cheapest priced one (5048万) leads.
    const mixed = byId('01067733954');
    expect(mixed.price).toBe(50_480_000);
    expect(mixed.type).toBe('1LDK');
    expect(mixed.building_area).toBe(32.48);
    expect(mixed.price_text?.split(' / ')).toHaveLength(4);
    expect(mixed.price_text).toContain('価格未定');
  });

  it('stores an undecided price as 0, with the layouts and size of its only phase', () => {
    const item = byId('01067734465');
    expect(item.price).toBe(0);
    expect(item.price_text).toBe('価格未定 （第1期4次）');
    expect(item.type).toBe('2LDK～4LDK');
    expect(item.building_area).toBe(55.55);
  });

  it('finds nothing on a page without cards', () => {
    const empty = parse('<html><body><p>該当する物件がありません</p></body></html>');
    expect(parseNewMansionItemsForDB(empty, '030', '13')).toEqual([]);
    expect(newMansionTotalItems(empty)).toBe(0);
  });
});
