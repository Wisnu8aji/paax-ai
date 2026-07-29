import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Phase 09D — Production Mock Import & Data Cleanliness Scan.
 *
 * Enforces that no production Drawing Intelligence code imports mock data,
 * uses sample project fallbacks, or exposes quantity replacement actions.
 * Also scans the Next production bundle output when available.
 */

const ROOT_DIR = path.resolve(__dirname, '../../../../..');
const DI_COMPONENTS_DIR = path.resolve(__dirname, '../..');
const DI_APP_DIR = path.resolve(__dirname, '../../../../app/(dashboard)/drawing-intelligence');
const NEXT_BUILD_DIR = path.resolve(__dirname, '../../../../.next');

function getProductionFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
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

  it('scans all production DI files and finds zero forbidden mock data imports or fallbacks', () => {
    const forbiddenPatterns = [
      { pattern: /from\s+['"].*di-mock-data['"]/, reason: 'Imports from di-mock-data' },
      { pattern: /from\s+['"].*\/lib\/mock\/.*['"]/, reason: 'Imports from lib/mock' },
      { pattern: /\bMOCK_(?:FILE|SHEETS|ELEMENTS|QUANTITY|REVIEW|ASSUMPTIONS|ACTIVITY)\b/, reason: 'Uses MOCK_* data constant' },
      { pattern: /'PLHUT-SURAKARTA'/, reason: 'Hardcoded PLHUT sample project fallback ID' },
      { pattern: /replaceQuantities/, reason: 'Exposes arbitrary replaceQuantities store action' },
    ];

    const violations: string[] = [];

    for (const filePath of prodFiles) {
      const relPath = path.relative(ROOT_DIR, filePath);
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

  it('scans .next production build outputs (if present) for zero forbidden mock symbols', () => {
    if (!fs.existsSync(NEXT_BUILD_DIR)) {
      return; // Build directory checked during post-build scan
    }

    const staticJsDir = path.join(NEXT_BUILD_DIR, 'static');
    if (!fs.existsSync(staticJsDir)) return;

    const bundleFiles: string[] = [];
    function walk(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.js')) bundleFiles.push(full);
      }
    }
    walk(staticJsDir);

    const forbiddenBundleMarkers = [
      'MOCK_QUANTITY_ITEMS',
      'PLHUT-SURAKARTA',
      'PLHUT Campus – Building A',
    ];

    const bundleViolations: string[] = [];
    for (const file of bundleFiles) {
      const text = fs.readFileSync(file, 'utf-8');
      for (const marker of forbiddenBundleMarkers) {
        if (text.includes(marker)) {
          bundleViolations.push(`${path.relative(ROOT_DIR, file)} contains ${marker}`);
        }
      }
    }

    expect(bundleViolations, `Production bundle contains mock data:\n${bundleViolations.join('\n')}`).toEqual([]);
  });
});
