import { describe, expect, it } from 'vitest';
import { PREFECTURES, locationFromAddress, prefectureCode, regionOfProvince } from './parseUtils.js';

describe('prefectureCode', () => {
  it('returns the JIS code for a prefecture name', () => {
    expect(prefectureCode('北海道')).toBe('01');
    expect(prefectureCode('東京都')).toBe('13');
    expect(prefectureCode('神奈川県')).toBe('14');
    expect(prefectureCode('沖縄県')).toBe('47');
  });

  it('returns null for anything that is not a prefecture', () => {
    expect(prefectureCode('')).toBeNull();
    expect(prefectureCode('東京')).toBeNull();
    expect(prefectureCode('Tokyo')).toBeNull();
  });

  it('lists 47 distinct prefectures', () => {
    expect(PREFECTURES).toHaveLength(47);
    expect(new Set(PREFECTURES).size).toBe(47);
  });
});

describe('regionOfProvince', () => {
  it('finds a region for every prefecture code', () => {
    for (let code = 1; code <= 47; code++) {
      const province = String(code).padStart(2, '0');
      expect(regionOfProvince(province), `province ${province}`).not.toBeNull();
    }
  });

  it('puts Tokyo and Kanagawa in the same region', () => {
    expect(regionOfProvince('13')).not.toBeNull();
    expect(regionOfProvince('13')).toBe(regionOfProvince('14'));
  });
});

describe('locationFromAddress', () => {
  it('takes the province and region from the address, not from the search section', () => {
    const fallback = { region: regionOfProvince('14')!, province: '14' };
    expect(locationFromAddress('東京都', fallback)).toEqual({ region: regionOfProvince('13'), province: '13' });
  });

  it('keeps the search section when the address has no known prefecture', () => {
    const fallback = { region: regionOfProvince('14')!, province: '14' };
    expect(locationFromAddress('', fallback)).toEqual(fallback);
    expect(locationFromAddress('どこか', fallback)).toEqual(fallback);
  });
});
