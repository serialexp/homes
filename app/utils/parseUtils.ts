import * as xpath from 'xpath';
import { DOMParser } from '@xmldom/xmldom';

// Fields to extract from property listings
const fields = {
  'value': './/div[@class~="dottable-value"]//span[@class~="dottable-value"]',
  'address': './/div[@class~="dottable-line"]//a',
  'station': './/div[@class~="dottable-line"]/dl/dd',
  'area': './/div[@class~="dottable-line"]//dt[text()[contains(.,\'土地面積\')]]/../dd',
  'jsId': './/input[@name="bknc"]/@value'
};

// Optional fields
const optionalFields = {
  'building_area': './/dt[text()[contains(.,\'建物面積\')]]/../dd',
  'type': './/dt[text()[contains(.,\'間取り\')]]/../dd',
  'coverage': './/dt[text()[contains(.,\'建ぺい率・容積率\')]]/../dd'
};

/**
 * Interface for property items returned by the parser (in-memory format)
 */
export interface PropertyItem {
  // Basic identification
  suumo_id: string;
  suumo_js_id: string;
  
  // Property metadata
  property_type: string;
  property_tags: string[];
  title: string;
  url: string;
  
  // Images
  main_image_url: string;
  additional_image_urls: string[];
  
  // Property details
  property_name?: string;
  price: number;
  price_text?: string;
  area: number;
  land_area?: number;
  land_area_text?: string;
  building_area?: number;
  address: string;
  type?: string | null;
  coverage: number;
  volume: number;
  train_line: string;
  train_station: string;
  station?: string; // For internal use
  station_distance: number;
  walking_minutes?: number;
  building_coverage?: number;
  floor_area_ratio?: number;
  price_per_tsubo?: number;
  photo_types?: string[];
  
  // Location data
  postal_code: string;
  state: string;
  city: string;
  district?: string;
  
  // Additional fields
  additional_fields?: Record<string, string>;
  
  // Timestamp
  insert_date: string;
}

/**
 * Interface for property items in database format (for Prisma)
 */
export interface PropertyItemDB {
  // Basic identification
  suumo_id: string;
  suumo_js_id: string;
  
  // Property metadata
  property_type: string;
  property_tags?: string; // Comma-separated string
  title?: string;
  url: string;
  
  // Images
  main_image_url?: string;
  additional_image_urls?: string; // Comma-separated string
  
  // Property details
  property_name?: string;
  price: number;
  price_text?: string;
  area: number;
  land_area?: number;
  land_area_text?: string;
  building_area?: number;
  address: string;
  type?: string | null;
  coverage: number;
  volume: number;
  train_line: string;
  train_station: string;
  station_distance: number;
  walking_minutes?: number;
  building_coverage?: number;
  floor_area_ratio?: number;
  price_per_tsubo?: number;
  photo_types?: string; // Comma-separated string
  
  // Location data
  postal_code: string;
  state: string;
  city: string;
  district?: string;
  
  // Additional fields
  additional_fields?: string; // JSON string
  
  // Timestamp
  insert_date: string;
  
  // Required by Prisma but not used in our code
  region: string;
  province: string;
}

/**
 * Convert a PropertyItem to database format for Prisma
 */
