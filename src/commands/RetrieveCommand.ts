import { DOMParser } from "@xmldom/xmldom";
import prisma from '../../app/utils/db.server.js';
import { EventEmitter } from 'events';
import * as xpath from 'xpath';
import * as fs from 'fs';
import * as path from 'path';
import { Prisma } from '@prisma/client';
import { parseItems, parseItemsForDB, PropertyItemDB, simpleXPathSelect1 } from '../../app/utils/parseUtils.js';
import { parseRentalBuildings, parseRentalUnitsForDB, RentalBuilding, RentalUnitDB } from '../../app/utils/rentalParseUtils.js';
import { processStationInfo } from '../../app/utils/trainUtils.server.js';

interface InputInterface {
  region?: string
  province?: string
  type?: string
  refresh?: boolean
}

class RetrieveCommand extends EventEmitter {
  // Add event declarations for TypeScript
  on(event: 'total-items', listener: (total: number) => void): this;
  on(event: 'sections-to-fetch', listener: (sections: number) => void): this;
  on(event: 'sections-processed', listener: (sections: number) => void): this;
  on(event: 'items-processed', listener: (items: number, regionId: string, provinceId: string, type: string) => void): this;
  on(event: 'before-page-fetch', listener: (page: number, totalPages: number) => void): this;
  on(event: 'before-item-process', listener: (suumoId: string) => void): this;
  on(event: 'download-progress', listener: (sectionsProcessed: number, sectionsTotal: number, itemsTotal: number) => void): this;
  on(event: 'page-download-progress', listener: (pagesProcessed: number, totalPages: number) => void): this;
  on(event: string, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }

  emit(event: 'total-items', total: number): boolean;
  emit(event: 'sections-to-fetch', sections: number): boolean;
  emit(event: 'sections-processed', sections: number): boolean;
  emit(event: 'items-processed', items: number, regionId: string, provinceId: string, type: string): boolean;
  emit(event: 'before-page-fetch', page: number, totalPages: number): boolean;
  emit(event: 'before-item-process', suumoId: string): boolean;
  emit(event: 'download-progress', sectionsProcessed: number, sectionsTotal: number, itemsTotal: number): boolean;
  emit(event: 'page-download-progress', pagesProcessed: number, totalPages: number): boolean;
  emit(event: string, ...args: any[]): boolean {
    return super.emit(event, ...args);
  }

  private types = {
    '040': 'Rental',
    '030': 'Land',
    '021': 'Second-hand house',
    '020': 'New house',
    '011': 'Second-hand mansion',
    '010': 'New mansion'
  };

  private areas = {
    '010': {
      'name': 'Hokkaido',
      'provinces': {
        '01': 'Hokkaido',
      }
    },
    '020': {
      'name': 'Tohoku',
      'provinces': {
        '02': 'Aomori',
        '03': 'Iwate',
        '04': 'Miyagi',
        '05': 'Akita',
        '06': 'Yamagata',
        '07': 'Fukushima'
      }
    },
    '030': {
      'name': 'Kanto',
      'provinces': {
        '08': 'Ibaraki',
        '09': 'Tochigi',
        '10': 'Gunma',
        '11': 'Saitama',
        '12': 'Chiba',
        '13': 'Tokyo',
        '14': 'Kanagawa'
      }
    },
    '040': {
      'name': 'Hokuriku',
      'provinces': {
        '15': 'Niigata',
        '16': 'Toyama',
        '17': 'Ishikawa',
        '18': 'Fukui',
        '19': 'Yamanashi',
        '20': 'Nagano',
      }
    },
    '050': {
      'name': 'Tokai',
      'provinces': {
        '21': 'Gifu',
        '22': 'Shizuoka',
        '23': 'Aichi',
        '24': 'Mie',
      }
    },
    '060': {
      'name': 'Kansai',
      'provinces': {
        '25': 'Shiga',
        '26': 'Kyoto',
        '27': 'Osaka',
        '28': 'Hyogo',
        '29': 'Nara',
        '30': 'Wakayama'
      }
    },
    '080': {
      'name': 'Chugoku',
      'provinces': {
        '31': 'Tottori',
        '32': 'Shimane',
        '33': 'Okayama',
        '34': 'Hiroshima',
        '35': 'Yamaguchi'
      }
    },
    '070': {
      'name': 'Shikoku',
      'provinces': {
        '36': 'Tokushima',
        '37': 'Kagawa',
        '38': 'Ehime',
        '39': 'Kochi',
      }
    },
    '090': {
      'name': 'Kyushu',
      'provinces': {
        '40': 'Fukuoka',
        '41': 'Saga',
        '42': 'Nagasaki',
        '43': 'Kumamoto',
        '44': 'Oita',
        '45': 'Miyazaki',
        '46': 'Kagoshima',
        '47': 'Okinawa'
      }
    }
  };

