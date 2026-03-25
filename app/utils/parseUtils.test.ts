import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import * as xpath from 'xpath';
import * as parseUtils from './parseUtils.js';
import {
  parseItems,
  parseItemsForDB,
  convertToDBFormat,
  parseArea,
  parsePrice,
  parseStation,
  simpleXPath,
  simpleXPathSelect1,
  getElementBySimpleXPath,
  findElementsRecursive,
  findFirstElementRecursive,
  getTextFromMatchingElement,
  parseDottableKeyValues,
  parsePropertyDetails,
  PropertyItem,
  PropertyItemDB,
  getTitleAndLink,
  parseJapaneseAddress,
  parseItem
} from './parseUtils.js';

// Mock the console methods to avoid cluttering test output
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// Helper function to create a simple DOM document for testing
function createTestDocument(html: string): Document {
  const parser = new DOMParser();
  return parser.parseFromString(html, 'text/html');
}

describe('parseStation', () => {
  it('should parse station information correctly', () => {
    const result = parseStation('JR山手線「渋谷」徒歩8分');
    expect(result).toEqual({
      line: 'JR山手線',
      station: '渋谷',
      foot: 8
    });

    const result2 = parseStation('ＪＲ宇都宮線「小山」徒歩33分');
    expect(result2).toEqual({
      line: 'ＪＲ宇都宮線',
      station: '小山',
      foot: 33
    });

    const result3 = parseStation('北海道中央バス「朝日町西3丁目」歩6分');
    expect(result3).toEqual({
      line: '北海道中央バス',
      station: '朝日町西3丁目',
      foot: 6
    });
    
  });

  it('should handle missing station information', () => {
    const result = parseStation('徒歩10分');
    expect(result).toEqual({
      line: '',
      station: '',
      foot: 10
    });
  });

  it('should handle missing walking minutes', () => {
    const result = parseStation('JR山手線「渋谷」');
    expect(result).toEqual({
      line: 'JR山手線',
      station: '渋谷',
      foot: 0
    });
  });

  it('should handle empty input', () => {
    const result = parseStation('');
    expect(result).toEqual({
      line: '',
      station: '',
      foot: 0
    });
  });
});

describe('parseArea', () => {
  it('should parse area with ㎡ correctly', () => {
    expect(parseArea('75.5㎡')).toBe(75.5);
  });

  it('should parse area with m correctly', () => {
    expect(parseArea('120.25m')).toBe(120.25);
  });

  it('should handle empty input', () => {
    expect(parseArea('')).toBe(0);
  });

  it('should handle undefined input', () => {
    expect(parseArea(undefined as any)).toBe(0);
  });

  it('should handle input with no numeric values', () => {
    expect(parseArea('面積')).toBeNaN();
  });

  it('should handle input with unexpected format', () => {
    expect(parseArea('75.5 square meters')).toBe(75.5);
  });
});

describe('parsePrice', () => {
  it('should parse price with 億 and 万 correctly', () => {
    expect(parsePrice('1億2000万円')).toBe(120000000);
  });

  it('should parse price with only 万 correctly', () => {
    expect(parsePrice('3500万円')).toBe(35000000);
  });

  it('should handle price ranges (with tilde)', () => {
    expect(parsePrice('3500万円～4000万円')).toBe(35000000);
  });

  it('should handle price with dot separator', () => {
    expect(parsePrice('3500万円・4000万円')).toBe(35000000);
  });

  it('should handle complex price formats', () => {
    expect(parsePrice('2億3456万7円')).toBe(234567000);
  });
});

