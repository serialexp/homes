import { DOMParser } from "@xmldom/xmldom";
import prisma from '../../app/utils/db.server.js';
import { EventEmitter } from 'events';
import { Prisma } from '@prisma/client';
import { parseItemsForDB, PropertyItemDB, simpleXPathSelect1 } from '../../app/utils/parseUtils.js';
import { parseRentalUnitsForDB, RentalUnitDB } from '../../app/utils/rentalParseUtils.js';
import { processStationInfo } from '../../app/utils/trainUtils.server.js';

interface InputInterface {
  region?: string
  province?: string
  type?: string
  refresh?: boolean
}

class RetrieveCommand extends EventEmitter {
  // 30 minute timeout per section as safety net
  private static SECTION_TIMEOUT_MS = 30 * 60 * 1000;
  // Number of consecutive all-known pages before stopping a section
  private static EARLY_STOP_THRESHOLD = 2;

  // Add event declarations for TypeScript
  on(event: 'total-items', listener: (total: number) => void): this;
  on(event: 'sections-to-fetch', listener: (sections: number) => void): this;
  on(event: 'sections-processed', listener: (sections: number) => void): this;
  on(event: 'items-processed', listener: (items: number, regionId: string, provinceId: string, type: string) => void): this;
  on(event: 'before-page-fetch', listener: (page: number, totalPages: number) => void): this;
  on(event: 'before-item-process', listener: (suumoId: string) => void): this;
  on(event: 'section-progress', listener: (sectionKey: string, page: number, totalPages: number, newItems: number, updatedItems: number) => void): this;
  on(event: 'section-early-stop', listener: (sectionKey: string, page: number, totalPages: number) => void): this;
  on(event: 'section-timeout', listener: (sectionKey: string, page: number, totalPages: number) => void): this;
  on(event: string, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }

  emit(event: 'total-items', total: number): boolean;
  emit(event: 'sections-to-fetch', sections: number): boolean;
  emit(event: 'sections-processed', sections: number): boolean;
  emit(event: 'items-processed', items: number, regionId: string, provinceId: string, type: string): boolean;
  emit(event: 'before-page-fetch', page: number, totalPages: number): boolean;
  emit(event: 'before-item-process', suumoId: string): boolean;
  emit(event: 'section-progress', sectionKey: string, page: number, totalPages: number, newItems: number, updatedItems: number): boolean;
  emit(event: 'section-early-stop', sectionKey: string, page: number, totalPages: number): boolean;
  emit(event: 'section-timeout', sectionKey: string, page: number, totalPages: number): boolean;
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

  // Base URL for purchase properties (sorted by 新着・更新順 = newest/updated first via po=1&pj=2)
  private purchaseBase = 'https://suumo.jp/jj/bukken/ichiran/JJ012FC001/?ar={area}&bs={type}&ta={province}&pn={page}&ekTjCd=&ekTjNm=&kb=1&kj=9&km=1&kt=9999999&ta=13&tb=0&tj=0&tt=9999999&po=1&pj=2&pc=100';

  // Base URL for rental properties (sorted by 新着順 = newest first via po1=09)
  private rentalBase = 'https://suumo.jp/jj/chintai/ichiran/FR301FC001/?ar={area}&bs={type}&ta={province}&page={page}&pc=50&po1=09&cb=0.0&ct=9999999&et=9999999&cn=9999999&mb=0&mt=9999999&shkr1=03&shkr2=03&shkr3=03&shkr4=03&fw2=&srch_navi=1';
  
  public cancelled = false;