export function convertToDBFormat(item: PropertyItem, region: string = '', province: string = ''): PropertyItemDB {
  return {
    // Basic identification
    suumo_id: item.suumo_id,
    suumo_js_id: item.suumo_js_id,
    
    // Property metadata
    property_type: item.property_type,
    property_tags: Array.isArray(item.property_tags) && item.property_tags.length > 0 
      ? item.property_tags.join(',') 
      : '',
    title: item.title || '',
    url: item.url,
    
    // Images
    main_image_url: item.main_image_url || '',
    additional_image_urls: Array.isArray(item.additional_image_urls) && item.additional_image_urls.length > 0 
      ? item.additional_image_urls.join(',') 
      : '',
    
    // Property details
    property_name: item.property_name || '',
    price: item.price || 0,
    price_text: item.price_text || '',
    area: item.area || 0,
    land_area: item.land_area || 0,
    land_area_text: item.land_area_text || '',
    building_area: item.building_area || 0,
    address: item.address || '',
    type: item.type || null,
    coverage: item.coverage || 0,
    volume: item.volume || 0,
    train_line: item.train_line || '',
    train_station: item.train_station || '',
    station_distance: item.station_distance || 0,
    walking_minutes: item.walking_minutes || 0,
    building_coverage: item.building_coverage || 0,
    floor_area_ratio: item.floor_area_ratio || 0,
    price_per_tsubo: item.price_per_tsubo || 0,
    photo_types: Array.isArray(item.photo_types) && item.photo_types.length > 0 
      ? item.photo_types.join(',') 
      : '',
    
    // Location data
    postal_code: item.postal_code || '',
    state: item.state || '',
    city: item.city || '',
    district: item.district || '',
    
    // Additional fields
    additional_fields: item.additional_fields ? JSON.stringify(item.additional_fields) : '',
    
    // Timestamp
    insert_date: item.insert_date || new Date().toISOString().split('T')[0],
    
    // Required by Prisma
    region: region || '',
    province: province || ''
  };
}

/**
 * Parse items from a document using XPath
 */
export function parseItems(document: Document): PropertyItem[] {
  try {
    // Use contains() for more flexible class matching
    const items = xpath.select('//*[contains(@class, "property_unit ")]', document);
    if (!Array.isArray(items)) {
      console.warn('No items found');
      return [];
    }
    console.log(`Found ${items.length} items`);
    
    const results: PropertyItem[] = [];
    for (const item of items) {
      const parsedItem = parseItem(item as Element);
      if (parsedItem) {
        results.push(parsedItem);
      }
    }
    
    return results;
  } catch (error) {
    console.error('Error parsing items:', error);
    return [];
  }
}

/**
 * Parse items from a document and return them in database format
 */
export function parseItemsForDB(document: Document, region: string = '', province: string = ''): PropertyItemDB[] {
  const items = parseItems(document);
  
  return items.map(item => convertToDBFormat(item, region, province));
}

export function getTitleAndLink(element: Element): { title: string, link: string } {
  const titleElement = findFirstElementRecursive(element, 'h2', {
    class: /property_unit-title/
  });
  const getLink = findFirstElementRecursive(element, 'a');
  const link = getLink?.getAttribute('href') || '';
  return { title: titleElement?.textContent?.trim() || '', link: link };
}

/**
 * Parse a single property item
 */
