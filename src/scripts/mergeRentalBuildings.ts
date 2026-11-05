/**
 * One-off: merge rental buildings saved under a unit id into the building they belong to.
 *
 * Only buildings whose units are all in the cached listing pages (the `page` table) are touched.
 * The cached HTML decides which building each unit belongs to; anything else is left alone and
 * counted in the summary.
 *
 *   node_modules/.bin/tsx src/scripts/mergeRentalBuildings.ts           # dry run, writes the plan file
 *   node_modules/.bin/tsx src/scripts/mergeRentalBuildings.ts --apply   # applies the plan file
 *
 * The plan file is PLAN_FILE (default /tmp/merge-rental-buildings-plan.json). --apply reads that
 * file rather than planning again, so it applies exactly the plan that was reviewed. Each group is
 * re-verified inside its own transaction before anything is written. --apply refuses to run while a
 * retrieval is queued or running, and refuses a plan made for a different database.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { DOMParser } from '@xmldom/xmldom';
import prisma from '../../app/utils/db.server.js';
import { parseRentalBuildings } from '../../app/utils/rentalParseUtils.js';
import {
  MergePlanner,
  classifyStoredBuilding,
  indexListedBuildings,
  type StoredBuilding,
  type UnitKeyIndex,
} from './rentalBuildingMerge.js';

const PLAN_FILE = process.env.PLAN_FILE ?? '/tmp/merge-rental-buildings-plan.json';
const LISTING_KEY_PREFIX = 'building-';
const PAGE_BATCH = 20;
const BUILDING_BATCH = 1000;
const KEY_CHUNK = 1000;

interface PlanGroup {
  buildingKey: string;
  keepId: number | null;
  sourceIds: number[];
  unitCount: number;
}

interface PlanFile {
  createdAt: string;
  target: string;
  listedPages: number;
  listedBuildings: number;
  indexedUnits: number;
  ambiguousUnits: number;
  rowsScanned: number;
  skipped: Record<string, number>;
  groups: PlanGroup[];
}

type GroupOutcome =
  | { kind: 'merged'; rowsRemoved: number; unitsMoved: number; stationsMoved: number; stationsDropped: number }
  | { kind: 'changed'; reason: string };

/** Identifies the database and server this run touches, so a plan can't be applied to another one */
async function currentTarget(): Promise<string> {
  const [row] = await prisma.$queryRaw<Array<{ target: string }>>`SELECT CONCAT(@@hostname, ':', @@port, '/', DATABASE()) AS target`;
  return row.target;
}

async function loadListingIndex() {
  const index: UnitKeyIndex = new Map();
  let listedPages = 0;
  let listedBuildings = 0;
  let lastId = 0;

  for (;;) {
    const pages = await prisma.page.findMany({
      where: { kind: 'property-list', id: { gt: lastId } },
      orderBy: { id: 'asc' },
      take: PAGE_BATCH,
      select: { id: true, content: true }
    });
    if (pages.length === 0) break;

    for (const page of pages) {
      const document = new DOMParser().parseFromString(page.content, 'text/html');
      const listed = parseRentalBuildings(document)
        .filter(building => building.suumo_id !== LISTING_KEY_PREFIX)
        .map(building => ({ key: building.suumo_id, unitIds: building.units.map(unit => unit.suumo_id) }));
      listedBuildings += listed.length;
      indexListedBuildings(index, listed);
    }

    listedPages += pages.length;
    lastId = pages[pages.length - 1].id;
  }

  return { index, listedPages, listedBuildings };
}

function groupUnitIds(units: Array<{ suumo_id: string; building_id: number }>): Map<number, string[]> {
  const unitIdsByBuilding = new Map<number, string[]>();
  for (const unit of units) {
    const unitIds = unitIdsByBuilding.get(unit.building_id);
    if (unitIds) {
      unitIds.push(unit.suumo_id);
    } else {
      unitIdsByBuilding.set(unit.building_id, [unit.suumo_id]);
    }
  }
  return unitIdsByBuilding;
}

