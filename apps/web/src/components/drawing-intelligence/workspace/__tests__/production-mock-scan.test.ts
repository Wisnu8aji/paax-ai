import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Phase 09D — Production Mock Import & Data Cleanliness Scan.
 *
 * Enforces that no production Drawing Intelligence code imports mock data,
 * uses sample project fallbacks, or exposes quantity replacement actions.
 */

const DI_COMPONENTS_DIR = path.resolve(__dirname, '../..');
const DI_APP_DIR = path.resolve(__dirname, '../../../../app/(dashboard)/drawing-intelligence');

function getProductionFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['__tests__', '__fixtures__', 'fixtures', 'tests'].includes(entry.name)) {
        continue;
      }
      results.push(...getProductionFiles(fullPath));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
      results.push(fullPath);
    }
  }

  return results;
}

describe('Phase 09D Production Mock Scan', () => {
  const prodFiles = [...getProductionFiles(DI_COMPONENTS_DIR), ...getProductionFiles(DI_APP_DIR)];

  it('scans all production DI files and finds zero forbidden mock data imports', () => {
    const forbiddenPatterns = [
      { pattern: /from\s+['"].*di-mock-data['"]/, reason: 'Imports from di-mock-data' },
      { pattern: /from\s+['"].*\/lib\/mock\/.*['"]/, reason: 'Imports from lib/mock' },
      { pattern: /\bMOCK_(?:FILE|SHEETS|ELEMENTS|QUANTITY|REVIEW|ASSUMPTIONS|ACTIVITY)\b/, reason: 'Uses MOCK_* data constant' },
      { pattern: /'PLHUT-SURAKARTA'/, reason: 'Hardcoded PLHUT sample project fallback ID' },
      { pattern: /replaceQuantities/, reason: 'Exposes arbitrary replaceQuantities store action' },
    ];

    const violations: string[] = [];

    for (const filePath of prodFiles) {
      const relPath = path.relative(path.resolve(__dirname, '../../../../..'), filePath);
      const content = fs.readFileSync(filePath, 'utf-8');

      for (const { pattern, reason } of forbiddenPatterns) {
        if (pattern.test(content)) {
          violations.push(`${relPath}: ${reason}`);
        }
      }
    }

    expect(violations, `Production mock violations found:\n${violations.join('\n')}`).toEqual([]);
  });

  it('verifies quantity authority is strictly bound to core_engine in quantity-authority.ts', async () => {
    const qaModule = await import('../quantity-authority');
    expect(qaModule.canDisplayFinalQuantity({ sourceAuthority: 'core_engine' })).toBe(true);
    expect(qaModule.canDisplayFinalQuantity({ sourceAuthority: 'none' })).toBe(false);
    expect(qaModule.canDisplayFinalQuantity({ sourceAuthority: 'measurement_fact' })).toBe(false);
    expect(qaModule.canDisplayFinalQuantity({ sourceAuthority: 'proposal' })).toBe(false);
    expect(qaModule.canDisplayFinalQuantity({ sourceAuthority: 'review' })).toBe(false);
  });
});