  // Base URL for purchase properties
  private purchaseBase = 'https://suumo.jp/jj/bukken/ichiran/JJ012FC001/?ar={area}&bs={type}&ta={province}&pn={page}&ekTjCd=&ekTjNm=&kb=1&kj=9&km=1&kt=9999999&ta=13&tb=0&tj=0&tt=9999999&po=0&pj=1&pc=100';
  
  // Base URL for rental properties
  private rentalBase = 'https://suumo.jp/jj/chintai/ichiran/FR301FC001/?ar={area}&bs={type}&ta={province}&page={page}&pc=50&cb=0.0&ct=9999999&et=9999999&cn=9999999&mb=0&mt=9999999&shkr1=03&shkr2=03&shkr3=03&shkr4=03&fw2=&srch_navi=1';
                      //https://suumo.jp/jj/chintai/ichiran/FR301FC001/?ar=030&bs=040&ta=13&pc=50&cb=0.0&ct=9999999&mb=0&mt=9999999&et=9999999&cn=9999999&shkr1=03&shkr2=03&shkr3=03&shkr4=03&sngz=&po1=25
                      //https://suumo.jp/jj/chintai/ichiran/FR301FC001/?ar=030&bs=040&ta=13&page=2&pc=50&cb=0.0&ct=9999999&et=9999999&cn=9999999&mb=0&mt=9999999&shkr1=03&shkr2=03&shkr3=03&shkr4=03&fw2=&srch_navi=1
  
  private perPage = 100;
  private existingIds: Set<string> = new Set();
  public cancelled = false;