/** Visits every stored building that still carries a unit id as its key, in id order */
async function forEachLegacyBuilding(visit: (row: StoredBuilding) => void) {
  let lastId = 0;

  for (;;) {
    const rows = await prisma.building.findMany({
      where: { id: { gt: lastId }, NOT: { suumo_id: { startsWith: LISTING_KEY_PREFIX } } },
      orderBy: { id: 'asc' },
      take: BUILDING_BATCH,
      select: { id: true, suumo_id: true }
    });
    if (rows.length === 0) break;

    const units = await prisma.rentalUnit.findMany({
      where: { building_id: { in: rows.map(row => row.id) } },
      select: { suumo_id: true, building_id: true }
    });
    const unitIdsByBuilding = groupUnitIds(units);

    for (const row of rows) {
      visit({ id: row.id, suumo_id: row.suumo_id, unitIds: unitIdsByBuilding.get(row.id) ?? [] });
    }
    lastId = rows[rows.length - 1].id;
  }
}

async function findBuildingIdsByKey(keys: string[]): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  for (let start = 0; start < keys.length; start += KEY_CHUNK) {
    const rows = await prisma.building.findMany({
      where: { suumo_id: { in: keys.slice(start, start + KEY_CHUNK) } },
      select: { id: true, suumo_id: true }
    });
    for (const row of rows) {
      ids.set(row.suumo_id, row.id);
    }
  }
  return ids;
}

async function dryRun() {
  const target = await currentTarget();
  const { index, listedPages, listedBuildings } = await loadListingIndex();

  const planner = new MergePlanner();
  let rowsScanned = 0;
  await forEachLegacyBuilding(row => {
    rowsScanned++;
    planner.add(index, row);
  });

  const keys = [...planner.groups.keys()];
  const existingIds = await findBuildingIdsByKey(keys);
  const groups: PlanGroup[] = [...planner.groups].map(([buildingKey, group]) => ({
    buildingKey,
    keepId: existingIds.get(buildingKey) ?? null,
    ...group
  }));

  let ambiguousUnits = 0;
  for (const listed of index.values()) {
    if (listed === null) ambiguousUnits++;
  }

  const plan: PlanFile = {
    createdAt: new Date().toISOString(),
    target,
    listedPages,
    listedBuildings,
    indexedUnits: index.size,
    ambiguousUnits,
    rowsScanned,
    skipped: planner.skipped,
    groups
  };
  await writeFile(PLAN_FILE, JSON.stringify(plan, null, 2));

  const sourceRows = groups.reduce((sum, group) => sum + group.sourceIds.length, 0);
  const keptExisting = groups.filter(group => group.keepId !== null).length;
  console.log(`target: ${target}`);
  console.log(`cached listing pages: ${listedPages}, listed buildings: ${listedBuildings}, indexed units: ${index.size} (ambiguous: ${ambiguousUnits})`);
  console.log(`stored buildings keyed by unit id: ${rowsScanned}`);
  console.log(`skipped: ${JSON.stringify(planner.skipped)}`);
  console.log(`groups to merge: ${groups.length} (into an existing building-key row: ${keptExisting})`);
  console.log(`rows in those groups: ${sourceRows}, rows removed: ${sourceRows - (groups.length - keptExisting)}`);
  console.log(`plan written to ${PLAN_FILE}`);
  console.log('dry run only: nothing was changed. Review the plan, then run again with --apply.');
}

