import { DOMParser } from '@xmldom/xmldom';
import { 
  parseJapaneseAddress, 
  parseArea, 
  parsePrice, 
  simpleXPath, 
  simpleXPathSelect1, 
  getElementBySimpleXPath 
} from './parseUtils.js';

/**
 * Interface for a building with multiple rental units
 */
export interface RentalBuilding {
  // Building metadata
  suumo_id: string;
  building_type: string;
  title: string;
  address: string;
  main_image_url: string;
  
  // Building details
  age: string;
  floors: string;
  
  // Transit information
  stations: Array<{
    line: string;
    station: string;
    walking_minutes: number;
  }>;
  
  // Available units in this building
  units: RentalUnit[];
}

/**
 * Interface for an individual rental unit within a building
 */
export interface RentalUnit {
  // Basic identification
  suumo_id: string;
  suumo_js_id: string;
  url: string;
  
  // Unit details
  floor: string;
  rent: number;
  rent_text: string;
  management_fee: number;
  management_fee_text: string;
  deposit: string;
  gratuity: string;
  layout: string;
  size: number;
  size_text: string;
  
  // Images
  thumbnail_url: string;
  image_urls: string[];
  
  // Additional data
  tags: string[];
  
  // Timestamp
  insert_date: Date;
}

/**
 * Interface for database storage of rental units
 */
export interface RentalUnitDB {
  // Basic identification
  suumo_id: string;
  suumo_js_id: string;
  url: string;
  
  // Building information
  building_suumo_id: string;
  building_type: string;
  building_title: string;
  building_address: string;
  building_age: string;
  building_floors: string;
  building_image_url: string;
  
  // Unit details
  floor: string;
  rent: number;
  rent_text: string;
  management_fee: number;
  management_fee_text: string;
  deposit: string;
  gratuity: string;
  layout: string;
  size: number;
  size_text: string;
  
  // Transit information
  stations: string; // JSON string of station objects
  
  // Images
  thumbnail_url: string;
  image_urls: string; // Comma-separated string
  
  // Additional data
  tags: string; // Comma-separated string
  
  // Location data
  postal_code: string;
  state: string;
  city: string;
  district: string;
  
  // Timestamp
  insert_date: Date;
  
  // Required by Prisma
  region: string;
  province: string;
}

/**
 * Parse all rental buildings and their units from a document
 */
export function parseRentalBuildings(document: Document): RentalBuilding[] {
  const buildings: RentalBuilding[] = [];
  
  // Find all building items (cassetteitem)
  const buildingElements = Array.from(document.getElementsByClassName('cassetteitem'));
  
  for (const buildingElement of buildingElements) {
    const building = parseRentalBuilding(buildingElement as Element);
    if (building) {
      buildings.push(building);
    }
  }
  
  return buildings;
}

/**
 * Parse a single rental building with all its units
 */
export function parseRentalBuilding(element: Element): RentalBuilding | null {
  try {
    // Extract building type
    // Link: https://img01.suumo.com/front/gazo/fr/bukken/339/100424449339/100424449339_gw.jpg
    const linkElement = simpleXPathSelect1(element, '//img[class="js-noContextMenu js-linkImage js-adjustImg"]');
    const building_id = linkElement?.getAttribute('rel')?.split('/')[8] || '';

    // Extract building type
    const typeElement = simpleXPathSelect1(element, '//div[class~="cassetteitem_content-label"]//span[class~="ui-pct"]');
    const building_type = typeElement?.textContent?.trim() || '';
    
    // Extract building title
    const titleElement = simpleXPathSelect1(element, '//div[class~="cassetteitem_content-title"]');
    const title = titleElement?.textContent?.trim() || '';
    
    // Extract building address
    const addressElement = simpleXPathSelect1(element, '//li[class~="cassetteitem_detail-col1"]');
    const address = addressElement?.textContent?.trim() || '';
    
    // Extract building image
    const imageElement = simpleXPathSelect1(element, '//div[class~="cassetteitem_object-item"]//img');
    const main_image_url = imageElement?.getAttribute('src') || '';
    
    // Extract building age and floors
    const buildingInfoElements = simpleXPath(element, '//li[class~="cassetteitem_detail-col3"]//div');
    const age = buildingInfoElements[0]?.textContent?.trim() || '';
    const floors = buildingInfoElements[1]?.textContent?.trim() || '';
    
    // Extract station information
    const stationElements = simpleXPath(element, '//li[class~="cassetteitem_detail-col2"]//div[class~="cassetteitem_detail-text"]');
    const stations = Array.from(stationElements).map(stationElement => {
      const stationText = stationElement.textContent?.trim() || '';
      const data = parseStationInfo(stationText);
      if (data.line != '' && data.station != '') {
        return data;
      }
      return null;
    }).filter((station): station is { line: string; station: string; walking_minutes: number } => station !== null);
    
    // Extract rental units
    const unitElements = simpleXPath(element, '//tr[class~="js-cassette_link"]');
    const units = Array.from(unitElements).map(unitElement => {
      return parseRentalUnit(unitElement);
    }).filter((unit): unit is RentalUnit => unit !== null);
    
    return {
      suumo_id: `building-${building_id}`,
      building_type,
      title,
      address,
      main_image_url,
      age,
      floors,
      stations,
      units
    };
  } catch (error) {
    console.error('Error parsing rental building:', error);
    return null;
  }
}