  public async execute(input: InputInterface) {
    this.cancelled = false;
    if (!process.env.DATABASE_URL) {
      throw new Error("Need DATABASE_URL to be defined.")
    }

    if (input.refresh) {
      await prisma.page.deleteMany();
    }

    // Load existing IDs and their details
    const existingProperties = await prisma.property.findMany({
      select: { 
        id: true,
        suumo_id: true,
        price: true,
        price_text: true,
        last_updated: true
      }
    });
    
    // Create a map of existing properties by suumo_id for quick lookup
    const existingPropertiesMap: Record<string, { id: number, price: number, price_text: string | null, last_updated: Date }> = {};
    existingProperties.forEach(item => {
      this.existingIds.add(item.suumo_id);
      existingPropertiesMap[item.suumo_id] = {
        id: item.id,
        price: item.price,
        price_text: item.price_text,
        last_updated: item.last_updated
      };
    });

    // Count the number of sections to fetch
    let sectionsToFetch = 0;
    const sectionsToProcess: Array<{regionId: string, provinceId: string, type: string}> = [];
    
    for (const [typeId, typeName] of Object.entries(this.types)) {
      if (input.type && typeId !== input.type) {
        continue;
      }
      for (const [regionId, region] of Object.entries(this.areas)) {
        if (input.region && regionId !== input.region) {
          continue;
        }
        for (const [provinceId, provinceName] of Object.entries(region.provinces)) {
          if (input.province && provinceId !== input.province) {
            continue;
          }
          sectionsToFetch++;
          sectionsToProcess.push({regionId, provinceId, type: typeId});
        }
      }
    }
    
    // Emit the sections to fetch
    this.emit('sections-to-fetch', sectionsToFetch);
    
    // Phase 1: First pass - Calculate total pages across all sections
    console.log(`Starting calculation phase for ${sectionsToFetch} sections`);
    let sectionsCalculated = 0;
    let totalItems = 0;
    let totalPages = 0;
    
    // Map to store page counts for each section
    const sectionPageCounts: Map<string, number> = new Map();
    
    // First pass: Calculate total pages for all sections
    for (const section of sectionsToProcess) {
      if (this.cancelled) {
        console.log('Calculation phase cancelled');
        break;
      }
      
      const { regionId, provinceId, type } = section;
      const sectionKey = `${regionId}-${provinceId}-${type}`;
      
      try {        
        // Check cancellation again right before the potentially long-running operation
        if (this.cancelled) {
          console.log('Calculation phase cancelled');
          break;
        }
        
        // Get the first page to determine total items for this section
        const firstPage = await this.getPage(1, regionId, provinceId, type);
        const sectionTotalItems = this.getTotalItems(firstPage);
        totalItems += sectionTotalItems;
        
        // Calculate total pages for this section
        const sectionTotalPages = this.getTotalPages(firstPage);
        sectionPageCounts.set(sectionKey, sectionTotalPages);
        totalPages += sectionTotalPages;
        
        // Emit progress for this section calculation
        sectionsCalculated++;
        this.emit('sections-processed', sectionsCalculated);
        
        console.log(`Section ${sectionKey}: ${sectionTotalItems} items, ${sectionTotalPages} pages`);
      } catch (error) {
        console.error(`Error calculating section ${sectionKey}:`, error);
      }
    }
    
    // Phase 2: Download all pages
    console.log(`Starting download phase for ${totalPages} pages across ${sectionsToFetch} sections`);
    let pagesDownloaded = 0;
    let sectionsProcessed = 0;
    
    const currentlyCachedKeys = await prisma.page.findMany({
      select: {
        url: true
      }
    });
    const currentlyCachedKeysSet = new Set(currentlyCachedKeys.map(page => page.url));

    // Reset sections processed counter for the download phase
    this.emit('sections-processed', 0);
    
    // Second pass: Download all pages for all sections
    for (const section of sectionsToProcess) {
      if (this.cancelled) {
        console.log('Download phase cancelled');
        break;
      }
      
      const { regionId, provinceId, type } = section;
      const sectionKey = `${regionId}-${provinceId}-${type}`;
      const sectionTotalPages = sectionPageCounts.get(sectionKey) || 0;
      
      try {
        // The first page was already downloaded during calculation phase
        pagesDownloaded++;
        this.emit('page-download-progress', pagesDownloaded, totalPages);
        
        // Download remaining pages for this section
        for (let page = 2; page <= sectionTotalPages; page++) {
          if (this.cancelled) {
            console.log('Download phase cancelled');
            break;
          }
          
          // Emit event before fetching page to allow for cancellation
          this.emit('before-page-fetch', page, sectionTotalPages);
          
          // Download the page
          const pageUrl = this.getPageUrl(page, regionId, provinceId, type);
          if (currentlyCachedKeysSet.has(pageUrl)) {
            pagesDownloaded++;
            this.emit('page-download-progress', pagesDownloaded, totalPages);
            continue;
          }
          await this.getPage(page, regionId, provinceId, type);
          pagesDownloaded++;
          this.emit('page-download-progress', pagesDownloaded, totalPages);
        }
        
        // Emit progress for this section
        sectionsProcessed++;
        this.emit('sections-processed', sectionsProcessed);
        this.emit('download-progress', sectionsProcessed, sectionsToFetch, totalItems);
      } catch (error) {
        console.error(`Error downloading section ${sectionKey}:`, error);
      }
    }
    
    // Emit the total items found
    this.emit('total-items', totalItems);
    console.log(`Download phase completed. Downloaded ${pagesDownloaded}/${totalPages} pages containing ${totalItems} items.`);
    
    // Phase 3: Process all downloaded pages
    console.log('Starting processing phase');
    sectionsProcessed = 0;
    let processedItems = 0;
    
    // Reset sections processed counter for the processing phase
    this.emit('sections-processed', 0);
    
    for (const section of sectionsToProcess) {
      if (this.cancelled) {
        console.log('Processing phase cancelled');
        break;
      }
      
      const { regionId, provinceId, type } = section;
      const sectionKey = `${regionId}-${provinceId}-${type}`;
      
      try {
        await this.fetchRegionProvince(regionId, provinceId, type, existingPropertiesMap);
        sectionsProcessed++;
        this.emit('sections-processed', sectionsProcessed);
      } catch (error) {
        console.error(`Error processing section ${sectionKey}:`, error);
      }
    }
    
    console.log('Processing phase completed');
    return { success: true };
  }

