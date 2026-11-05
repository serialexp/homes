/**
 * Pure planning for the one-off merge of rental buildings saved under a unit id.
 *
 * Before the key fix, a building was stored under one of its units' suumo_id, so one real
 * building can exist as several rows, each holding a different subset of its units. A cached
 * listing page says which building each unit belongs to. A row is merged only when every one
 * of its units is found in the cache and they all point at the same building; anything else
 * is left alone and counted.
 */

/** A building as listed on a cached page: its key and the units listed under it */
export interface ListedBuilding {
  key: string;
  unitIds: string[];
}

/**
 * unit suumo_id -> building key. `null` means the cached pages disagree about which
 * building the unit belongs to, so no row holding that unit may be merged.
 */
export type UnitKeyIndex = Map<string, string | null>;

/** A stored building row (legacy or current) with the suumo_id of each unit it holds */
export interface StoredBuilding {
  id: number;
  suumo_id: string;
  unitIds: string[];
}

export type SkipReason = 'no-units' | 'uncovered-unit' | 'ambiguous-unit' | 'mixed-buildings';

export type RowVerdict = { kind: 'merge'; key: string } | { kind: 'skip'; reason: SkipReason };

export function indexListedBuildings(index: UnitKeyIndex, buildings: ListedBuilding[]): void {
  for (const { key, unitIds } of buildings) {
    for (const unitId of unitIds) {
      const listed = index.get(unitId);
      if (listed === undefined) {
        index.set(unitId, key);
      } else if (listed !== key) {
        index.set(unitId, null);
      }
    }
  }
}

export function classifyStoredBuilding(index: UnitKeyIndex, row: StoredBuilding): RowVerdict {
  if (row.unitIds.length === 0) {
    return { kind: 'skip', reason: 'no-units' };
  }

  let key: string | null = null;
  let uncovered = false;
  for (const unitId of row.unitIds) {
    const listed = index.get(unitId);
    if (listed === undefined) {
      uncovered = true;
    } else if (listed === null) {
      return { kind: 'skip', reason: 'ambiguous-unit' };
    } else if (key !== null && key !== listed) {
      return { kind: 'skip', reason: 'mixed-buildings' };
    } else {
      key = listed;
    }
  }

  if (uncovered || key === null) {
    return { kind: 'skip', reason: 'uncovered-unit' };
  }
  return { kind: 'merge', key };
}

export interface PlannedMerge {
  sourceIds: number[];
  unitCount: number;
}

/** Accumulates per-row verdicts into merge groups, one per building key */
export class MergePlanner {
  readonly groups = new Map<string, PlannedMerge>();
  readonly skipped: Record<SkipReason, number> = {
    'no-units': 0,
    'uncovered-unit': 0,
    'ambiguous-unit': 0,
    'mixed-buildings': 0,
  };

  add(index: UnitKeyIndex, row: StoredBuilding): void {
    const verdict = classifyStoredBuilding(index, row);
    if (verdict.kind === 'skip') {
      this.skipped[verdict.reason]++;
      return;
    }

    const group = this.groups.get(verdict.key) ?? { sourceIds: [], unitCount: 0 };
    group.sourceIds.push(row.id);
    group.unitCount += row.unitIds.length;
    this.groups.set(verdict.key, group);
  }
}