/**
 * Parse a single rental unit from a table row
 */
export function parseRentalUnit(element: Element): RentalUnit | null {
  try {
    // Extract the property ID from input element
    const idInput = simpleXPathSelect1(element, '//input[class~="js-single_checkbox"]');
    const id = idInput?.getAttribute('value');
    if (!id) {
      console.warn('Could not find property ID, skipping unit');
      return null;
    }
    
    // Extract JS clip key if available
    const clipKeyInput = simpleXPathSelect1(element, '//input[class~="js-clipkey"]');
    const clipKey = clipKeyInput?.getAttribute('value') || '';
    
    // Extract URL
    const linkElement = simpleXPathSelect1(element, '//a[class~="js-cassette_link_href"]');
    const url = linkElement?.getAttribute('href') ? `https://suumo.jp${linkElement.getAttribute('href')}` : '';
    
    // Extract floor - use direct child td instead of descendant search
    // The third td contains the floor information
    const tdElements = Array.from(element.childNodes).filter(
      node => node.nodeName === 'td'
    );
    const floorElement = tdElements.length >= 3 ? tdElements[2] : null;
    const floor = floorElement?.textContent?.trim() || '';
    
    // Extract rent and management fee
    const rentElement = simpleXPathSelect1(element, '//span[class~="cassetteitem_price--rent"]//span[class~="cassetteitem_other-emphasis"]');
    const rentText = rentElement?.textContent?.trim() || '';
    const rent = parseRentPrice(rentText);
    
    const managementFeeElement = simpleXPathSelect1(element, '//span[class~="cassetteitem_price--administration"]');
    const managementFeeText = managementFeeElement?.textContent?.trim() || '';
    const managementFee = parseRentPrice(managementFeeText);
    
    // Extract deposit and gratuity
    const depositElement = simpleXPathSelect1(element, '//span[class~="cassetteitem_price--deposit"]');
    const deposit = depositElement?.textContent?.trim() || '';
    
    const gratuityElement = simpleXPathSelect1(element, '//span[class~="cassetteitem_price--gratuity"]');
    const gratuity = gratuityElement?.textContent?.trim() || '';
    
    // Extract layout and size
    const layoutElement = simpleXPathSelect1(element, '//span[class~="cassetteitem_madori"]');
    const layout = layoutElement?.textContent?.trim() || '';
    
    const sizeElement = simpleXPathSelect1(element, '//span[class~="cassetteitem_menseki"]');
    const sizeText = sizeElement?.textContent?.trim() || '';
    const size = parseSizeArea(sizeText);
    
    // Extract thumbnail and images
    const thumbnailElement = simpleXPathSelect1(element, '//img[class~="casssetteitem_other-thumbnail-img"]');
    const thumbnailUrl = thumbnailElement?.getAttribute('src') || '';
    
    const galleryElement = simpleXPathSelect1(element, '//div[class~="js-view_gallery_images"]');
    const imageUrlsAttr = galleryElement?.getAttribute('data-imgs') || '';
    const imageUrls = imageUrlsAttr.split(',').filter(url => url.trim() !== '');
    
    // Extract tags
    const tagElements = simpleXPath(element, '//ul[class~="cassetteitem-taglist"]//li');
    const tags = Array.from(tagElements).map(tag => tag.textContent?.trim() || '').filter(tag => tag !== '');
    
    return {
      suumo_id: id,
      suumo_js_id: clipKey,
      url,
      floor,
      rent,
      rent_text: rentText,
      management_fee: managementFee,
      management_fee_text: managementFeeText,
      deposit,
      gratuity,
      layout,
      size,
      size_text: sizeText,
      thumbnail_url: thumbnailUrl,
      image_urls: imageUrls,
      tags,
      insert_date: new Date()
    };
  } catch (error) {
    console.error('Error parsing rental unit:', error);
    return null;
  }
}