  private async fetchRegionProvince(
    regionId: string, 
    provinceId: string, 
    type: string, 
    existingPropertiesMap: Record<string, { id: number, price: number, price_text: string | null, last_updated: Date }>
  ) {
    if (this.cancelled) {
      return;
    }

    const region = this.areas[regionId as keyof typeof this.areas];
    if (!region) {
      console.error(`Region ${regionId} not found`);
      return;
    }
    
    const provinceName = region.provinces[provinceId as keyof typeof region.provinces];
    if (!provinceName) {
      console.error(`Province ${provinceId} not found in region ${regionId}`);
      return;
    }
    
    const propertyType = this.types[type as keyof typeof this.types] || 'Unknown';
    console.log(`Processing ${propertyType} in ${region.name}, ${provinceName}`);
    
    let processedItems = 0;
    let pageNumber = 1;
    
    // Process all pages from the database for this region/province/type
    while (true) {
      if (this.cancelled) {
        console.log('Processing cancelled');
        break;
      }
      
      // Choose the appropriate base URL based on property type
      const baseUrl = type === '040' ? this.rentalBase : this.purchaseBase;
      
      // Get the page from the database
      const url = baseUrl
        .replace('{area}', regionId)
        .replace('{type}', type)
        .replace('{page}', pageNumber.toString())
        .replace('{province}', provinceId);
      
      const pageRecord = await prisma.page.findFirst({
        where: { url },
        select: { content: true }
      });
      
      if (!pageRecord) {
        // No more pages in the database for this section
        break;
      }
      
      // Parse the page content
      const parser = new DOMParser();
      const document = parser.parseFromString(pageRecord.content, 'text/html');
      
      // Process the items on this page based on type
      let propertyItems;
      if (type === '040') {
        // Rental properties
        propertyItems = parseRentalUnitsForDB(document, regionId, provinceId);
      } else {
        // Purchase properties
        propertyItems = parseItemsForDB(document, regionId, provinceId);
      }
      
      if (propertyItems.length === 0) {
        console.log(`No items found on page ${pageNumber}`);
        break;
      }
      
      // Process the items
      await this.processPropertyItems(propertyItems, type, regionId, provinceId, existingPropertiesMap);
      
      processedItems += propertyItems.length;
      this.emit('items-processed', processedItems, regionId, provinceId, type);
      
      // Move to the next page
      pageNumber++;
    }
  }

  private async processPropertyItems(
    propertyItems: PropertyItemDB[] | RentalUnitDB[], 
    type: string, 
    regionId: string, 
    provinceId: string,
    existingPropertiesMap: Record<string, { id: number, price: number, price_text: string | null, last_updated: Date }>
  ) {
    // Handle differently based on property type
    if (type === '040') {
      // Process rental items
      await this.processRentalItems(propertyItems as RentalUnitDB[], regionId, provinceId);
    } else {
      // Process purchase property items
      await this.processPurchaseItems(propertyItems as PropertyItemDB[], regionId, provinceId, existingPropertiesMap);
    }
  }

  private async processPurchaseItems(
    propertyItems: PropertyItemDB[], 
    regionId: string, 
    provinceId: string,
    existingPropertiesMap: Record<string, { id: number, price: number, price_text: string | null, last_updated: Date }>
  ) {
    const newProperties: PropertyItemDB[] = [];
    const priceHistoryEntries: { property_id: number, price: number, price_text: string | null }[] = [];
    const propertyUpdates: { where: { id: number }, data: any }[] = [];

    // Variables for periodic cancellation check
    let itemsProcessedSinceLastCheck = 0;
    let lastCancellationCheck = Date.now();
    const CANCELLATION_CHECK_INTERVAL = 2000; // Check every 2 seconds
    const ITEMS_PER_CHECK = 50; // Or check after processing 50 items

    for (const item of propertyItems) {
      // Emit event before processing each item to allow for cancellation checks
      this.emit('before-item-process', item.suumo_id);
      
      // Periodic cancellation check instead of checking for every item
      itemsProcessedSinceLastCheck++;
      const now = Date.now();
      if (itemsProcessedSinceLastCheck >= ITEMS_PER_CHECK || now - lastCancellationCheck >= CANCELLATION_CHECK_INTERVAL) {
        if (this.cancelled) {
          console.log('Processing cancelled');
          break;
        }
        itemsProcessedSinceLastCheck = 0;
        lastCancellationCheck = now;
      }
      
      // Check if this property already exists
      const existingProperty = existingPropertiesMap[item.suumo_id];
      
      if (existingProperty) {
        // Property exists, check if price has changed
        if (existingProperty.price !== item.price || existingProperty.price_text !== item.price_text) {
          // Price has changed, create a price history entry
          priceHistoryEntries.push({
            property_id: existingProperty.id,
            price: item.price,
            price_text: item.price_text || null
          });
          
          // Update the property
          propertyUpdates.push({
            where: { id: existingProperty.id },
            data: {
              price: item.price,
              price_text: item.price_text || null,
              last_updated: new Date()
            }
          });
        }
      } else {
        // New property
        newProperties.push(item);
      }
    }
    
    // Atomically create new properties, update existing ones, and record price history
    await prisma.$transaction(async (tx) => {
      // Create new properties
      if (newProperties.length > 0) {
        await tx.property.createMany({
          data: newProperties
        });
      }

      // Update existing properties
      for (const update of propertyUpdates) {
        await tx.property.update(update);
      }

      // Create price history entries
      if (priceHistoryEntries.length > 0) {
        await tx.priceHistory.createMany({
          data: priceHistoryEntries
        });
      }
    });

    console.log(`New properties: ${newProperties.length}, updated properties: ${propertyUpdates.length}, price history entries: ${priceHistoryEntries.length}`);
  }

