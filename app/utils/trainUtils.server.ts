import { PrismaClient } from '@prisma/client';
import { translateTrainNames } from '../utils/llm.server.js';
import { areas } from '../data/propertyData.js';

const prisma = new PrismaClient();

/**
 * Get or create a train line, including translation
 */
export async function getOrCreateTrainLine(lineName: string, translatedName: string | null, region?: string) {
    // Try to find existing line
    let line = await prisma.trainLine.findUnique({
        where: { name: lineName }
    });

    if (!line) {
        // Create new line with pre-translated name
        line = await prisma.trainLine.create({
            data: {
                name: lineName,
                translated_name: translatedName,
                region: region
            }
        });
    }

    return line;
}

/**
 * Get or create a station for a train line, including translation
 */
export async function getOrCreateStation(stationName: string, translatedName: string | null, trainLineId: number) {
    // Try to find existing station
    let station = await prisma.station.findFirst({
        where: {
            name: stationName,
            train_line_id: trainLineId
        }
    });

    if (!station) {
        // Create new station with pre-translated name
        station = await prisma.station.create({
            data: {
                name: stationName,
                translated_name: translatedName,
                train_line_id: trainLineId
            }
        });
    }

    return station;
}

/**
 * Link a building to a station with walking distance
 */
export async function linkBuildingToStation(buildingId: number, stationId: number, walkingMinutes: number) {
    // Create or update the building-station relationship
    return await prisma.buildingStation.upsert({
        where: {
            building_id_station_id: {
                building_id: buildingId,
                station_id: stationId
            }
        },
        update: {
            walking_minutes: walkingMinutes,
            last_updated: new Date()
        },
        create: {
            building_id: buildingId,
            station_id: stationId,
            walking_minutes: walkingMinutes
        }
    });
}

/**
 * Process station information for a building
 * This function handles the entire process of creating/updating lines, stations,
 * and their relationships with buildings.
 *
 * Batch-translates all new line and station names via LLM in a single call
 * before creating database records.
 */
export async function processStationInfo(
    buildingId: number,
    stations: Array<{ line: string, station: string, walking_minutes: number }>,
    region?: string
) {
    // Collect names that need translation (not yet in DB)
    const namesToTranslate: Array<{ japanese: string; type: "line" | "station" }> = [];

    for (const stationInfo of stations) {
        const existingLine = await prisma.trainLine.findUnique({
            where: { name: stationInfo.line }
        });
        if (!existingLine) {
            namesToTranslate.push({ japanese: stationInfo.line, type: "line" });
        }

        if (existingLine) {
            const existingStation = await prisma.station.findFirst({
                where: { name: stationInfo.station, train_line_id: existingLine.id }
            });
            if (!existingStation) {
                namesToTranslate.push({ japanese: stationInfo.station, type: "station" });
            }
        } else {
            // Line doesn't exist yet, so station won't either
            namesToTranslate.push({ japanese: stationInfo.station, type: "station" });
        }
    }

    // Deduplicate
    const seen = new Set<string>();
    const uniqueNames = namesToTranslate.filter(item => {
        const key = `${item.type}:${item.japanese}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // Batch translate all new names in one LLM call
    const regionName = region ? areas[region as keyof typeof areas]?.name : undefined;
    let translations = new Map<string, string>();
    if (uniqueNames.length > 0) {
        translations = await translateTrainNames(uniqueNames, regionName);
    }

    // Now create/link everything using the pre-fetched translations
    for (const stationInfo of stations) {
        const line = await getOrCreateTrainLine(
            stationInfo.line,
            translations.get(stationInfo.line) ?? null,
            region
        );

        const station = await getOrCreateStation(
            stationInfo.station,
            translations.get(stationInfo.station) ?? null,
            line.id
        );

        await linkBuildingToStation(buildingId, station.id, stationInfo.walking_minutes);
    }
} 