export function parseItem(element: Element): PropertyItem | null {
  try {
    // Extract the property ID from input element
    const idInput = findFirstElementRecursive(element, 'input', {
      name: /bsnc/
    });
    if (!idInput) {
      console.warn('Could not find property ID input, skipping item');
      return null;
    }
    const id = idInput.getAttribute('value');
    if (!id) {
      console.warn('Could not find property ID, skipping item');
      return null;
    }

    // Extract JS clip key if available
    const clipKeyInput = findFirstElementRecursive(element, 'input', {
      class: /js-clipkey/
    });
    const clipKey = clipKeyInput?.getAttribute('value') || '';

    // Extract property types/tags
    const propertyTags: string[] = [];
    const tagElements = simpleXPath(element, '//ul[class~="property_unit-pcts"]//li//span[class~="ui-pct"]');
    for (const tag of tagElements) {
      const tagText = tag.textContent?.trim();
      if (tagText) {
        propertyTags.push(tagText);
      }
    }

    // Extract title and URL
    const { title, link: url } = getTitleAndLink(element);

    // Extract main image URL
    const mainImageElement = simpleXPathSelect1(element, '//div[class~="ui-media-object"]//img');
    const mainImageUrl = mainImageElement?.getAttribute('rel') || '';

    // Extract additional image URLs
    const additionalImageUrls: string[] = [];
    const thumbElements = simpleXPath(element, '//ul[class~="property_unit-thumb"]//img');
    for (const thumb of thumbElements) {
      const imgSrc = thumb.getAttribute('rel');
      if (imgSrc && !imgSrc.includes('move_92_69.png')) {
        additionalImageUrls.push(imgSrc);
      }
    }

    // Parse the dottable section to get all property details
    const dottableElement = simpleXPathSelect1(element, '//div[class~="dottable"]');
    if (!dottableElement) {
      console.warn('Could not find property details section, skipping item');
      return null;
    }

    // Use our new function to parse all property details
    const propertyDetails = parsePropertyDetails(dottableElement);
    
    // Parse the address into province, city, and district
    const addressComponents = parseJapaneseAddress(propertyDetails.address);
  
    // Combine all extracted information
    return {
      // Basic identification
      suumo_id: id,
      suumo_js_id: clipKey || id,
      
      // Property metadata
      property_type: propertyTags.length > 0 ? propertyTags[0] : '',
      property_tags: propertyTags,
      title: title,
      url: url.startsWith('http') ? url : `https://suumo.jp${url}`,
      
      // Images
      main_image_url: mainImageUrl,
      additional_image_urls: additionalImageUrls,
      
      // Property details from dottable section
      ...propertyDetails,
      
      // Ensure all required fields from RetrieveCommand are present
      area: propertyDetails.land_area || 0,
      coverage: propertyDetails.building_coverage || 0,
      volume: propertyDetails.floor_area_ratio || 0,
      station_distance: propertyDetails.walking_minutes || 0,
      
      // Location data from parsed address
      postal_code: '',
      state: addressComponents.province,
      city: addressComponents.city,
      district: addressComponents.district,
      
      // Add timestamp
      insert_date: new Date().toISOString().split('T')[0]
    };
  } catch (error) {
    console.error('Error parsing item:', error);
    return null;
  }
}

/**
 * Get an element using XPath
 */
function getElement(element: Element, xpathQuery: string): string | undefined {
  try {
    const node = xpath.select1(xpathQuery, element) as Node;
    
    if (node) {
      if (node.nodeType === 2) { // Attribute node
        return node.nodeValue || undefined;
      } else {
        return node.textContent || undefined;
      }
    }
    
    return undefined;
  } catch (error) {
    console.error(`Error getting element with query ${xpathQuery}:`, error);
    return undefined;
  }
}

/**
 * Parse station information
 */
export function parseStation(station: string): { line: string, station: string, foot: number } {
  const matches = station.match(/([^「]+)「([^」]+)」/u);
  const line = matches ? matches[1] : '';
  const stationName = matches ? matches[2] : '';

  let byFoot = 0;
  const footMatch = station.match(/(徒歩|歩)([0-9]+)分/u);
  if (footMatch) {
    byFoot = parseInt(footMatch[2]);
  }

  return {
    line,
    station: stationName,
    foot: byFoot
  };
}

/**
 * Parse area value
 */
export function parseArea(area: string): number {
  if (!area) return 0;
  
  if (area.includes('㎡')) {
    return parseFloat(area.substring(0, area.indexOf('㎡')));
  }
  return parseFloat(area.substring(0, area.indexOf('m')));
}

/**
 * Parse price value
 */
export function parsePrice(price: string): number {
  let cleanPrice = price;
  const splitTilde = cleanPrice.indexOf('～');
  if (splitTilde !== -1) {
    cleanPrice = cleanPrice.substring(0, splitTilde - 1);
  }
  
  const splitDot = cleanPrice.indexOf('・');
  if (splitDot !== -1) {
    cleanPrice = cleanPrice.substring(0, splitDot - 1);
  }

  const okuMatch = cleanPrice.match(/([0-9])億/u);
  const manMatch = cleanPrice.match(/([0-9]+)万/u);
  const yenMatch = cleanPrice.match(/万([0-9])/u);

  let totalPrice = 0;
  if (okuMatch && okuMatch[1] !== '') {
    totalPrice += parseInt(okuMatch[1]) * 10000 * 10000;
  }
  
  if (manMatch && manMatch[1] !== '') {
    totalPrice += parseInt(manMatch[1]) * 10000;
  }
  
  if (yenMatch && yenMatch[1] !== '') {
    totalPrice += parseInt(yenMatch[1]) * 1000; // Multiply by 1000 for single-digit yen values
  }

  return totalPrice;
}

