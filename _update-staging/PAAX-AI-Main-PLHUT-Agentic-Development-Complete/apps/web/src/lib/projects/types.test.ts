import { describe, expect, it } from 'vitest';
import { createProjectFromInput } from './types';
describe('project drawing authority', () => { it('defaults new projects to DEM/PCKM v2', () => { expect(createProjectFromInput({ name: 'A', location: 'B', type: 'Gedung' }).drawingSystem).toBe('dem_pckm_v2'); }); });
