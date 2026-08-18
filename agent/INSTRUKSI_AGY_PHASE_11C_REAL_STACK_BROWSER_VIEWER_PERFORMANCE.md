# Instruksi AGY — Phase 11C Real-Stack Browser, Viewer, and Performance

Gunakan **Gemini 3.6 Flash High Thinking** pada percakapan AGY yang sama.
Kerjakan hanya **Phase 11C**. Jangan membuat live AI provider call dan jangan
memulai Phase 11D/11E.

## Titik kerja

- Worktree: `G:\paax-ai-contextual-integration`
- Branch: `codex/contextual-intelligence-integration`
- Base/local/remote:
  `34e63c6dd0ad746ecd9c87306011bb1a5dd3452b`
- Viewer PDF:
  `G:\paax-data\gambar kerja\gambar-kerja-arsitektur-gedung-a.pdf`
  (53 halaman)
- PLHUT: PDF dan artifact DEM/PCKM 88 halaman yang sudah tersedia, read-only;
  jangan menjalankan raw drawing-to-JSON extraction.

## Stack nyata

Jalankan dan buktikan empat service:

- Web `3000`;
- Core Engine `8000`;
- DB/project API `8001`;
- Document Intelligence `8002`.

Final browser proof:

- tanpa Playwright route interception;
- tanpa fake/mock/demo server;
- tanpa production dummy fallback;
- harus menunjukkan request aktual mencapai setiap service yang relevan;
- Core Engine tetap satu-satunya numeric authority.

## Browser coverage

Uji desktop `1440x900` dan mobile `390x844`:

1. auth/login dan RBAC yang tersedia;
2. project/package selection nyata;
3. viewer PDF, thumbnails, page switch, zoom;
4. navigator 53 halaman dalam urutan asli;
5. sheet classification/filter/source-page navigation;
6. DEM/PCKM/candidate inventory 88 halaman dari artifact nyata;
7. quantity/capability states: supported, ready, blocked, needs_review;
8. authoritative quantity labels/receipt;
9. review queue, evidence navigation, correction/approval;
10. individual/bulk selection dan server-side handoff;
11. loading/empty/retry/error/fail-closed states;
12. keyboard/accessibility dan mobile layout;
13. uncaught console errors, failed network requests, unhandled rejection.

Fitur AI live dan agentic live akan diuji pada Phase 11D; Phase 11C hanya boleh
membuktikan UI/fallback/state tanpa provider call.

## Viewer image quality

Update:

`report/report_drawing_intelligence/VIEWER_IMAGE_QUALITY_FINAL_REPORT.md`

Bukti wajib:

- source PDF SHA/hash dan byte size;
- page count/identity;
- response range/status/headers;
- viewport dan zoom level;
- screenshot asli desktop/mobile;
- raster/tile dimensions serta cache/tile lifecycle;
- garis tipis, teks kecil, dimension strings, hatch/simbol;
- perbandingan page identity sebelum/sesudah zoom dan switch;
- tidak ada destructive compression atau downscale palsu;
- visual inspection artifact, bukan klaim tekstual saja.

## Performance/heap gate

Ukur dengan real viewer:

- cold load/FCP;
- warm page/sheet switch;
- long task;
- heap sebelum/sesudah rangkaian switch/zoom;
- request count dan cache reuse;
- lazy loading/tile pool cleanup.

Gunakan threshold plan/phase sebelumnya. Jika sebuah threshold tidak
terdefinisi, jangan membuat angka threshold baru; laporkan nilai aktual dan
limitation. Fail bila ada regression material, leak terus bertambah, viewer
macet, atau gambar kehilangan fidelity.

## Error-state proof

Untuk membuktikan fail-closed tanpa interception:

- boleh menghentikan service yang dikelola fase ini secara terkontrol;
- buktikan UI menampilkan error/retry dan tidak fake success;
- hidupkan kembali service dan buktikan recovery;
- jangan memalsukan response browser.

## Gate

- jalankan existing Phase 09E/10B E2E sebagai regression;
- buat/run Phase 11C final real-stack spec bila diperlukan;
- simpan screenshots, traces, network logs, performance JSON;
- update Super Big Plan dan Feedback1 final matrix hanya berdasarkan hasil;
- `tsc --noEmit` dan Next build bila source/test browser berubah;
- `graphify update .`;
- `git diff --check`;
- secret/runtime artifact scan;
- cleanup semua proses fase dan pastikan port bersih;
- live provider call counter Phase 11 tetap 0.

Jika defect produk ditemukan, jangan menurunkan assertion. Gunakan
`CHANGES_REQUIRED` dan berhenti agar dibuat correction round.

## Feedback

Tulis:

`G:\paax-ai-contextual-integration\PHASE_11C_REAL_STACK_BROWSER_VIEWER_PERFORMANCE_FEEDBACK.md`

Kontrak:

```text
PHASE:
STATUS:
MODEL:
WORKTREE:
BRANCH:
BASE COMMIT:
IMPLEMENTATION/REPORT COMMIT:
FEEDBACK COMMIT:
POST-FEEDBACK HEAD/REMOTE:
4-SERVICE REAL STACK:
DESKTOP E2E:
MOBILE E2E:
53-PAGE PDF:
88-PAGE ARTIFACT:
SHEET/QUANTITY/REVIEW/HANDOFF:
IMAGE QUALITY:
RANGE/CACHE/TILE:
PERFORMANCE/FCP/WARM SWITCH:
LONG TASK/HEAP:
ACCESSIBILITY:
NETWORK/CONSOLE:
ERROR/RETRY/RECOVERY:
MATRIX/REPORT UPDATES:
TSC/BUILD:
LIVE PROVIDER CALLS:
SECRET/ARTIFACT SCAN:
PROCESS CLEANUP:
REMAINING CONCERNS:
NEXT RECOMMENDED ACTION:
QUOTA STATUS:
```

Gunakan `DONE` hanya jika semua gate Phase 11C hijau. Setelah feedback, berhenti
dan jangan memulai Phase 11D.