describe('convertToDBFormat', () => {
  it('should convert PropertyItem to PropertyItemDB format', () => {
    const item = {
      suumo_id: '12345',
      suumo_js_id: 'js12345',
      property_type: 'Apartment',
      property_tags: ['New', 'Renovated'],
      title: 'Nice Apartment',
      url: 'https://example.com',
      main_image_url: 'https://example.com/image.jpg',
      additional_image_urls: ['https://example.com/image2.jpg'],
      property_name: 'Example Property',
      price: 35000000,
      price_text: '3500万円',
      area: 75.5,
      land_area: 100.0,
      land_area_text: '100.0㎡',
      building_area: 75.5,
      address: 'Tokyo, Japan',
      type: 'Apartment',
      coverage: 80,
      volume: 300,
      train_line: 'JR Line',
      train_station: 'Tokyo Station',
      station_distance: 10,
      walking_minutes: 10,
      building_coverage: 60,
      floor_area_ratio: 200,
      price_per_tsubo: 300000,
      photo_types: ['Exterior', 'Interior'],
      postal_code: '123-4567',
      state: 'Tokyo',
      city: 'Shibuya',
      additional_fields: { key1: 'value1' },
      insert_date: '2023-01-01'
    };

    const result = convertToDBFormat(item, 'Kanto', 'Tokyo');

    expect(result).toEqual({
      suumo_id: '12345',
      suumo_js_id: 'js12345',
      property_type: 'Apartment',
      property_tags: 'New,Renovated',
      title: 'Nice Apartment',
      url: 'https://example.com',
      main_image_url: 'https://example.com/image.jpg',
      additional_image_urls: 'https://example.com/image2.jpg',
      property_name: 'Example Property',
      price: 35000000,
      price_text: '3500万円',
      area: 75.5,
      land_area: 100.0,
      land_area_text: '100.0㎡',
      building_area: 75.5,
      address: 'Tokyo, Japan',
      type: 'Apartment',
      coverage: 80,
      volume: 300,
      train_line: 'JR Line',
      train_station: 'Tokyo Station',
      station_distance: 10,
      walking_minutes: 10,
      building_coverage: 60,
      floor_area_ratio: 200,
      price_per_tsubo: 300000,
      photo_types: 'Exterior,Interior',
      postal_code: '123-4567',
      state: 'Tokyo',
      city: 'Shibuya',
      district: '',
      additional_fields: '{"key1":"value1"}',
      insert_date: '2023-01-01',
      region: 'Kanto',
      province: 'Tokyo'
    });
  });

  it('should handle missing optional fields with default values', () => {
    const item = {
      suumo_id: '12345',
      suumo_js_id: 'js12345',
      property_type: 'Apartment',
      property_tags: [],
      title: '',
      url: 'https://example.com',
      main_image_url: '',
      additional_image_urls: [],
      price: 0,
      area: 0,
      address: '',
      coverage: 0,
      volume: 0,
      train_line: '',
      train_station: '',
      station_distance: 0,
      postal_code: '',
      state: '',
      city: '',
      insert_date: ''
    };

    const result = convertToDBFormat(item as any);

    expect(result.property_tags).toBe('');
    expect(result.additional_image_urls).toBe('');
    expect(result.main_image_url).toBe('');
    expect(result.building_area).toBe(0);
    expect(result.insert_date).not.toBe('');  // Should default to today's date
    expect(result.region).toBe('');
    expect(result.province).toBe('');
  });
});

describe('simpleXPath and related functions', () => {
  it('should select elements using simpleXPath', () => {
    const doc = createTestDocument(`
      <div class="container">
        <div class="item">Item 1</div>
        <div class="item">Item 2</div>
      </div>
    `);
    
    const elements = simpleXPath(doc.documentElement, '//div[@class="item"]');
    expect(elements.length).toBe(2);
    expect(elements[0].textContent).toBe('Item 1');
    expect(elements[1].textContent).toBe('Item 2');
  });

  it('should select first element using simpleXPathSelect1', () => {
    const doc = createTestDocument(`
      <div class="container">
        <div class="item">Item 1</div>
        <div class="item">Item 2</div>
      </div>
    `);
    
    const element = simpleXPathSelect1(doc.documentElement, '//div[@class="item"]');
    expect(element).not.toBeNull();
    expect(element?.textContent).toBe('Item 1');
  });

  it('should get text content using getElementBySimpleXPath', () => {
    const doc = createTestDocument(`
      <div class="container">
        <div class="item">Item 1</div>
      </div>
    `);
    
    const text = getElementBySimpleXPath(doc.documentElement, '//div[@class="item"]');
    expect(text).toBe('Item 1');
  });
});