async function applyGroup(group: PlanGroup, index: UnitKeyIndex): Promise<GroupOutcome> {
  return prisma.$transaction(async tx => {
    const sources = await tx.building.findMany({
      where: { id: { in: group.sourceIds } },
      select: { id: true, suumo_id: true }
    });
    if (sources.length === 0 || sources.length !== group.sourceIds.length) {
      return { kind: 'changed', reason: 'source rows changed since the plan was made' };
    }

    const units = await tx.rentalUnit.findMany({
      where: { building_id: { in: group.sourceIds } },
      select: { suumo_id: true, building_id: true }
    });
    const unitIdsByBuilding = groupUnitIds(units);
    const unitCountOf = (id: number) => unitIdsByBuilding.get(id)?.length ?? 0;

    for (const source of sources) {
      const verdict = classifyStoredBuilding(index, {
        id: source.id,
        suumo_id: source.suumo_id,
        unitIds: unitIdsByBuilding.get(source.id) ?? []
      });
      if (verdict.kind !== 'merge' || verdict.key !== group.buildingKey) {
        return { kind: 'changed', reason: `row ${source.id} no longer merges into ${group.buildingKey}` };
      }
    }

    const existing = await tx.building.findUnique({ where: { suumo_id: group.buildingKey }, select: { id: true } });
    let targetId: number;
    let moving: typeof sources;
    if (existing) {
      targetId = existing.id;
      moving = sources;
    } else {
      // Keep the row holding the most units, so the fewest unit rows have to move
      const keeper = [...sources].sort((a, b) => unitCountOf(b.id) - unitCountOf(a.id) || a.id - b.id)[0];
      await tx.building.update({ where: { id: keeper.id }, data: { suumo_id: group.buildingKey } });
      targetId = keeper.id;
      moving = sources.filter(source => source.id !== keeper.id);
    }

    const stationIds = new Set(
      (await tx.buildingStation.findMany({ where: { building_id: targetId }, select: { station_id: true } }))
        .map(station => station.station_id)
    );
    let unitsMoved = 0;
    let stationsMoved = 0;
    let stationsDropped = 0;

    for (const source of moving) {
      // A station the target already has keeps the target's walking time; the source row's copy goes with the row
      const stations = await tx.buildingStation.findMany({
        where: { building_id: source.id },
        select: { id: true, station_id: true }
      });
      for (const station of stations) {
        if (stationIds.has(station.station_id)) {
          stationsDropped++;
          continue;
        }
        await tx.buildingStation.update({ where: { id: station.id }, data: { building_id: targetId } });
        stationIds.add(station.station_id);
        stationsMoved++;
      }

      const moved = await tx.rentalUnit.updateMany({
        where: { building_id: source.id },
        data: { building_id: targetId }
      });
      unitsMoved += moved.count;

      // Units have moved and the remaining station rows cascade with the row
      await tx.building.delete({ where: { id: source.id } });
    }

    return { kind: 'merged', rowsRemoved: moving.length, unitsMoved, stationsMoved, stationsDropped };
  }, { timeout: 60_000 });
}

async function apply() {
  const target = await currentTarget();
  const plan = JSON.parse(await readFile(PLAN_FILE, 'utf8')) as PlanFile;
  if (plan.target !== target) {
    throw new Error(`Plan was made for ${plan.target}, but this run targets ${target}`);
  }

  const activeRetrievals = await prisma.retrievalJob.count({ where: { activeSlot: { not: null } } });
  if (activeRetrievals > 0) {
    throw new Error('A retrieval is queued or running; stop it before merging');
  }

  const { index } = await loadListingIndex();

  const totals = { merged: 0, changed: 0, rowsRemoved: 0, unitsMoved: 0, stationsMoved: 0, stationsDropped: 0 };
  const changed: Array<{ buildingKey: string; reason: string }> = [];

  console.log(`target: ${target}, applying ${plan.groups.length} groups from ${PLAN_FILE}`);
  for (const [i, group] of plan.groups.entries()) {
    const outcome = await applyGroup(group, index);
    if (outcome.kind === 'changed') {
      totals.changed++;
      changed.push({ buildingKey: group.buildingKey, reason: outcome.reason });
    } else {
      totals.merged++;
      totals.rowsRemoved += outcome.rowsRemoved;
      totals.unitsMoved += outcome.unitsMoved;
      totals.stationsMoved += outcome.stationsMoved;
      totals.stationsDropped += outcome.stationsDropped;
    }
    if ((i + 1) % 500 === 0) {
      console.log(`progress: ${i + 1}/${plan.groups.length}`);
    }
  }

  console.log(`merged: ${totals.merged}, left unchanged (since plan): ${totals.changed}`);
  console.log(`rows removed: ${totals.rowsRemoved}, units moved: ${totals.unitsMoved}, stations moved: ${totals.stationsMoved}, duplicate stations dropped: ${totals.stationsDropped}`);
  for (const { buildingKey, reason } of changed.slice(0, 20)) {
    console.log(`  not merged ${buildingKey}: ${reason}`);
  }
}

async function main() {
  if (process.argv.includes('--apply')) {
    await apply();
  } else {
    await dryRun();
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
