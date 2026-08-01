# PAAX Sheet Navigation & Gallery Viewer Performance Remediation Report

**Branch**: `codex/sheet-navigation-gallery-viewer-performance`  
**Repository**: `G:\paax-ai-contextual-integration`  
**Status**: `COMPLETED & FULLY VERIFIED` (Frontend: 317/317 Vitest Passed 100%, Backend: 897 Passed, 5 Skipped out of 902 Pytest Suite)

---

## 1. Summary of Issues Fixed

| Issue | Root Cause | Solution Implemented | Status |
| :--- | :--- | :--- | :--- |
| **1. Gallery Card Image Error** ("Gambar sheet tidak dapat dimuat") | Backend relative URLs (`/drawings/dem/...`) were not mapped to the Next.js API proxy prefix (`/api/document-intelligence/...`), resulting in browser 404 responses. | Created `resolveCanonicalThumbnailUrl` and shared component `<CanonicalSheetThumbnail />` to proxy all drawing thumbnail requests through Next.js proxy route handler with honest loading/error fallbacks. | **VERIFIED PASS** |
| **2. Slow Sheet Navigation Performance** | `pdf-page-layer.tsx` computed document key as `${runId}:${pageIndex}`, causing `pdf-tile-pool` and `pdf-tile.worker` to destroy and re-fetch/re-parse PDF documents on every single page navigation. | Refactored `pdf-tile.worker.ts` and `pdf-tile-pool.ts` to cache opened `PDFDocumentProxy` instances by `runId`. Moving between pages under the same document reuses the parsed document and ArrayBuffer instantly without re-fetching or re-parsing binary data. | **VERIFIED PASS** |
| **3. Lifecycle Integrity & Memory Safety** | Web Worker workers and tile caches lacked clean isolation between `runId` switches. | Implemented `documentsByRun` Map in Worker and `buffersByRun` Map in Tile Pool, accompanied by explicit worker eviction upon worker pool destruction. | **VERIFIED PASS** |

---

## 2. Phase-by-Phase Verification & Test Results

### Phase A — Root Cause & Regression Test Suite
- Added regression test `apps/web/src/components/drawing-intelligence/workspace/navigator/__tests__/sheet-thumbnail-url-regression.test.ts`.
- Proved 404 image behavior when unproxied `/drawings/dem/...` URLs were passed to native `<img>` elements.
- Confirmed PDF viewer worker teardown on page navigation.

### Phase B — Single Source of Truth for Thumbnails
- Created `apps/web/src/components/drawing-intelligence/workspace/sheet-thumbnail-resolver.ts`:
  - `resolveCanonicalThumbnailUrl`: Normalizes backend `/drawings/...` paths to `/api/document-intelligence/drawings/...` and `/projects/...` to `/api/drawing-intelligence/projects/...`.
- Created `apps/web/src/components/drawing-intelligence/workspace/navigator/canonical-sheet-thumbnail.tsx`:
  - Shared `<CanonicalSheetThumbnail />` component with `loading="lazy"`, `decoding="async"`, smooth state resetting on URL change, and honest error fallback UI.
- Updated `sheet-mapping.ts`, `sheet-view-mapping.ts`, `sheet-gallery.tsx`, and `file-sheet-navigator.tsx`.
- **Vitest Unit Test Suite**: `sheet-thumbnail-resolver.test.ts` & `sheet-thumbnail-url-regression.test.ts` passed 100%.

### Phase C — PDF Viewer Worker Lifecycle & Performance
- **Worker Document Reuse (`pdf-tile.worker.ts`)**:
  - Maintained `documentsByRun = new Map<string, PdfDocumentEntry>()`.
  - Worker reuses existing `PDFDocumentProxy` for any page belonging to an already open `runId`.
- **Buffer Caching (`pdf-tile-pool.ts`)**:
  - Maintained `buffersByRun = new Map<string, ArrayBuffer>()`.
  - Slices ArrayBuffer once per `runId` for background worker threads.
- **Canvas Rendering Sync (`pdf-page-layer.tsx`)**:
  - Preserved exported helper signatures (`getGlobalPdfTilePool`, `resetGlobalPdfTilePool`, `getGlobalTileCache`, `resetGlobalTileCache`, `shouldRefreshArtifactUrl`).
  - Fixed tile key computation (`desiredKeys`) to render low-res overview tiles immediately while scheduling high-res detail tiles after a 125ms delay.
  - Corrected `cache.has` checks to ensure tile revisions update reliably when low-res tiles upgrade to high-res bitmaps.
- **Canvas Vitest Suite**: `pnpm --dir apps/web test pdf-page-layer pdf-tile-pool` passed 33/33 tests 100%.

### Phase D — Acceptance Verification

#### 1. Frontend Test Suite (Vitest)
```
Test Files  59 passed (59)
     Tests  317 passed (317)
  Start at  15:38:40
  Duration  10.22s (transform 8.12s, setup 6.55s, collect 38.01s, tests 6.03s, environment 42.06s, prepare 13.01s)
```

#### 2. Backend Test Suite (Pytest)
```
Location: services/document-intelligence
Command: pytest -v
Result: 897 passed, 5 skipped (902 total tests) in 187.30s
```

---

## 3. Mandatory Golden Rules Compliance

1. **AI Never Calculates ("AI TIDAK PERNAH MENGHITUNG")**:
   - Zero RAB/AHSP/Quantity math in frontend TS or LLM layers.
   - All thumbnail and document rendering logic remains purely structural and display-bound.
2. **Graphify-First Workflow**:
   - Navigation and dependency analysis executed graph-first via Knowledge Graph before file edits.
3. **Branching & PR Discipline**:
   - Developed exclusively on `codex/sheet-navigation-gallery-viewer-performance`.
   - Ready to push branch and open Pull Request for owner review without merging to `main`.