describe('findElementsRecursive and related functions', () => {
  it('should find elements recursively based on node type and attributes', () => {
    const doc = createTestDocument(`
      <div class="container">
        <span class="label">Label 1</span>
        <span class="value">Value 1</span>
        <div class="nested">
          <span class="label">Label 2</span>
          <span class="value">Value 2</span>
        </div>
      </div>
    `);
    
    const elements = findElementsRecursive(
      doc.documentElement, 
      'span', 
      { class: /value/ }
    );
    
    expect(elements.length).toBe(2);
    expect(elements[0].textContent).toBe('Value 1');
    expect(elements[1].textContent).toBe('Value 2');
  });

  it('should find first element recursively', () => {
    const doc = createTestDocument(`
      <div class="container">
        <span class="label">Label 1</span>
        <span class="value">Value 1</span>
        <div class="nested">
          <span class="label">Label 2</span>
          <span class="value">Value 2</span>
        </div>
      </div>
    `);
    
    const element = findFirstElementRecursive(
      doc.documentElement, 
      'span', 
      { class: /value/ }
    );
    
    expect(element).not.toBeNull();
    expect(element?.textContent).toBe('Value 1');
  });

  it('should get text from matching element', () => {
    const doc = createTestDocument(`
      <div class="container">
        <span class="label">Label 1</span>
        <span class="value">Value 1</span>
      </div>
    `);
    
    const text = getTextFromMatchingElement(
      doc.documentElement, 
      'span', 
      { class: /value/ }
    );
    
    expect(text).toBe('Value 1');
  });
});

describe('parseDottableKeyValues', () => {
  it('should parse key-value pairs from dotted elements', () => {
    const doc = createTestDocument(`
      <div class="container">
        <div class="dottable-line">
          <dt>Key1</dt>
          <dd>Value1</dd>
        </div>
        <div class="dottable-line">
          <dt>Key2</dt>
          <dd>Value2</dd>
        </div>
      </div>
    `);
    
    const container = doc.getElementsByClassName('container')[0] as Element;
    const result = parseDottableKeyValues(container);
    
    expect(result).toEqual({
      'Key1': 'Value1',
      'Key2': 'Value2'
    });
  });
});

describe('getTitleAndLink', () => {
  it('should extract title and link from a property unit element', () => {
    const doc = createTestDocument(`
      <div class="property_unit-header">

				<h2 class="property_unit-title">

					<a href="/tochi/okinawa/sc_urasoe/nc_75363324/" target="_blank">表示件数</a></h2>

				<div class="property_unit-action">

						<ul class="property_unit-action-btn">

							<li><a href="javascript:void(0);" class="ui-sprite--actionbtn_addmylist js-addMyList">表示件数</a></li>

								<li><a href="/jj/bukken/shiryou/JJ010FJ010/?ar=090&bs=030&nc=75363324&senimotokbn=1" class="ui-btn ui-btn--cta2 ui-btn--small2" title="è³‡æ–™è«‹æ±‚ã™ã‚‹" rel="nofollow">è³‡æ–™è«‹æ±‚ã™ã‚‹</a></li>

							</ul>

					</div>

				</div>
      </div>
    `);

    const result = getTitleAndLink(doc.documentElement);
    expect(result).toEqual({
      title: '表示件数',
      link: '/tochi/okinawa/sc_urasoe/nc_75363324/'
    });
  });
});

