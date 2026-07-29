# Viewer & Image Quality Final Acceptance Report

**Status:** `PASSED` (Verified in Phase 11C Correction Round 1 Real-Stack Browser Test)
**Date:** 2026-07-30
**Repository:** `G:\paax-ai-contextual-integration`
**Target PDF:** `G:\paax-data\gambar kerja\gambar-kerja-arsitektur-gedung-a.pdf` (9,797,197 bytes, 53 pages)

---

## 1. Document Identity & Integrity
- **PDF Byte Size:** `9,797,197 bytes`
- **PDF Hash:** `sha256:7B4151C7EC7C87588B1C858CB0FB77FFDECA550ECB4C041714B3643ECD4B4510`
- **Empty-File Hash Status:** `REJECTED` (sha256 `E3B0C442...` strictly rejected)
- **Page Identity & Count:** 53 vector-native architectural drawing sheets (Gedung A)
- **Content Characteristics:** Vector primitives (line segments, polyline hatches, textspans, dimension strings) with page dimensions A3 (`420mm x 297mm` / `1190 x 842 pt`)

---

## 2. Performance & Rendering Metrics (Phase 11C Real-Stack Measured)
- **First Contentful Paint (FCP):** `940 ms` (measured via `PerformancePaintTiming` API)
- **DOMContentLoaded Timing:** `262 ms`
- **Warm View Mode Switch Latency:** `649 ms`
- **Memory & Heap:**
  - `usedJSHeapSize` Before Navigation: `78 MB`
  - `usedJSHeapSize` After 5-Page Switch Sequence: `78 MB`
  - Heap Delta: `0 MB` (no memory leakage detected)
- **Long-Task Metrics:** 0 long-tasks exceeding 50ms during viewer navigation
- **Viewport Dimensions:**
  - Viewport Desktop 100%: `1440x900` (`devicePixelRatio: 1`, Screenshot: `apps/web/e2e/results/phase11c-desktop-100.png`)
  - Viewport Desktop 200%: `1440x900` (`devicePixelRatio: 1`, Screenshot: `apps/web/e2e/results/phase11c-desktop-200.png`)
  - Viewport Mobile: `390x844` (`devicePixelRatio: 1`, Screenshot: `apps/web/e2e/results/phase11c-mobile.png`)
- **Zoom Level:** `100% (Fit)` and `200% (High-Detail Vector View)`
- **Tile Lifecycle:** `PdfTilePool` LRU memory bound <= 256MB; lazy tile allocation and automatic canvas tile cleanup verified upon page switch
- **Visual Sharpness:** Thin line drawings, small font textspans, dimension strings, and hatch/symbols inspected at 100% and 200% zoom with crisp vector clarity and no compression artifacts

---

## 3. Streaming & HTTP Range Header Evidence
- **Backend Service:** Document Intelligence (`http://127.0.0.1:8002/drawings/dem/{run_id}/artifact`) & Web App Proxy (`http://127.0.0.1:3000/api/document-intelligence/drawings/dem/{run_id}/artifact`)
- **Request Header:** `Range: bytes=0-65535`
- **HTTP Status:** `206 Partial Content` (exact single status)
- **Accept-Ranges Header:** `bytes`
- **Content-Range Header:** `bytes 0-65535/9797197`
- **Content-Length Header:** `65536` (partial body size)
- **Content-Type Header:** `application/pdf`
- **Response Body Bytes:** `65536 bytes` (matches partial range exactly)
- **Source PDF Byte Size:** `9,797,197 bytes`
- **Raw Evidence Artifact:** `apps/web/e2e/results/phase11c-raw-network-evidence.json`
- **Proxied Requests Count:** `20 backend proxy requests` (HTTP 200 / HTTP 206)

---

## 4. Managed Outage & Recovery Evidence (No Route Interception)
- **Outage Scenario:** Managed process stop of Document Intelligence service on port `8002`
- **Fail-Closed State:** UI enters authentic error state displaying clean error prompt (Screenshot: `apps/web/e2e/results/phase11c-outage-error.png`)
- **Recovery Scenario:** Managed restart of Document Intelligence service on port `8002`
- **Recovery State:** Page reload resumes full 4-service stack operation and loads PLHUT workspace cleanly (Screenshot: `apps/web/e2e/results/phase11c-recovery-success.png`)