/*

Get useful infro from an element
*/
function getElementInfo(element: Element): {
  nodeType: string;
  attributes: Record<string, string>;
  textContent: string;
  outerHTML: string;
  innerHTML: string;
} {
    return {
        nodeType: element.nodeName,
        attributes: Array.from(element.attributes).reduce((acc, attr) => {
            acc[attr.name] = attr.value || '';
            return acc;
        }, {} as Record<string, string>),
        textContent: element.textContent || '',
        outerHTML: element.outerHTML,
        innerHTML: element.innerHTML,
    };
}

/**
 * Recursively search for elements matching specific criteria
 * @param element The root element to start searching from
 * @param nodeType The node type to match (e.g., 'div', 'span', 'a')
 * @param attributeMatchers Object with attribute names as keys and regex patterns as values
 * @param maxDepth Maximum depth to search (default: Infinity)
 * @param currentDepth Current depth in the recursion (internal use)
 * @returns Array of matching elements
 */
export function findElementsRecursive(
  element: Element,
  nodeType?: string,
  attributeMatchers?: Record<string, RegExp>,
  maxDepth: number = Infinity,
  currentDepth: number = 0
): Element[] {
  // Stop if we've reached max depth
  if (currentDepth > maxDepth) {
    return [];
  }

  const results: Element[] = [];
  
  // Check if current element matches criteria
  if (matchesElement(element, nodeType, attributeMatchers)) {
    results.push(element);
  }
  
  // Recursively check children
  const children = element.childNodes;
  if (children) {
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.nodeType === 1) { // Element node
        const childResults = findElementsRecursive(
          child as Element,
          nodeType,
          attributeMatchers,
          maxDepth,
          currentDepth + 1
        );
        results.push(...childResults);
      }
    }
  }
  
  return results;
}

/**
 * Check if an element matches the specified criteria
 * @param element Element to check
 * @param nodeType Optional node type to match
 * @param attributeMatchers Optional attribute matchers
 * @returns True if the element matches all criteria
 */
function matchesElement(
  element: Element,
  nodeType?: string,
  attributeMatchers?: Record<string, RegExp>
): boolean {
  // Check node type if specified
  if (nodeType && element.nodeName.toLowerCase() !== nodeType.toLowerCase()) {
    return false;
  }
  
  // Check attributes if specified
  if (attributeMatchers) {
    for (const [attrName, pattern] of Object.entries(attributeMatchers)) {
      const attrValue = element.getAttribute(attrName);
      
      // If attribute doesn't exist or doesn't match pattern, return false
      if (!attrValue || !pattern.test(attrValue)) {
        return false;
      }
    }
  }
  
  // If we got here, all checks passed
  return true;
}

/**
 * Find the first element matching the criteria
 * @param element The root element to start searching from
 * @param nodeType The node type to match (e.g., 'div', 'span', 'a')
 * @param attributeMatchers Object with attribute names as keys and regex patterns as values
 * @param maxDepth Maximum depth to search (default: Infinity)
 * @returns The first matching element or null if none found
 */
export function findFirstElementRecursive(
  element: Element,
  nodeType?: string,
  attributeMatchers?: Record<string, RegExp>,
  maxDepth: number = Infinity
): Element | null {
  const results = findElementsRecursive(element, nodeType, attributeMatchers, maxDepth);
  return results.length > 0 ? results[0] : null;
}

/**
 * Get text content from the first element matching criteria
 * @param element The root element to start searching from
 * @param nodeType The node type to match
 * @param attributeMatchers Object with attribute names as keys and regex patterns as values
 * @param maxDepth Maximum depth to search (default: Infinity)
 * @returns Text content of the first matching element or undefined if none found
 */