  private async processRentalItems(
    rentalItems: RentalUnitDB[], 
    regionId: string, 
    provinceId: string,
  ) {
    // Fetch all existing buildings for this region/province upfront
    const existingBuildings = await prisma.building.findMany({
      where: {
        AND: [
          { region: regionId },
          { province: provinceId }
        ]
      },
      select: {
        id: true,
        suumo_id: true
      }
    });

    // Create a lookup map of existing buildings by suumo_id
    const existingBuildingsMap = new Map(
      existingBuildings.map(building => [building.suumo_id, building])
    );

    // Group rental units by building
    const buildingMap: Record<string, {
      building: Prisma.BuildingCreateInput,
      units: RentalUnitDB[]
    }> = {};
    
    // Process each rental item
    for (const item of rentalItems) {
      // skip buildings that have no proper id
      if (item.building_suumo_id === 'building-') {
        continue;
      }
      // Use the building address+title as the unique identifier
      
      if (!buildingMap[item.building_suumo_id]) {
        console.log(`Processing building ${item.building_suumo_id}`);
        // Create a new building entry
        buildingMap[item.building_suumo_id] = {
          building: {
            suumo_id: item.suumo_id,
            url: item.url.split('?')[0], // Base URL without parameters
            building_type: item.building_type,
            title: item.building_title || '',
            address: item.building_address,
            age: item.building_age || '',
            floors: item.building_floors || '',
            main_image_url: item.building_image_url || '',
            stations: item.stations, // Use the actual stations data from the item
            postal_code: item.postal_code || '',
            state: item.state || '',
            city: item.city || '',
            district: item.district || '',
            region: item.region,
            province: item.province,
            insert_date: new Date(),
            last_updated: new Date()
          },
          units: []
        };
      }
      
      // Add the unit to the building
      buildingMap[item.building_suumo_id].units.push(item);
    }
    
    // Process buildings and their units
    for (const buildingKey of Object.keys(buildingMap)) {
      const { building, units } = buildingMap[buildingKey];
      
      // Check if building already exists using the lookup map
      let buildingId: number | null = null;
      const existingBuilding = existingBuildingsMap.get(building.suumo_id);
      
      if (existingBuilding) {
        // Update existing building
        await prisma.building.update({
          where: { id: existingBuilding.id },
          data: {
            last_updated: new Date()
          }
        });
        buildingId = existingBuilding.id;
      } else {
        // Create new building
        
        const newBuilding = await prisma.building.create({
          data: building
        });
        existingBuildingsMap.set(building.suumo_id, newBuilding);
        buildingId = newBuilding.id;
        
      }
      
      // Process stations for the building
      const stationsData = JSON.parse(building.stations);
      if (stationsData && Array.isArray(stationsData) && stationsData.length > 0) {
        await processStationInfo(buildingId, stationsData, building.region);
      }

      // Process rental units for this building
      for (const unit of units) {
        // Atomically check/create/update unit and its price history
        await prisma.$transaction(async (tx) => {
          // Check if unit already exists
          const existingUnit = await tx.rentalUnit.findUnique({
            where: { suumo_id: unit.suumo_id }
          });

          if (existingUnit) {
            // Check if rent has changed
            if (existingUnit.rent !== unit.rent) {
              // Create price history entry
              await tx.rentalPriceHistory.create({
                data: {
                  rental_unit_id: existingUnit.id,
                  rent: unit.rent,
                  rent_text: unit.rent_text || null,
                  management_fee: unit.management_fee,
                  management_fee_text: unit.management_fee_text || null
                }
              });

              // Update unit
              await tx.rentalUnit.update({
                where: { id: existingUnit.id },
                data: {
                  rent: unit.rent,
                  rent_text: unit.rent_text || null,
                  management_fee: unit.management_fee,
                  management_fee_text: unit.management_fee_text || null,
                  last_updated: new Date()
                }
              });
            }
          } else {
            // Create new rental unit
            const newUnit = await tx.rentalUnit.create({
              data: {
                suumo_id: unit.suumo_id,
                suumo_js_id: unit.suumo_js_id,
                url: unit.url,
                floor: unit.floor || '',
                rent: unit.rent,
                rent_text: unit.rent_text || null,
                management_fee: unit.management_fee,
                management_fee_text: unit.management_fee_text || null,
                deposit: unit.deposit || '',
                gratuity: unit.gratuity || '',
                layout: unit.layout || '',
                size: unit.size,
                size_text: unit.size_text || '',
                thumbnail_url: unit.thumbnail_url || '',
                image_urls: unit.image_urls || '',
                tags: unit.tags || '',
                insert_date: new Date(),
                last_updated: new Date(),
                building_id: buildingId
              }
            });

            // Create initial price history entry
            await tx.rentalPriceHistory.create({
              data: {
                rental_unit_id: newUnit.id,
                rent: unit.rent,
                rent_text: unit.rent_text || null,
                management_fee: unit.management_fee,
                management_fee_text: unit.management_fee_text || null
              }
            });
          }
        });
      }
    }
    
    console.log(`Processed ${Object.keys(buildingMap).length} buildings with ${rentalItems.length} rental units`);
  }

