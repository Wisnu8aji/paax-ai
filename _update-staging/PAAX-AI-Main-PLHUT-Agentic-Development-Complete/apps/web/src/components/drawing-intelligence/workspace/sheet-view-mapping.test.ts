import { describe, expect, it } from 'vitest';
import { mapRawDemSheetToSheet, resolveLevelDisplay } from './sheet-view-mapping';

describe('generic drawing sheet mapping', () => {
  it('supports arbitrary floors and basements without PLHUT sheet codes', () => {
    expect(resolveLevelDisplay({ title: 'Structural Floor Plan Level 12' })).toEqual({ floorId: 'L12', floorLabel: 'Lantai 12' });
    expect(resolveLevelDisplay({ level: 'B3', title: 'Parking Plan' })).toEqual({ floorId: 'B3', floorLabel: 'Basement 3' });
  });

  it('does not default unknown projects to Floor 2', () => {
    const mapped = mapRawDemSheetToSheet({
      run_id: 'run-hospital', page_index: 7, file_name: 'hospital.pdf',
      sheet_number: 'H-008', sheet_title: 'Medical Gas Riser Diagram',
      discipline: 'mechanical', drawing_type: 'diagram', status: 'complete',
    });
    expect(mapped.floorId).toBe('UNASSIGNED');
    expect(mapped.floorLabel).toBe('Level belum teridentifikasi');
    expect(mapped.code).toBe('H-008');
    expect(mapped.disciplines).toEqual(['MEP']);
    expect(mapped.drawingType).toBe('Diagram / Schematic');
  });

  it('uses backend level metadata when supplied', () => {
    const mapped = mapRawDemSheetToSheet({
      run_id: 'run-bridge', page_index: 2, file_name: 'bridge.pdf',
      sheet_title: 'Pier Cap Detail', level: 'foundation', discipline: 'structure', status: 'complete',
    });
    expect(mapped.floorLabel).toBe('Fondasi/Substruktur');
    expect(mapped.disciplines).toEqual(['STR']);
  });
  it('supports bridge and road scopes without forcing building floors', () => {
    const bridge = mapRawDemSheetToSheet({
      run_id: 'run-bridge', page_index: 3, file_name: 'bridge.pdf',
      sheet_title: 'Bridge General Arrangement - Abutment A1',
      discipline: 'structure', drawing_type: 'bridge_plan', level: 'substructure', status: 'complete',
    });
    expect(bridge.floorLabel).toBe('Substruktur');
    expect(bridge.drawingType).toBe('Bridge Plan');

    const road = mapRawDemSheetToSheet({
      run_id: 'run-road', page_index: 4, file_name: 'road.pdf',
      sheet_title: 'Road Plan and Profile STA 0+000 - 1+000',
      discipline: 'civil', drawing_type: 'road_plan_profile', level: 'alignment', status: 'complete',
    });
    expect(road.floorLabel).toBe('Trase/Alignment');
    expect(road.drawingType).toBe('Road Plan / Profile');
  });

  it('does not label an unknown sheet as a floor plan', () => {
    const mapped = mapRawDemSheetToSheet({
      run_id: 'run-other', page_index: 1, file_name: 'misc.pdf',
      sheet_title: 'Vendor Reference Sheet', discipline: 'unknown', drawing_type: 'unknown', status: 'complete',
    });
    expect(mapped.drawingType).toBe('Other / Unclassified');
    expect(mapped.floorId).toBe('UNASSIGNED');
  });

});