export function getTextFromMatchingElement(
  element: Element,
  nodeType?: string,
  attributeMatchers?: Record<string, RegExp>,
  maxDepth: number = Infinity
): string | undefined {
  const matchedElement = findFirstElementRecursive(element, nodeType, attributeMatchers, maxDepth);
  return matchedElement?.textContent || undefined;
}

/**
 * A minimal XPath-like implementation using our recursive search
 * Supports a subset of XPath syntax:
 * - '//' for descendant search
 * - Element name (e.g., 'div')
 * - Attribute filters with [@attr="value"] or [@attr]
 * - Class shorthand with [class~="value"] (contains class)
 * - Text content filter with [text()="value"] or [contains(text(),"value")]
 * - Multiple conditions with [condition1][condition2]
 * - Multiple path segments with //div//span
 * 
 * Examples:
 * - '//div' - Find all div elements
 * - '//div[@class="container"]' - Find divs with class="container"
 * - '//a[@href]' - Find all links with href attribute
 * - '//span[contains(text(),"Price")]' - Find spans containing "Price"
 * - '//div[class~="item"][contains(text(),"Sale")]' - Find divs with class containing "item" and text containing "Sale"
 * - '//ul[class~="list"]//li//span' - Find spans inside li elements that are inside ul elements with class containing "list"
 * 
 * @param element Root element to search from
 * @param query XPath-like query string
 * @returns Array of matching elements
 */
export function simpleXPath(element: Element, query: string): Element[] {
  // Handle empty or invalid queries
  if (!query || typeof query !== 'string') {
    return [];
  }
  
  // Only support descendant search for now (starts with // or .//)
  if (!query.startsWith('//') && !query.startsWith('.//')) {
    console.warn('Only descendant search (//) is supported');
    return [];
  }
  
  // Remove the leading .// or //
  let cleanQuery = query.startsWith('.//') ? query.substring(3) : query.substring(2);
  
  // Split the query into path segments
  const pathSegments = cleanQuery.split('//');
  
  // Start with the root element
  let currentElements: Element[] = [element];
  
  // Process each path segment
  for (const segment of pathSegments) {
    if (!segment) continue; // Skip empty segments
    
    // Parse the element type and conditions for this segment
    const elementTypeMatch = segment.match(/^([a-zA-Z0-9_-]+)(.*)$/);
    if (!elementTypeMatch) {
      return [];
    }
    
    const elementType = elementTypeMatch[1];
    const conditionsStr = elementTypeMatch[2] || '';
    
    // Parse conditions
    const conditions: Array<{type: string, attr?: string, value?: string, contains?: boolean}> = [];
    
    // Match all condition blocks [...][...]
    const conditionBlocks = conditionsStr.match(/\[([^\]]*)\]/g) || [];
    
    for (const block of conditionBlocks) {
      // Remove the brackets
      const condition = block.substring(1, block.length - 1);
      
      // Check for attribute condition: [@attr="value"] or [@attr]
      const attrMatch = condition.match(/@([a-zA-Z0-9_-]+)(?:="([^"]*)")?/);
      if (attrMatch) {
        conditions.push({
          type: 'attribute',
          attr: attrMatch[1],
          value: attrMatch[2],
          contains: false
        });
        continue;
      }
      
      // Check for class shorthand: [class~="value"]
      const classMatch = condition.match(/class~="([^"]*)"/);
      if (classMatch) {
        conditions.push({
          type: 'attribute',
          attr: 'class',
          value: classMatch[1],
          contains: true
        });
        continue;
      }
      
      // Check for text content: [text()="value"]
      const textMatch = condition.match(/text\(\)="([^"]*)"/);
      if (textMatch) {
        conditions.push({
          type: 'text',
          value: textMatch[1],
          contains: false
        });
        continue;
      }
      
      // Check for contains text: [contains(text(),"value")]
      const containsTextMatch = condition.match(/contains\(text\(\),"([^"]*)"\)/);
      if (containsTextMatch) {
        conditions.push({
          type: 'text',
          value: containsTextMatch[1],
          contains: true
        });
        continue;
      }
    }
    
    // Build attribute matchers for our recursive search
    const attributeMatchers: Record<string, RegExp> = {};
    let textContentMatcher: {value: string, contains: boolean} | null = null;
    
    for (const condition of conditions) {
      if (condition.type === 'attribute' && condition.attr) {
        if (condition.value !== undefined) {
          // If contains is true, use a regex that checks for the value anywhere in the attribute
          // Otherwise, match the exact value
          attributeMatchers[condition.attr] = condition.contains === true
            ? new RegExp(escapeRegExp(condition.value)) 
            : new RegExp(`^${escapeRegExp(condition.value)}$`);
        } else {
          // Just check for attribute existence
          attributeMatchers[condition.attr] = /.*/;
        }
      } else if (condition.type === 'text' && condition.value !== undefined) {
        textContentMatcher = {
          value: condition.value,
          contains: condition.contains === true
        };
      }
    }
    
    // Collect results from all current elements
    const nextElements: Element[] = [];
    
    for (const currentElement of currentElements) {
      // Perform the recursive search for this element
      const matchedElements = findElementsRecursive(currentElement, elementType, attributeMatchers);
      
      // If we have a text content matcher, filter the results further
      if (textContentMatcher) {
        const filteredElements = matchedElements.filter(el => {
          const text = el.textContent || '';
          return textContentMatcher!.contains 
            ? text.includes(textContentMatcher!.value)
            : text === textContentMatcher!.value;
        });
        nextElements.push(...filteredElements);
      } else {
        nextElements.push(...matchedElements);
      }
    }
    
    // Update current elements for the next iteration
    currentElements = nextElements;
    
    // If we have no elements at this point, we can stop early
    if (currentElements.length === 0) {
      return [];
    }
  }
  
  return currentElements;
}

