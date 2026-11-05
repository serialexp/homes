import { describe, expect, it } from 'vitest';
import {
  MergePlanner,
  classifyStoredBuilding,
  indexListedBuildings,
  type UnitKeyIndex,
} from './rentalBuildingMerge.js';

function indexOf(listed: Array<{ key: string; unitIds: string[] }>): UnitKeyIndex {
  const index: UnitKeyIndex = new Map();
  indexListedBuildings(index, listed);
  return index;
}

describe('indexListedBuildings', () => {
  it('maps each listed unit to its building key', () => {
    const index = indexOf([{ key: 'building-B1', unitIds: ['U1', 'U2'] }]);
    expect(index.get('U1')).toBe('building-B1');
    expect(index.get('U2')).toBe('building-B1');
  });

  it('marks a unit ambiguous when cached pages list it under two buildings', () => {
    const index = indexOf([
      { key: 'building-B1', unitIds: ['U1'] },
      { key: 'building-B2', unitIds: ['U1'] },
    ]);
    expect(index.get('U1')).toBeNull();
  });

  it('keeps a unit listed twice under the same building unambiguous', () => {
    const index = indexOf([
      { key: 'building-B1', unitIds: ['U1'] },
      { key: 'building-B1', unitIds: ['U1'] },
    ]);
    expect(index.get('U1')).toBe('building-B1');
  });
});

describe('classifyStoredBuilding', () => {
  const index = indexOf([
    { key: 'building-B1', unitIds: ['U1', 'U2', 'U3'] },
    { key: 'building-B2', unitIds: ['U4'] },
    { key: 'building-B3', unitIds: ['U5'] },
    { key: 'building-B3', unitIds: ['U6'] },
    { key: 'building-B4', unitIds: ['U7'] },
    { key: 'building-B5', unitIds: ['U7'] },
  ]);

  it('merges a row whose units all belong to one listed building', () => {
    expect(classifyStoredBuilding(index, { id: 1, suumo_id: 'U1', unitIds: ['U1', 'U2'] }))
      .toEqual({ kind: 'merge', key: 'building-B1' });
  });

  it('skips a row with no units', () => {
    expect(classifyStoredBuilding(index, { id: 1, suumo_id: 'U1', unitIds: [] }))
      .toEqual({ kind: 'skip', reason: 'no-units' });
  });

  it('skips a row with any unit missing from the cache', () => {
    expect(classifyStoredBuilding(index, { id: 1, suumo_id: 'U1', unitIds: ['U1', 'UX'] }))
      .toEqual({ kind: 'skip', reason: 'uncovered-unit' });
  });

  it('skips a row whose units belong to different listed buildings', () => {
    expect(classifyStoredBuilding(index, { id: 1, suumo_id: 'U1', unitIds: ['U1', 'U4'] }))
      .toEqual({ kind: 'skip', reason: 'mixed-buildings' });
  });

  it('skips a row holding an ambiguous unit', () => {
    expect(classifyStoredBuilding(index, { id: 1, suumo_id: 'U7', unitIds: ['U7'] }))
      .toEqual({ kind: 'skip', reason: 'ambiguous-unit' });
  });

  it('reports ambiguity before missing coverage', () => {
    expect(classifyStoredBuilding(index, { id: 1, suumo_id: 'U7', unitIds: ['U7', 'UX'] }))
      .toEqual({ kind: 'skip', reason: 'ambiguous-unit' });
  });
});

describe('MergePlanner', () => {
  it('groups rows of one building together and counts their units', () => {
    const index = indexOf([{ key: 'building-B1', unitIds: ['U1', 'U2', 'U3'] }]);
    const planner = new MergePlanner();
    planner.add(index, { id: 10, suumo_id: 'U1', unitIds: ['U1'] });
    planner.add(index, { id: 11, suumo_id: 'U2', unitIds: ['U2', 'U3'] });

    expect(planner.groups.get('building-B1')).toEqual({ sourceIds: [10, 11], unitCount: 3 });
    expect(planner.skipped['uncovered-unit']).toBe(0);
  });

  it('counts skipped rows by reason and leaves them out of the groups', () => {
    const index = indexOf([{ key: 'building-B1', unitIds: ['U1'] }]);
    const planner = new MergePlanner();
    planner.add(index, { id: 10, suumo_id: 'U1', unitIds: ['U1', 'UX'] });
    planner.add(index, { id: 11, suumo_id: 'UX', unitIds: [] });

    expect(planner.groups.size).toBe(0);
    expect(planner.skipped['uncovered-unit']).toBe(1);
    expect(planner.skipped['no-units']).toBe(1);
  });
});