  public async execute(input: InputInterface) {
    this.cancelled = false;
    if (!process.env.DATABASE_URL) {
      throw new Error("Need DATABASE_URL to be defined.")
    }

    // Load existing purchase property IDs and their details
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
      existingPropertiesMap[item.suumo_id] = {
        id: item.id,
        price: item.price,
        price_text: item.price_text,
        last_updated: item.last_updated
      };
    });

    // Load existing rental unit IDs upfront for early termination checks
    const existingRentalUnits = await prisma.rentalUnit.findMany({
      select: {
        suumo_id: true,
        rent: true
      }
    });
    const existingRentalUnitMap: Record<string, { rent: number }> = {};
    for (const unit of existingRentalUnits) {
      existingRentalUnitMap[unit.suumo_id] = { rent: unit.rent };
    }

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

    // Phase 1: Calculation - fetch page 1 of each section to determine total items/pages
    console.log(`Starting calculation phase for ${sectionsToFetch} sections`);
    let sectionsCalculated = 0;
    let totalItems = 0;

    // Map to store first page documents and page counts for each section
    const sectionPageCounts: Map<string, number> = new Map();
    const sectionFirstPages: Map<string, Document> = new Map();

    for (const section of sectionsToProcess) {
      if (this.cancelled) {
        console.log('Calculation phase cancelled');
        break;
      }

      const { regionId, provinceId, type } = section;
      const sectionKey = `${regionId}-${provinceId}-${type}`;

      try {
        if (this.cancelled) {
          console.log('Calculation phase cancelled');
          break;
        }

        // Fetch the first page directly (no caching — pages are sorted by recency and change every run)
        const firstPage = await this.fetchPageFromSuumo(1, regionId, provinceId, type);
        const sectionTotalItems = this.getTotalItems(firstPage);
        totalItems += sectionTotalItems;

        const sectionTotalPages = this.getTotalPages(firstPage);
        sectionPageCounts.set(sectionKey, sectionTotalPages);
        sectionFirstPages.set(sectionKey, firstPage);

        sectionsCalculated++;
        this.emit('sections-processed', sectionsCalculated);

        console.log(`Section ${sectionKey}: ${sectionTotalItems} items, ${sectionTotalPages} pages`);
      } catch (error) {
        console.error(`Error calculating section ${sectionKey}:`, error);
      }
    }

    this.emit('total-items', totalItems);

    // Phase 2: Retrieval - for each section, fetch pages and process them immediately.
    // Stop early when we reach properties we already know about (sorted by recency).
    console.log(`Starting retrieval phase for ${sectionsToFetch} sections`);
    let sectionsProcessed = 0;

    // Signal transition to retrieval phase
    this.emit('sections-processed', 0);

    for (const section of sectionsToProcess) {
      if (this.cancelled) {
        console.log('Retrieval phase cancelled');
        break;
      }

      const { regionId, provinceId, type } = section;
      const sectionKey = `${regionId}-${provinceId}-${type}`;
      const sectionTotalPages = sectionPageCounts.get(sectionKey) || 0;
      const firstPage = sectionFirstPages.get(sectionKey);

      if (!firstPage || sectionTotalPages === 0) {
        sectionsProcessed++;
        this.emit('sections-processed', sectionsProcessed);
        continue;
      }

      const region = this.areas[regionId as keyof typeof this.areas];
      const provinceName = region?.provinces[provinceId as keyof typeof region.provinces] || provinceId;
      const propertyType = this.types[type as keyof typeof this.types] || 'Unknown';
      console.log(`Retrieving ${propertyType} in ${region?.name}, ${provinceName}`);

      const sectionStartTime = Date.now();
      let consecutiveAllKnownPages = 0;
      let sectionProcessedItems = 0;
      let sectionNewItems = 0;
      let sectionUpdatedItems = 0;
      let earlyStop = false;
      let timedOut = false;

      try {
        for (let page = 1; page <= sectionTotalPages; page++) {
          if (this.cancelled) {
            console.log('Retrieval cancelled');
            break;
          }

          // Check 30-minute section timeout
          const elapsed = Date.now() - sectionStartTime;
          if (elapsed > RetrieveCommand.SECTION_TIMEOUT_MS) {
            console.log(`Section ${sectionKey} timed out after ${Math.round(elapsed / 60000)} minutes on page ${page}/${sectionTotalPages}`);
            this.emit('section-timeout', sectionKey, page, sectionTotalPages);
            timedOut = true;
            break;
          }

          // Emit event before fetching page to allow for cancellation
          this.emit('before-page-fetch', page, sectionTotalPages);

          // Get the page document (page 1 was already fetched in calculation phase)
          let document: Document;
          if (page === 1) {
            document = firstPage;
          } else {
            document = await this.fetchPageFromSuumo(page, regionId, provinceId, type);
          }

          // Parse and process items immediately
          let pageNewItems = 0;
          let pageUpdatedItems = 0;
          let pageKnownUnchangedItems = 0;
          let pageTotalItems = 0;

          if (type === '040') {
            // Rental properties
            const propertyItems = parseRentalUnitsForDB(document, regionId, provinceId);
            pageTotalItems = propertyItems.length;

            if (pageTotalItems === 0) {
              console.log(`No items found on page ${page}`);
              break;
            }

            // Check early termination before processing: count known vs new units
            for (const item of propertyItems) {
              if (item.building_suumo_id === 'building-') continue;
              const existingUnit = existingRentalUnitMap[item.suumo_id];
              if (existingUnit) {
                if (existingUnit.rent !== item.rent) {
                  pageUpdatedItems++;
                } else {
                  pageKnownUnchangedItems++;
                }
              } else {
                pageNewItems++;
              }
            }

            // Process the rental items (handles DB writes)
            await this.processRentalItems(propertyItems, regionId, provinceId);

            // Update the in-memory map with newly seen units
            for (const item of propertyItems) {
              existingRentalUnitMap[item.suumo_id] = { rent: item.rent };
            }
          } else {
            // Purchase properties
            const propertyItems = parseItemsForDB(document, regionId, provinceId);
            pageTotalItems = propertyItems.length;

            if (pageTotalItems === 0) {
              console.log(`No items found on page ${page}`);
              break;
            }

            // Check early termination before processing: count known vs new properties
            for (const item of propertyItems) {
              const existing = existingPropertiesMap[item.suumo_id];
              if (existing) {
                if (existing.price !== item.price || existing.price_text !== item.price_text) {
                  pageUpdatedItems++;
                } else {
                  pageKnownUnchangedItems++;
                }
              } else {
                pageNewItems++;
              }
            }

            // Process the purchase items (handles DB writes)
            await this.processPurchaseItems(propertyItems, regionId, provinceId, existingPropertiesMap);
          }

          sectionProcessedItems += pageTotalItems;
          sectionNewItems += pageNewItems;
          sectionUpdatedItems += pageUpdatedItems;

          this.emit('section-progress', sectionKey, page, sectionTotalPages, pageNewItems, pageUpdatedItems);
          this.emit('items-processed', sectionProcessedItems, regionId, provinceId, type);

          // Early termination check: if all items on this page were already known
          // with no changes, increment the counter. Otherwise, reset.
          if (pageNewItems === 0 && pageUpdatedItems === 0 && pageTotalItems > 0) {
            consecutiveAllKnownPages++;
            if (consecutiveAllKnownPages >= RetrieveCommand.EARLY_STOP_THRESHOLD) {
              console.log(`Section ${sectionKey}: caught up after page ${page}/${sectionTotalPages} (${consecutiveAllKnownPages} consecutive all-known pages)`);
              this.emit('section-early-stop', sectionKey, page, sectionTotalPages);
              earlyStop = true;
              break;
            }
          } else {
            consecutiveAllKnownPages = 0;
          }
        }

        const elapsed = Math.round((Date.now() - sectionStartTime) / 1000);
        const stopReason = earlyStop ? 'caught up' : timedOut ? 'timed out' : 'completed all pages';
        console.log(`Section ${sectionKey}: ${stopReason} in ${elapsed}s — ${sectionNewItems} new, ${sectionUpdatedItems} updated, ${sectionProcessedItems} total items`);

      } catch (error) {
        console.error(`Error retrieving section ${sectionKey}:`, error);
      }

      sectionsProcessed++;
      this.emit('sections-processed', sectionsProcessed);
    }

    // Free the first page references
    sectionFirstPages.clear();

    console.log('Retrieval completed');
    return { success: true };
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

  private async fetchPageFromSuumo(pageNr: number, areaId: string, provinceId: string, type: string): Promise<Document> {
    const url = this.getPageUrl(pageNr, areaId, provinceId, type);

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

    const parser = new DOMParser();
    return parser.parseFromString(body, 'text/html');
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