/**
 * Find the first element matching the XPath-like query
 * @param element Root element to search from
 * @param query XPath-like query string
 * @returns First matching element or null if none found
 */
export function simpleXPathSelect1(element: Element, query: string): Element | null {
  const results = simpleXPath(element, query);
  return results.length > 0 ? results[0] : null;
}

/**
 * Get text content from the first element matching the XPath-like query
 * @param element Root element to search from
 * @param query XPath-like query string
 * @returns Text content of the first matching element or undefined if none found
 */
export function getElementBySimpleXPath(element: Element, query: string): string | undefined {
  const matchedElement = simpleXPathSelect1(element, query);
  if (!matchedElement) {
    return undefined;
  }
  
  // Check if the query ends with /@attribute to extract attribute value
  const attrMatch = query.match(/\/@([a-zA-Z0-9_-]+)$/);
  if (attrMatch) {
    return matchedElement.getAttribute(attrMatch[1]) || undefined;
  }
  
  return matchedElement.textContent || undefined;
}

/**
 * Escape special characters in a string for use in a regular expression
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parse key-value pairs from a dottable HTML structure
 * Extracts all dt/dd pairs from the provided element
 * 
 * @param element The root element containing the dottable structure
 * @returns Record of key-value pairs
 */
export function parseDottableKeyValues(element: Element): Record<string, string> {
  const result: Record<string, string> = {};
  
  // Find all dottable-line divs
  const dottableLines = simpleXPath(element, '//div[class~="dottable-line"]');
  
  for (const line of dottableLines) {
    // Process simple dt/dd pairs
    const dtElements = simpleXPath(line, '//dt');
    
    for (const dt of dtElements) {
      const key = dt.textContent?.trim() || '';
      if (!key) continue;
      
      // Find the corresponding dd element (sibling of dt)
      const parent = dt.parentNode;
      if (!parent) continue;
      
      const dd = simpleXPath(parent as Element, '//dd')[0];
      if (!dd) continue;
      
      // Check if dd contains a span with dottable-value class
      const valueSpan = simpleXPath(dd, '//span[class~="dottable-value"]')[0];
      const value = valueSpan ? valueSpan.textContent?.trim() : dd.textContent?.trim();
      
      if (value) {
        result[key] = value;
      }
    }
    
    // Handle table structure (for cases like land area and price per tsubo)
    const tableRows = simpleXPath(line, '//tr');
    for (const row of tableRows) {
      const cells = simpleXPath(row, '//td');
      
      for (const cell of cells) {
        const dt = simpleXPath(cell, '//dt')[0];
        const dd = simpleXPath(cell, '//dd')[0];
        
        if (dt && dd) {
          const key = dt.textContent?.trim() || '';
          const value = dd.textContent?.trim() || '';
          
          if (key && value) {
            result[key] = value;
          }
        }
      }
    }
  }
  
  // Process special cases
  
  // Extract property name if available
  const propertyNameDt = simpleXPathSelect1(element, '//dt[text()="物件名"]');
  if (propertyNameDt) {
    const parent = propertyNameDt.parentNode;
    if (parent) {
      const dd = simpleXPathSelect1(parent as Element, '//dd');
      if (dd && dd.textContent) {
        result['物件名'] = dd.textContent.trim();
      }
    }
  }
  
  // Extract photos information
  const photosUl = simpleXPathSelect1(element, '//ul[class~="property_unit-info-pct"]');
  if (photosUl) {
    const photoItems = simpleXPath(photosUl, '//li');
    if (photoItems.length > 0) {
      const photoTypes = photoItems.map(item => {
        const span = simpleXPathSelect1(item, '//span');
        return span?.textContent?.trim() || '';
      }).filter(text => text);
      
      if (photoTypes.length > 0) {
        result['掲載写真'] = photoTypes.join(', ');
      }
    }
  }
  
  return result;
}