/**
 * Convert rental buildings and units to database format
 */
export function convertToRentalDBFormat(buildings: RentalBuilding[], region: string = '', province: string = ''): RentalUnitDB[] {
  const units: RentalUnitDB[] = [];
  
  for (const building of buildings) {
    for (const unit of building.units) {
      // Parse address to get location data
      const locationData = parseJapaneseAddress(building.address);
      
      units.push({
        suumo_id: unit.suumo_id,
        suumo_js_id: unit.suumo_js_id,
        url: unit.url,
        
        building_suumo_id: building.suumo_id,
        building_type: building.building_type,
        building_title: building.title,
        building_address: building.address,
        building_age: building.age,
        building_floors: building.floors,
        building_image_url: building.main_image_url,
        
        floor: unit.floor,
        rent: unit.rent,
        rent_text: unit.rent_text,
        management_fee: unit.management_fee,
        management_fee_text: unit.management_fee_text,
        deposit: unit.deposit,
        gratuity: unit.gratuity,
        layout: unit.layout,
        size: unit.size,
        size_text: unit.size_text,
        
        stations: JSON.stringify(building.stations),
        
        thumbnail_url: unit.thumbnail_url,
        image_urls: unit.image_urls.join(','),
        
        tags: unit.tags.join(','),
        
        postal_code: '', // Would need additional parsing
        state: locationData.province,
        city: locationData.city,
        district: locationData.district,
        
        insert_date: new Date(),
        
        region,
        province
      });
    }
  }
  
  return units;
}

/**
 * Parse station information from text like "地下鉄南北線/幌平橋駅 歩24分"
 */
export function parseStationInfo(stationText: string): { line: string, station: string, walking_minutes: number } {
  try {
    // Split by space to separate line/station from walking minutes
    const parts = stationText.split(' ');
    
    // Parse line and station
    const lineStationPart = parts[0] || '';
    const lineStationSplit = lineStationPart.split('/');
    const line = lineStationSplit[0] || '';
    const station = lineStationSplit[1] || '';
    
    // Parse walking minutes
    const walkingPart = parts[1] || '';
    const walkingMatch = walkingPart.match(/歩(\d+)分/);
    const walking_minutes = walkingMatch ? parseInt(walkingMatch[1], 10) : 0;
    
    return {
      line,
      station,
      walking_minutes
    };
  } catch (error) {
    console.error('Error parsing station info:', error);
    return {
      line: '',
      station: '',
      walking_minutes: 0
    };
  }
}

/**
 * Parse rent price from text like "6.1万円" or "4000円"
 */
export function parseRentPrice(priceText: string): number {
  try {
    if (!priceText || priceText === '-') {
      return 0;
    }
    
    // Remove non-numeric characters except for decimal point
    const numericText = priceText.replace(/[^0-9.]/g, '');
    
    // Check if the price is in "万円" (10,000 yen) format
    if (priceText.includes('万円')) {
      return parseFloat(numericText) * 10000;
    }
    
    return parseFloat(numericText);
  } catch (error) {
    console.error('Error parsing rent price:', error);
    return 0;
  }
}

/**
 * Parse size area from text like "40.16m²"
 */
export function parseSizeArea(sizeText: string): number {
  try {
    if (!sizeText) {
      return 0;
    }
    
    // Remove non-numeric characters except for decimal point
    const numericText = sizeText.replace(/[^0-9.]/g, '');
    return parseFloat(numericText);
  } catch (error) {
    console.error('Error parsing size area:', error);
    return 0;
  }
}

/**
 * Parse all rental units from a document for database storage
 */
export function parseRentalUnitsForDB(document: Document, region: string = '', province: string = ''): RentalUnitDB[] {
  const buildings = parseRentalBuildings(document);
  return convertToRentalDBFormat(buildings, region, province);
} 