  private getPageUrl(pageNr: number, areaId: string, provinceId: string, type: string): string {
    // Choose the appropriate base URL based on property type
    const baseUrl = type === '040' ? this.rentalBase : this.purchaseBase;
    
    return baseUrl
      .replace('{area}', areaId)
      .replace('{type}', type)
      .replace('{page}', pageNr.toString())
      .replace('{province}', provinceId);
  }

  private async getPage(pageNr: number, areaId: string, provinceId: string, type: string): Promise<Document> {
    let url = this.getPageUrl(pageNr, areaId, provinceId, type);
    
    // Check if page exists in database
    const existing = await prisma.page.findFirst({
      where: { url },
      select: { content: true }
    });
    
    if (existing) {
      const parser = new DOMParser();
      return parser.parseFromString(existing.content, 'text/html');
    } else {
      // Fetch the page
      const options = {
        headers: {
          'Connection': 'keep-alive',
          'Cache-Control': 'max-age=0',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
          'Accept-Language': 'en-US,en;q=0.9',
        }
      };
      
      const response = await fetch(url, options);
      const body = await response.text();
      
      // Store the page in the database
      await prisma.page.create({
        data: {
          url,
          content: body,
          kind: 'property-list'
        }
      });
      
      const parser = new DOMParser();
      return parser.parseFromString(body, 'text/html');
    }
  }

  private getTotalItems(document: Document): number {
    try {
      const element = simpleXPathSelect1(document as unknown as Element, '//div[@class="pagination_set-hit"]') as Element;
      
      if (element && element.textContent) {
        return parseInt(element.textContent.trim().replace(',', ''));
      }
    } catch (error) {
      console.error('Error parsing total items:', error);
    }
    
    return 0;
  }

  private getTotalPages(document: Document): number {
    try {
      // Get the pagination list
      const paginationList = simpleXPathSelect1(document as unknown as Element, '//div[contains(@class, "pagination_set-nav")]//ol[@class="pagination-parts"]') as Element;
      
      if (paginationList) {
        // Get all li elements
        const listItems = paginationList.getElementsByTagName('li');
        
        // The last page number is in the last li that has an anchor tag
        for (let i = listItems.length - 1; i >= 0; i--) {
          const anchor = listItems[i].getElementsByTagName('a')[0];
          if (anchor) {
            const pageNumber = parseInt(anchor.textContent?.trim() || '0', 10);
            if (pageNumber > 0) {
              return pageNumber;
            }
          }
        }
        
        // If we didn't find a page number in anchors, check for current page
        // This happens when there's only one page
        const currentPage = paginationList.getElementsByClassName('pagination-current')[0];
        if (currentPage) {
          return parseInt(currentPage.textContent?.trim() || '1', 10);
        }
      }
      
      // If we can't find pagination, assume there's at least one page
      return 1;
    } catch (error) {
      console.error('Error parsing total pages:', error);
      return 1;
    }
  }
}

export default RetrieveCommand;