/**
 * Parse key-value pairs and convert to appropriate types
 * 
 * @param element The root element containing the dottable structure
 * @returns Processed object with typed values
 */
export function parsePropertyDetails(element: Element): Pick<PropertyItem, 'price' | 'land_area' | 'address' | 'train_line' | 'train_station' | 'walking_minutes' | 'station_distance' | 'building_coverage' | 'floor_area_ratio' | 'price_per_tsubo' | 'photo_types' | 'property_name' | 'type' | 'additional_fields' | 'price_text' | 'land_area_text' | 'coverage' | 'volume' | 'building_area' | 'type'> {
  const rawData = parseDottableKeyValues(element);
  const result: Pick<PropertyItem, 'price' | 'land_area' | 'address' | 'train_line' | 'train_station' | 'walking_minutes' | 'station_distance' | 'building_coverage' | 'floor_area_ratio' | 'price_per_tsubo' | 'photo_types' | 'property_name' | 'type' | 'additional_fields' | 'price_text' | 'land_area_text' | 'coverage' | 'volume' | 'building_area' | 'type'> = {
    price: 0,
    land_area: 0,
    address: '',
    train_line: '',
    train_station: '',
    walking_minutes: 0,
    station_distance: 0,
    building_coverage: 0,
    floor_area_ratio: 0,
    price_per_tsubo: 0,
    photo_types: [],
    property_name: '',
    type: '',
    additional_fields: {},
    price_text: '',
    land_area_text: '',
    coverage: 0,
    volume: 0,
    building_area: 0,
  };
  
  // Process each field with appropriate type conversion
  for (const [key, value] of Object.entries(rawData)) {
    switch (key) {
      case '販売価格':
        result.price = parsePrice(value);
        result.price_text = value;
        break;
        
      case '土地面積':
        result.land_area = parseArea(value);
        result.land_area_text = value;
        break;
        
      case '所在地':
        result.address = value;
        break;
        
      case '沿線・駅':
        const stationInfo = parseStation(value);
        result.train_line = stationInfo.line;
        result.train_station = stationInfo.station;
        result.walking_minutes = stationInfo.foot;
        result.station_distance = stationInfo.foot; // For compatibility with RetrieveCommand
        break;
        
      case '建ぺい率・容積率':
        const coverageMatch = value.match(/建ぺい率[：・]([0-9]+)％/);
        const volumeMatch = value.match(/容積率[：・]([0-9]+)％/);
        
        result.building_coverage = coverageMatch ? parseInt(coverageMatch[1]) : 0;
        result.floor_area_ratio = volumeMatch ? parseInt(volumeMatch[1]) : 0;
        result.coverage = result.building_coverage; // For compatibility with RetrieveCommand
        result.volume = result.floor_area_ratio; // For compatibility with RetrieveCommand
        break;
        
      case '物件名':
        result.property_name = value;
        break;
        
      case '坪単価':
        if (value !== '-') {
          const priceMatch = value.match(/([0-9,.]+)万円/);
          result.price_per_tsubo = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) * 10000 : 0;
        } else {
          result.price_per_tsubo = 0;
        }
        break;
        
      case '掲載写真':
        result.photo_types = value.split(', ');
        break;
        
      case '建物面積':
        result.building_area = parseArea(value);
        break;
        
      case '間取り':
        result.type = value;
        break;
        
      default:
        // Store other fields as-is in a separate object to avoid polluting the main type
        if (!result.additional_fields) {
          result.additional_fields = {};
        }
        (result.additional_fields as Record<string, string>)[key] = value;
    }
  }
  
  return result;
}

