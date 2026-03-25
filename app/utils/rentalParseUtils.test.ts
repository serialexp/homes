// Type declarations for Vitest
import { describe, it, expect, afterAll, vi } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import {
  parseRentalBuildings,
  parseRentalBuilding,
  parseRentalUnit,
  parseStationInfo,
  parseRentPrice,
  parseSizeArea,
  RentalBuilding,
  RentalUnit
} from './rentalParseUtils.js';
import { 
  parseJapaneseAddress,
  simpleXPath,
  simpleXPathSelect1
} from './parseUtils.js';

// Mock console.error to avoid cluttering test output
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
console.error = vi.fn();
console.warn = vi.fn();

// Restore console functions after tests
afterAll(() => {
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

// Helper function to debug DOM elements
function debugElement(element: Element | null, label: string = 'Element') {
  if (!element) {
    console.log(`${label} is null`);
    return;
  }
  
  console.log(`${label} nodeName: ${element.nodeName}`);
  console.log(`${label} className: ${(element as any).className || 'N/A'}`);
  console.log(`${label} childNodes: ${element.childNodes.length}`);
  console.log(`${label} innerHTML: ${(element as any).innerHTML?.substring(0, 100) || 'N/A'}`);
}

describe('Rental Parse Utils', () => {
  // Sample HTML structure for testing
  const sampleHtml = `
    <html>
    <body>
    <li>
      <div class="cassetteitem">
        <div class="cassetteitem-detail">
          <div class="cassetteitem-detail-object">
            <div class="cassetteitem_object">
              <div class="cassetteitem_object-item">
                <img class="js-noContextMenu js-linkImage js-adjustImg" alt="" rel="https://img01.suumo.com/front/gazo/fr/bukken/626/100426191626/100426191626_gw.jpg" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw%3D%3D" width="180" height="135" style="margin-top: 22.5px;">
              </div>
            </div>
          </div>
          <div class="cassetteitem-detail-body">
            <div class="cassetteitem_content">
              <div class="cassetteitem_content-label"><span class="ui-pct ui-pct--util1">賃貸マンション</span></div>
              <div class="cassetteitem_content-title">地下鉄南北線 幌平橋駅 4階建 築7年</div>
              <div class="cassetteitem_content-body">
                <ul class="cassetteitem_detail">
                  <li class="cassetteitem_detail-col1">北海道札幌市中央区南二十四条西１２</li>
                  <li class="cassetteitem_detail-col2">
                    <div class="cassetteitem_detail-text">地下鉄南北線/幌平橋駅 歩24分</div>
                    <div class="cassetteitem_detail-text">地下鉄南北線/中の島駅 歩25分</div>
                    <div class="cassetteitem_detail-text">地下鉄南北線/平岸駅 歩29分</div>
                  </li>
                  <li class="cassetteitem_detail-col3">
                    <div>築7年</div>
                    <div>4階建</div>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
        <div class="cassetteitem-item">
          <table class="cassetteitem_other">
            <thead>
              <tr>
                <th class="cassetteitem_other-col01">&nbsp;</th>
                <th class="cassetteitem_other-col02">&nbsp;</th>
                <th class="cassetteitem_other-col03">階</th>
                <th class="cassetteitem_other-col04">賃料/管理費</th>
                <th class="cassetteitem_other-col05">敷金/礼金</th>
                <th class="cassetteitem_other-col06">間取り/専有面積</th>
                <th class="cassetteitem_other-col07">&nbsp;</th>
                <th class="cassetteitem_other-col08">お気に入り</th>
                <th class="cassetteitem_other-col09">&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              <tr class="js-cassette_link">
                <td class="cassetteitem_other-checkbox cassetteitem_other-checkbox--newarrival js-cassetteitem_checkbox">
                  <input type="checkbox" name="bc" id="bukken_0" class="js-ikkatsuCB js-single_checkbox" value="100425497740"><label for="bc">&nbsp;</label>
                </td>
                <td>
                  <div class="casssetteitem_other-thumbnail js-view_gallery_images js-noContextMenu" data-imgs="https://img01.suumo.com/front/gazo/fr/bukken/740/100425497740/100425497740_ro.jpg,https://img01.suumo.com/front/gazo/fr/bukken/740/100425497740/100425497740_co.gif">
                    <img src="https://img01.suumo.com/front/gazo/fr/bukken/740/100425497740/100425497740_co.gif" rel="https://img01.suumo.com/front/gazo/fr/bukken/740/100425497740/100425497740_co.gif" alt="" class="casssetteitem_other-thumbnail-img casssetteitem_other-thumbnail-img--hasimages js-view_gallery-modal">
                    <span class="cassetteitem_other-thumbnail-expansion js-view_gallery-modal"></span>
                  </div>
                </td>
                <td>4階</td>
                <td>
                  <ul>
                    <li><span class="cassetteitem_price cassetteitem_price--rent"><span class="cassetteitem_other-emphasis ui-text--bold">6.1万円</span></span></li>
                    <li><span class="cassetteitem_price cassetteitem_price--administration">4000円</span></li>
                  </ul>
                </td>
                <td>
                  <ul>
                    <li><span class="cassetteitem_price cassetteitem_price--deposit">-</span></li>
                    <li><span class="cassetteitem_price cassetteitem_price--gratuity">-</span></li>
                  </ul>
                </td>
                <td>
                  <ul>
                    <li><span class="cassetteitem_madori">1LDK</span></li>
                    <li><span class="cassetteitem_menseki">40.16m<sup>2</sup></span></li>
                  </ul>
                </td>
                <td>
                  <ul class="cassetteitem-taglist">
                    <li>駅近</li>
                  </ul>
                </td>
                <td class="js-property">
                  <input class="js-clipkey" type="hidden" value="100425497740">
                  <a href="javascript:void(0);" class="ui-btn ui-favorite cassette_favorite cassette_favorite--sm js-addMyList js-linkSuppresser ">
                    <span class="ui-favorite-icon cassette_favorite-icon"><span class="fr_list-eachicon fr_list-eachicon--favorite"></span></span>
                    <span class="ui-favorite-text">追加</span>
                    <span class="ui-favorite-icon_add cassette_favorite-icon_add"><span class="fr_list-eachicon fr_list-eachicon--favorite_add"></span></span>
                    <span class="ui-favorite-text_add">追加</span>
                  </a>
                </td>
                <td class="ui-text--midium ui-text--bold">
                  <a href="/chintai/jnc_000096969371/?bc=100425497740" target="_blank" class="js-cassette_link_href cassetteitem_other-linktext" onclick="sendBeaconSiteCatalystClick(event,this,'click_casset_bkn_link',false);">詳細を見る</a>
                </td>
              </tr>
            </tbody>
            <tbody>
              <tr class="js-cassette_link">
                <td class="cassetteitem_other-checkbox cassetteitem_other-checkbox--newarrival js-cassetteitem_checkbox">
                  <input type="checkbox" name="bc" id="bukken_0" class="js-ikkatsuCB js-single_checkbox" value="100425497002"><label for="bc">&nbsp;</label>
                </td>
                <td>
                  <div class="casssetteitem_other-thumbnail js-view_gallery_images js-noContextMenu" data-imgs="https://img01.suumo.com/front/gazo/fr/bukken/002/100425497002/100425497002_ro.jpg,https://img01.suumo.com/front/gazo/fr/bukken/002/100425497002/100425497002_co.jpg">
                    <img src="https://img01.suumo.com/front/gazo/fr/bukken/002/100425497002/100425497002_co.jpg" rel="https://img01.suumo.com/front/gazo/fr/bukken/002/100425497002/100425497002_co.jpg" alt="" class="casssetteitem_other-thumbnail-img casssetteitem_other-thumbnail-img--hasimages js-view_gallery-modal">
                    <span class="cassetteitem_other-thumbnail-expansion js-view_gallery-modal"></span>
                  </div>
                </td>
                <td>1階</td>
                <td>
                  <ul>
                    <li><span class="cassetteitem_price cassetteitem_price--rent"><span class="cassetteitem_other-emphasis ui-text--bold">7.5万円</span></span></li>
                    <li><span class="cassetteitem_price cassetteitem_price--administration">5000円</span></li>
                  </ul>
                </td>
                <td>
                  <ul>
                    <li><span class="cassetteitem_price cassetteitem_price--deposit">-</span></li>
                    <li><span class="cassetteitem_price cassetteitem_price--gratuity">-</span></li>
                  </ul>
                </td>
                <td>
                  <ul>
                    <li><span class="cassetteitem_madori">2LDK</span></li>
                    <li><span class="cassetteitem_menseki">55.48m<sup>2</sup></span></li>
                  </ul>
                </td>
                <td>
                  <ul class="cassetteitem-taglist">
                  </ul>
                </td>
                <td class="js-property">
                  <input class="js-clipkey" type="hidden" value="100425497002">
                  <a href="javascript:void(0);" class="ui-btn ui-favorite cassette_favorite cassette_favorite--sm js-addMyList js-linkSuppresser ">
                    <span class="ui-favorite-icon cassette_favorite-icon"><span class="fr_list-eachicon fr_list-eachicon--favorite"></span></span>
                    <span class="ui-favorite-text">追加</span>
                    <span class="ui-favorite-icon_add cassette_favorite-icon_add"><span class="fr_list-eachicon fr_list-eachicon--favorite_add"></span></span>
                    <span class="ui-favorite-text_add">追加</span>
                  </a>
                </td>
                <td class="ui-text--midium ui-text--bold">
                  <a href="/chintai/jnc_000096969370/?bc=100425497002" target="_blank" class="js-cassette_link_href cassetteitem_other-linktext" onclick="sendBeaconSiteCatalystClick(event,this,'click_casset_bkn_link',false);">詳細を見る</a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </li>
    </body>
    </html>
  `;

  // Parse the sample HTML
  const parser = new DOMParser();
  const document = parser.parseFromString(sampleHtml, 'text/html');

  // Debug the document structure
  it('should debug the document structure', () => {
    console.log('Document childNodes length:', document.childNodes.length);
    
    // Check if we can find elements by class name
    const cassetteitems = document.getElementsByClassName('cassetteitem');
    console.log('Cassetteitem elements found:', cassetteitems.length);
    debugElement(cassetteitems[0] as Element, 'Cassetteitem');
    
    const jsLinks = document.getElementsByClassName('js-cassette_link');
    console.log('js-cassette_link elements found:', jsLinks.length);
    debugElement(jsLinks[0] as Element, 'js-cassette_link');
    
    // Try to find elements by tag name
    const divs = document.getElementsByTagName('div');
    console.log('Div elements found:', divs.length);
    
    const trs = document.getElementsByTagName('tr');
    console.log('TR elements found:', trs.length);
    
    // Check if simpleXPath works
    const typeElement = simpleXPathSelect1(document.documentElement, '//span[class~="ui-pct"]');
    debugElement(typeElement, 'Type element (simpleXPath)');
    
    const checkboxInput = simpleXPathSelect1(document.documentElement, '//input[class~="js-single_checkbox"]');
    debugElement(checkboxInput, 'Checkbox input (simpleXPath)');
  });

  describe('parseStationInfo', () => {
    it('should correctly parse station information', () => {
      const stationText = '地下鉄南北線/幌平橋駅 歩24分';
      const result = parseStationInfo(stationText);
      
      expect(result).toEqual({
        line: '地下鉄南北線',
        station: '幌平橋駅',
        walking_minutes: 24
      });
    });

    it('should handle empty or invalid station text', () => {
      const result = parseStationInfo('');
      
      expect(result).toEqual({
        line: '',
        station: '',
        walking_minutes: 0
      });
    });
  });

  describe('parseRentPrice', () => {
    it('should correctly parse rent in 万円 format', () => {
      const result = parseRentPrice('6.1万円');
      expect(result).toBe(61000);
    });

    it('should correctly parse rent in regular yen format', () => {
      const result = parseRentPrice('4000円');
      expect(result).toBe(4000);
    });

    it('should handle empty or invalid price text', () => {
      expect(parseRentPrice('-')).toBe(0);
      expect(parseRentPrice('')).toBe(0);
    });
  });

  describe('parseSizeArea', () => {
    it('should correctly parse size area', () => {
      const result = parseSizeArea('40.16m²');
      expect(result).toBe(40.16);
    });

    it('should handle empty or invalid size text', () => {
      expect(parseSizeArea('')).toBe(0);
    });
  });

  describe('parseJapaneseAddress', () => {
    it('should correctly parse Japanese address', () => {
      const result = parseJapaneseAddress('北海道札幌市中央区南二十四条西１２');
      
      expect(result.province).toBe('北海道');
      expect(result.city).toBe('札幌市');
      expect(result.district).toContain('中央区');
    });
  });

  describe('parseRentalUnit', () => {
    it('should correctly parse a rental unit', () => {
      // Get the first unit row
      const unitElements = document.getElementsByClassName('js-cassette_link');
      expect(unitElements.length).toBeGreaterThan(0);
      
      const unitElement = unitElements[0] as Element;
      const result = parseRentalUnit(unitElement);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.suumo_id).toBe('100425497740');
        expect(result.suumo_js_id).toBe('100425497740');
        expect(result.floor).toBe('4階');
        expect(result.rent).toBe(61000);
        expect(result.rent_text).toBe('6.1万円');
        expect(result.management_fee).toBe(4000);
        expect(result.management_fee_text).toBe('4000円');
        expect(result.deposit).toBe('-');
        expect(result.gratuity).toBe('-');
        expect(result.layout).toBe('1LDK');
        expect(result.size).toBeCloseTo(40.16, 1);
        expect(result.size_text).toBe('40.16m2');
        expect(result.tags).toContain('駅近');
        expect(result.image_urls.length).toBe(2);
      }
    });
  });

  describe('parseRentalBuilding', () => {
    it('should correctly parse a rental building with its units', () => {
      const buildingElements = document.getElementsByClassName('cassetteitem');
      expect(buildingElements.length).toBeGreaterThan(0);
      
      const buildingElement = buildingElements[0] as Element;
      const result = parseRentalBuilding(buildingElement);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.suumo_id).toBe('building-100426191626');
        expect(result.building_type).toBe('賃貸マンション');
        expect(result.title).toBe('地下鉄南北線 幌平橋駅 4階建 築7年');
        expect(result.address).toBe('北海道札幌市中央区南二十四条西１２');
        expect(result.age).toBe('築7年');
        expect(result.floors).toBe('4階建');
        
        // Check stations
        expect(result.stations.length).toBe(3);
        expect(result.stations[0].line).toBe('地下鉄南北線');
        expect(result.stations[0].station).toBe('幌平橋駅');
        expect(result.stations[0].walking_minutes).toBe(24);
        
        // Check units
        expect(result.units.length).toBe(2);
        expect(result.units[0].suumo_id).toBe('100425497740');
        expect(result.units[1].suumo_id).toBe('100425497002');
      }
    });
  });

  describe('parseRentalBuildings', () => {
    it('should correctly parse all rental buildings in a document', () => {
      const results = parseRentalBuildings(document);
      
      expect(results.length).toBe(1);
      expect(results[0].units.length).toBe(2);
    });
  });
}); 