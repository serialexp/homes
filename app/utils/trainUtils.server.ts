import {
    translateTrainNames,
    reconcileTrainLine,
    type ReconcileResult,
} from '../utils/llm.server.js';
import { areas } from '../data/propertyData.js';
import prisma from './db.server.js';

/** Canonical-reconciliation metadata for a train line (see canonicalLines.server.ts). */
export type LineMeta = Pick<ReconcileResult, 'kind' | 'canonical_id' | 'canonical_name'>;

/**
 * Get or create a train line, including translation.
 *
 * `meta` carries the canonical-reconciliation result (kind + canonical line
 * match) and is stored on create. We intentionally create one row per distinct
 * raw name and group by `canonical_id` at the display layer, rather than
 * merging variants here — so a given raw label is only reconciled once (on
 * first sight) and then found by exact name forever after. Physical merging of
 * duplicate canonical rows is an opt-in step in reconcileTrainLines.ts.
 */
export async function getOrCreateTrainLine(
    lineName: string,
    translatedName: string | null,
    region?: string,
    meta?: LineMeta
) {
    // Try to find existing line
    let line = await prisma.trainLine.findUnique({
        where: { name: lineName }
    });

    if (!line) {
        // Create new line with pre-translated name + canonical metadata
        line = await prisma.trainLine.create({
            data: {
                name: lineName,
                translated_name: translatedName,
                region: region,
                kind: meta?.kind ?? 'unknown',
                canonical_id: meta?.canonical_id ?? null,
                canonical_name: meta?.canonical_name ?? null,
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
    // Line names that are new (not yet in DB) — these get reconciled once.
    const newLineNames = new Set<string>();

    for (const stationInfo of stations) {
        const existingLine = await prisma.trainLine.findUnique({
            where: { name: stationInfo.line }
        });
        if (!existingLine) {
            namesToTranslate.push({ japanese: stationInfo.line, type: "line" });
            newLineNames.add(stationInfo.line);
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

    // Reconcile each new line against the canonical dataset (classify + match).
    // Done before translation so we can skip romanizing lines that get a
    // canonical name (which the UI prefers anyway).
    const reconciled = new Map<string, LineMeta>();
    for (const name of newLineNames) {
        reconciled.set(name, await reconcileTrainLine(name, region));
    }

    // Deduplicate; drop new lines that already have a canonical name (no need to
    // also spend tokens romanizing them).
    const seen = new Set<string>();
    const uniqueNames = namesToTranslate.filter(item => {
        const key = `${item.type}:${item.japanese}`;
        if (seen.has(key)) return false;
        seen.add(key);
        if (item.type === "line" && reconciled.get(item.japanese)?.canonical_name) {
            return false;
        }
        return true;
    });

    // Batch translate all remaining new names in one LLM call
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
            region,
            reconciled.get(stationInfo.line)
        );

        const station = await getOrCreateStation(
            stationInfo.station,
            translations.get(stationInfo.station) ?? null,
            line.id
        );

        await linkBuildingToStation(buildingId, station.id, stationInfo.walking_minutes);
    }
} 