/**
 * Parses a Japanese address into province, city, and district components.
 * 
 * Examples:
 * - 北海道滝川市朝日町西３ -> { province: '北海道', city: '滝川市', district: '朝日町西３' }
 * - 北海道茅部郡鹿部町字本別 -> { province: '北海道', city: '茅部郡鹿部町', district: '字本別' }
 * 
 * @param address The full Japanese address to parse
 * @returns An object containing the parsed province, city, and district
 */
export function parseJapaneseAddress(address: string): { 
  province: string; 
  city: string; 
  district: string;
} {
  // Default values
  const result = {
    province: '',
    city: '',
    district: ''
  };

  if (!address) return result;

  // List of all Japanese prefectures
  const prefectures = [
    '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
    '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
    '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
    '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
    '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
    '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
    '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'
  ];

  // Sort prefectures by length (longest first) to avoid partial matches
  const sortedPrefectures = [...prefectures].sort((a, b) => b.length - a.length);

  // Find the prefecture
  for (const prefecture of sortedPrefectures) {
    if (address.startsWith(prefecture)) {
      result.province = prefecture;
      // Remove the prefecture from the address
      address = address.substring(prefecture.length);
      break;
    }
  }

  // If no prefecture was found, return the default values
  if (!result.province) return result;

  // Common city suffixes in Japanese addresses
  const citySuffixes = ['市', '区', '町', '村'];
  const gunSuffixes = ['郡'];
  
  // Try to find the city part
  let cityEndIndex = -1;
  
  // First check for patterns like "XX郡YY町" (gun-machi pattern)
  const gunMatch = address.match(/^(.+?郡.+?[町村])/);
  if (gunMatch) {
    result.city = gunMatch[1];
    cityEndIndex = gunMatch[1].length;
  } else {
    // Check for regular city patterns
    for (const suffix of citySuffixes) {
      const index = address.indexOf(suffix);
      if (index !== -1) {
        cityEndIndex = index + suffix.length;
        result.city = address.substring(0, cityEndIndex);
        break;
      }
    }
  }

  // If we found a city, the rest is the district
  if (cityEndIndex !== -1) {
    result.district = address.substring(cityEndIndex).trim();
  } else {
    // If we couldn't identify the city, use a fallback approach
    // This is a simplistic approach - in a real system, you might want more sophisticated parsing
    result.district = address.trim();
  }

  return result;
} 