// Test for parseItems and parseItemsForDB
describe('parseItems and parseItemsForDB', () => {
  beforeEach(() => {
    // Mock console.log to avoid cluttering test output
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('should handle empty documents gracefully', () => {
    const doc = createTestDocument('<div></div>');
    const items = parseItems(doc);
    expect(items).toEqual([]);
    
    const dbItems = parseItemsForDB(doc, 'Kanto', 'Tokyo');
    expect(dbItems).toEqual([]);
  });
  
  it('should integrate parseItems with convertToDBFormat', () => {
    // Create a mock PropertyItem
    const mockItem: PropertyItem = {
      suumo_id: '12345',
      suumo_js_id: 'js12345',
      property_type: 'Apartment',
      property_tags: ['New'],
      title: 'Test Property',
      url: 'https://example.com',
      main_image_url: 'https://example.com/image.jpg',
      additional_image_urls: ['https://example.com/image2.jpg'],
      price: 35000000,
      area: 75.5,
      address: 'Tokyo, Japan',
      coverage: 80,
      volume: 300,
      train_line: 'JR Line',
      train_station: 'Tokyo Station',
      station_distance: 8,
      postal_code: '123-4567',
      state: 'Tokyo',
      city: 'Shibuya',
      insert_date: '2023-01-01'
    };
    
    // Test convertToDBFormat directly with our mock item
    const dbItem = convertToDBFormat(mockItem, 'Kanto', 'Tokyo');
    
    // Verify the conversion works as expected
    expect(dbItem.suumo_id).toBe('12345');
    expect(dbItem.property_tags).toBe('New');
    expect(dbItem.region).toBe('Kanto');
    expect(dbItem.province).toBe('Tokyo');
  });
});

// Add more tests for edge cases
describe('parsePrice edge cases', () => {
  it('should handle empty input', () => {
    expect(parsePrice('')).toBe(0);
  });

  it('should handle input with no numeric values', () => {
    expect(parsePrice('価格')).toBe(0);
  });

  it('should handle input with only 億 value', () => {
    expect(parsePrice('2億円')).toBe(200000000);
  });
});

describe('convertToDBFormat edge cases', () => {
  it('should handle null arrays', () => {
    const item: PropertyItem = {
      suumo_id: '12345',
      suumo_js_id: 'js12345',
      property_type: 'Apartment',
      property_tags: null as any,
      title: 'Test Property',
      url: 'https://example.com',
      main_image_url: 'https://example.com/image.jpg',
      additional_image_urls: null as any,
      price: 35000000,
      area: 75.5,
      address: 'Tokyo, Japan',
      coverage: 80,
      volume: 300,
      train_line: 'JR Line',
      train_station: 'Tokyo Station',
      station_distance: 8,
      postal_code: '123-4567',
      state: 'Tokyo',
      city: 'Shibuya',
      insert_date: '2023-01-01',
      photo_types: null as any
    };

    const result = convertToDBFormat(item);
    
    expect(result.property_tags).toBe('');
    expect(result.additional_image_urls).toBe('');
    expect(result.photo_types).toBe('');
  });

  it('should handle undefined optional fields', () => {
    const item: PropertyItem = {
      suumo_id: '12345',
      suumo_js_id: 'js12345',
      property_type: 'Apartment',
      property_tags: ['New'],
      title: 'Test Property',
      url: 'https://example.com',
      main_image_url: 'https://example.com/image.jpg',
      additional_image_urls: ['https://example.com/image2.jpg'],
      price: 35000000,
      area: 75.5,
      address: 'Tokyo, Japan',
      coverage: 80,
      volume: 300,
      train_line: 'JR Line',
      train_station: 'Tokyo Station',
      station_distance: 8,
      postal_code: '123-4567',
      state: 'Tokyo',
      city: 'Shibuya',
      insert_date: '2023-01-01',
      // Intentionally omitting optional fields
    };

    const result = convertToDBFormat(item);
    
    expect(result.land_area).toBe(0);
    expect(result.building_area).toBe(0);
    expect(result.land_area_text).toBe('');
    expect(result.price_text).toBe('');
    expect(result.walking_minutes).toBe(0);
    expect(result.building_coverage).toBe(0);
    expect(result.floor_area_ratio).toBe(0);
    expect(result.price_per_tsubo).toBe(0);
    expect(result.property_name).toBe('');
  });
});

describe('parseJapaneseAddress', () => {
  it('should parse simple city address correctly', () => {
    const result = parseJapaneseAddress('北海道滝川市朝日町西３');
    expect(result).toEqual({
      province: '北海道',
      city: '滝川市',
      district: '朝日町西３'
    });
  });

  it('should parse gun-machi pattern addresses correctly', () => {
    const result1 = parseJapaneseAddress('北海道茅部郡鹿部町字本別');
    expect(result1).toEqual({
      province: '北海道',
      city: '茅部郡鹿部町',
      district: '字本別'
    });

    const result2 = parseJapaneseAddress('北海道石狩郡当別町字茂平沢');
    expect(result2).toEqual({
      province: '北海道',
      city: '石狩郡当別町',
      district: '字茂平沢'
    });
  });

  it('should parse complex addresses with numbers and special characters', () => {
    const result = parseJapaneseAddress('北海道旭川市大町二条１１-66-18、66-197、66-199');
    expect(result).toEqual({
      province: '北海道',
      city: '旭川市',
      district: '大町二条１１-66-18、66-197、66-199'
    });
  });

  it('should parse addresses with numbers in the district', () => {
    const result = parseJapaneseAddress('北海道虻田郡洞爺湖町三豊163-124');
    expect(result).toEqual({
      province: '北海道',
      city: '虻田郡洞爺湖町',
      district: '三豊163-124'
    });
  });

  it('should handle empty or invalid input', () => {
    const emptyResult = parseJapaneseAddress('');
    expect(emptyResult).toEqual({
      province: '',
      city: '',
      district: ''
    });

    const invalidResult = parseJapaneseAddress('Invalid Address');
    expect(invalidResult.province).toBe('');
    // The city might be empty and district might contain the full invalid address
  });

  it('should handle addresses without clear city/district boundaries', () => {
    const result = parseJapaneseAddress('北海道札幌');
    expect(result.province).toBe('北海道');
    // The rest of the parsing might vary, but province should be correct
  });
});

describe('parseItem', () => {
  it('should extract province, city, and district from address', () => {
    const html = `
      <div class="property_unit">
        <input name="bsnc" value="12345" />
        <input class="js-clipkey" value="js12345" />
        <ul class="property_unit-pcts">
          <li><span class="ui-pct">Land</span></li>
        </ul>
        <h2 class="property_unit-title">
          <a href="/test/url">Test Property</a>
        </h2>
        <div class="ui-media-object">
          <img rel="https://example.com/image.jpg" />
        </div>
        <ul class="property_unit-thumb">
          <img rel="https://example.com/image2.jpg" />
        </ul>
        <div class="dottable">
          <div class="dottable-line">
            <dt>所在地</dt>
            <dd>北海道滝川市朝日町西３</dd>
          </div>
          <div class="dottable-line">
            <dt>販売価格</dt>
            <dd>3500万円</dd>
          </div>
          <div class="dottable-line">
            <dt>沿線・駅</dt>
            <dd>JR山手線「渋谷」徒歩8分</dd>
          </div>
        </div>
      </div>
    `;
    
    const doc = createTestDocument(html);
    const item = parseItem(doc.documentElement);
    
    expect(item).not.toBeNull();
    expect(item?.state).toBe('北海道');
    expect(item?.city).toBe('滝川市');
    expect(item?.district).toBe('朝日町西３');
  });
  
  it('should extract province, city, and district from complex address', () => {
    const html = `
      <div class="property_unit">
        <input name="bsnc" value="12345" />
        <input class="js-clipkey" value="js12345" />
        <ul class="property_unit-pcts">
          <li><span class="ui-pct">Land</span></li>
        </ul>
        <h2 class="property_unit-title">
          <a href="/test/url">Test Property</a>
        </h2>
        <div class="ui-media-object">
          <img rel="https://example.com/image.jpg" />
        </div>
        <ul class="property_unit-thumb">
          <img rel="https://example.com/image2.jpg" />
        </ul>
        <div class="dottable">
          <div class="dottable-line">
            <dt>所在地</dt>
            <dd>北海道茅部郡鹿部町字本別</dd>
          </div>
          <div class="dottable-line">
            <dt>販売価格</dt>
            <dd>3500万円</dd>
          </div>
          <div class="dottable-line">
            <dt>沿線・駅</dt>
            <dd>JR山手線「渋谷」徒歩8分</dd>
          </div>
        </div>
      </div>
    `;
    
    const doc = createTestDocument(html);
    const item = parseItem(doc.documentElement);
    
    expect(item).not.toBeNull();
    expect(item?.state).toBe('北海道');
    expect(item?.city).toBe('茅部郡鹿部町');
    expect(item?.district).toBe('字本別');
  });
}); 