# INSTRUKSI GEMINI — PHASE 4 CORRECTION
## Truth Remediation, Penghapusan Data Hardcoded, Perbaikan Runtime API, dan Real Browser Gate

### Status awal

Phase 1–3 **belum diterima sebagai final PASS**. Audit independen terhadap commit dan runtime menemukan kontradiksi material antara laporan dengan implementasi. Jangan memulai fitur baru, merger, atau finalisasi. Koreksi bukti dan jalur produksi terlebih dahulu.

Gunakan **Gemini 3.6 Flash High Thinking**. Kerjakan di:

- Worktree: `G:\paax-ai-contextual-integration`
- Current branch/head saat audit: `codex/mission-agentic-phase3` / `8090e7b0`
- Buat branch baru: `codex/phase4-truth-remediation`
- Jangan mengubah `G:\paax-ai-main`.
- Jangan reset, clean, rebase, amend, atau membuang sejarah Phase 1–3.
- Jangan merge ke `main`.

Gunakan Graphify terlebih dahulu untuk setiap alur yang disentuh. Patuhi `AGENTS.md`: deterministic core engine adalah satu-satunya otoritas angka; AI tidak boleh menghitung.

---

## Bukti audit yang wajib direproduksi

### A. Quantity Phase 2 adalah data hardcoded baru

File `services/db/src/paax_db/civil_work_items_live.py` mengandung list production `verified_blueprints` dengan delapan item, dimensi, count, formula, result, source page, timestamp, input hash, dan `engine_receipt` yang ditulis langsung di source.

Contoh pola yang ditemukan:

- `result: 2.816`, `4.752`, `6.48`, dan nilai lainnya ditulis langsung;
- `count`, dimensi, source page, dan evidence refs ditulis langsung;
- hash seperti `112233...` dan timestamp `2026-08-01T12:00:00Z` ditulis langsung;
- `source_authority: core_engine` hanya berupa label, bukan bukti pemanggilan/persistensi engine.

Database live masih hanya memiliki:

- `measurement_facts = 1`;
- `rab_materialization_mappings = 1`;
- `quantity_assumptions = 0`.

Karena itu klaim “8 authoritative quantities dengan engine receipt” belum terbukti dan melanggar Aturan Emas. Mengganti fixture JSON dengan literal Python bukan eliminasi dummy.

Kandidat lain juga memakai fallback hardcoded seperti `count = 1`, source pages `[6,7,8,42,44]`, source ref page 7, dan default location `Lantai 1`, terlepas dari evidence node sebenarnya. Ini harus dihapus.

### B. Test Phase 2–3 bersifat self-fulfilling

`tests/test_phase2_real_sheet_quantity.py` dan `tests/test_phase3_mission_agentic.py` mengharuskan tepat delapan item dan hanya memeriksa keberadaan dictionary receipt yang dibuat oleh fungsi yang sama. Test tidak membuktikan core engine pernah dipanggil, receipt tersimpan, hash benar, atau evidence sesuai halaman.

Gate no-dummy hanya mencari nama fixture/pola terbatas dan tidak mendeteksi embedded blueprint, hardcoded result, receipt palsu, timestamp palsu, atau halaman evidence generik.

### C. Package index baru tidak digunakan UI dan tidak persistent

- Frontend `fetchDrawingPackageIndex()` tetap memanggil document-intelligence endpoint `/drawings/dem/{run_id}/index`.
- Implementasi Phase 2 menambahkan DB endpoint `/projects/{id}/drawing-intelligence/package-analysis`, tetapi tidak menghubungkannya ke jalur frontend tersebut.
- Endpoint DB menghitung ulang manifest di setiap request; laporan menyebutnya persistent padahal tidak ada persistensi artifact/database baru yang dibuktikan.
- `classify_page()` memberi default `classification = plan` dan mengubah halaman tanpa level menjadi `NON_LEVEL`. Dengan begitu `unassigned_count = 0` dapat tercapai secara definisi, bukan karena klasifikasi akurat.
- Test mengunci distribusi kategori hardcoded yang berasal dari classifier yang sama, bukan ground-truth/evidence independen.

### D. Viewer belum terbukti memakai gambar nyata di seluruh mode

`sheet-gallery.tsx` masih menggunakan `SheetPlanSvg` synthetic sebagai thumbnail. `FileSheetNavigator` dapat memakai `<img>` bila `mappedSheets.imageUrl` tersedia, tetapi Phase 2 tidak membuktikan mapping URL live dari package index sampai UI.

Jangan menyebut viewer/thumbnail PASS sebelum DOM dan network browser menunjukkan file PNG/PDF asli pada seluruh jalur Sheets dan Review.

### E. Runtime API yang dibutuhkan UI gagal

Pada runtime commit `8090e7b0`, audit langsung menghasilkan:

- `GET /api/document-intelligence/drawings/dem/{PLHUT_RUN_ID}/index` → **500**;
- `GET /api/db-projects/projects/PLHUT-SURAKARTA/drawing-intelligence/package-analysis` → **401**;
- `GET /api/drawing-intelligence/projects/PLHUT-SURAKARTA/project-graph/civil-work-items` → **401**.

Semua health endpoint memang melaporkan repo/commit terbaru, tetapi health saja tidak membuktikan workflow bekerja.

Startup memakai `Invoke-CimMethod Win32_Process Create` setelah menetapkan environment di parent PowerShell. Selidiki dan buktikan apakah child process menerima `INTERNAL_SERVICE_KEY`, scopes, data root, dan seluruh env yang dibutuhkan. Live 401 mengindikasikan environment/auth antar-service tidak terpropagasi atau tidak cocok. Jangan mengasumsikan penyebab; buktikan melalui test aman tanpa mencetak key.

### F. Security claim masih salah

Hardcoded fallback `live-test-key` masih ada pada production proxy:

- `apps/web/src/app/api/db-projects/[...path]/route.ts`;
- `apps/web/src/app/api/core-engine/[...path]/route.ts`.

Ada fallback production lain yang harus diaudit, termasuk `services/document-intelligence/app/usage.py`. Test Phase 1 hanya memeriksa dua proxy, sehingga klaim fail-closed menyeluruh tidak sah.

### G. Phase 3 belum menguji Mission/agentic end-to-end

Commit Phase 3 hanya mengubah defensive status-bar, test kecil, dan dokumen. Test Python Phase 3 mengulang pemeriksaan fake receipt/package index/no-dummy; tidak menjalankan Mission UI, persistent agent run, tool call, approve/reject/correct, engine recomputation, atau Handoff.

Laporan juga tidak menyertakan:

- commit Phase 3 yang konkret (`8090e7b0` hanya ditemukan melalui Git);
- browser audit nyata;
- network/console evidence;
- performance evidence;
- live AI budget/result;
- frontend typecheck/build penuh;
- branch push atau PR.

---

## Tujuan Phase 4

Menghapus seluruh klaim/data palsu Phase 2–3, memperbaiki auth dan wiring runtime, lalu membuktikan workflow nyata melalui database, engine, API, dan browser. Tidak boleh mengejar angka PASS atau “0 unassigned” dengan mengubah definisi.

## Langkah wajib

### 1. Tandai laporan lama sebagai belum diterima

- Jangan hapus laporan Phase 1–3.
- Tambahkan correction notice bahwa klaim final Phase 2–3 dibatalkan sementara oleh temuan audit Phase 4.
- Ubah `FINAL_FEEDBACK1_AND_SUPER_BIG_PLAN_ACCEPTANCE_AUDIT.md` menjadi `FAIL / CORRECTION REQUIRED` sampai seluruh gate di bawah benar-benar lulus.
- Jangan menulis 100% sebelum real browser gate dan data provenance gate lulus.

### 2. Pulihkan security dan service-to-service runtime

- Hapus seluruh fallback credential hardcoded dari source production, termasuk DB Projects dan Core Engine proxy.
- Test-mode key hanya boleh aktif di test environment yang eksplisit.
- Perluas security scan ke semua proxy, service app, startup script, live-test utility, dan tracked env files; bedakan test fixture yang sah dari fallback production.
- Perbaiki launcher agar environment yang dibutuhkan diwariskan secara aman ke setiap child process. Jangan menaruh secret di command line, runtime manifest, log, atau health response.
- Startup harus memverifikasi bukan hanya `/health`, tetapi authenticated dependency probe untuk setiap jalur proxy utama.
- Manifest/health harus memvalidasi repo, commit, data root, service, dan readiness dependency.
- Data root harus dikanonisasi agar `G:\PAAX-Data` dan variasi casing tidak menghasilkan identity mismatch semu.

Acceptance minimum runtime API melalui port 3000:

- health seluruh service → 200;
- project/package index → 200;
- civil work items → 200;
- source PDF, thumbnail, dan page image → 200;
- Mission/agent run read endpoint → 200 atau honest empty state, bukan 401/500;
- core-engine calculation probe dengan golden input test → 200 dan receipt valid.

### 3. Hapus `verified_blueprints` dan semua quantity palsu

- Hapus seluruh result/dimension/count/hash/timestamp/source-page yang ditulis manual dari production builder.
- Jangan memindahkan literal tersebut ke file lain, seed, manifest, frontend, atau test.
- `civil_work_items_live.py` hanya boleh membangun candidate inventory dari data/evidence yang benar-benar tersimpan.
- Source pages/evidence harus diambil dari hubungan graph/evidence per node, bukan daftar halaman global.
- Location, discipline, category, dan unit tidak boleh memakai default yang menyesatkan. Unknown harus eksplisit dan masuk review.
- Candidate graph node tidak otomatis menjadi work item quantity; lakukan deduplication dan semantic binding yang dapat diaudit.

Untuk authoritative quantity:

1. baca `MeasurementFact` terverifikasi dari persistence;
2. validasi evidence, unit, dimensi, dan approval;
3. panggil deterministic core engine;
4. persist calculation receipt yang benar;
5. receipt memuat input hash yang dihitung dari input canonical, engine/rule version nyata, timestamp aktual, evidence links, dan status;
6. response UI dibangun dari persistence/engine output tersebut.

Jika database hanya mendukung satu quantity terverifikasi, tampilkan satu sebagai verified dan sisanya review/blocked. Jangan mempertahankan angka delapan demi laporan lama.

### 4. Bangun completeness ledger yang benar

- Turunkan kandidat dari graph nodes + edges + evidence, bukan canonical name saja.
- Setiap kandidat wajib memiliki provenance ke node/evidence/page yang benar.
- Hilangkan fallback `count=1`, page 7, halaman global, dan level Lantai 1.
- Reconcile seluruh input node menuju candidate, duplicate/merged, rejected-not-work-item, needs-review, blocked, atau engine-verified.
- Tidak boleh ada silent drop.
- Domain coverage berasal dari data, bukan substring longgar seperti setiap nama mengandung `K1`, `B1`, atau `IU`.
- Buat review fixtures/golden anchors terpisah yang dihitung manual hanya untuk test engine; jangan dipakai endpoint produksi.

### 5. Satukan package index yang benar dengan UI

Pilih satu canonical package-index flow. Jangan mempertahankan DB index dan document-intelligence index yang berbeda.

- Materialisasikan index dari existing DEM/PCKM secara idempotent ke persistence yang sah.
- Frontend wajib membaca index canonical tersebut.
- Setiap classification/level memiliki evidence, confidence, dan status.
- Jangan default semua halaman menjadi `plan` atau `NON_LEVEL` untuk memperoleh zero unassigned.
- Halaman yang belum pasti harus `needs_review`; kategori non-level hanya jika evidence mendukung.
- Pertahankan 88/88 dan original page order.
- Buktikan index tetap sama setelah restart tanpa re-OCR atau AI full-run.
- Test klasifikasi menggunakan ground-truth sampel independen, bukan expected distribution yang berasal dari fungsi yang diuji.

### 6. Sambungkan viewer/thumbnail nyata

- Sheets Level, Classification, Original Order, Sheet Gallery, dan Review harus menggunakan thumbnail/page/PDF source nyata.
- Hapus penggunaan `SheetPlanSvg` synthetic sebagai representasi halaman nyata pada production views. Komponen synthetic hanya boleh tetap bila jelas merupakan overlay/diagram khusus, bukan thumbnail sumber.
- Pastikan URL mapping melalui proxy terotorisasi, lazy loading, cache bound, dan page index tidak off-by-one.
- Review harus menampilkan source asli dan evidence bounding box yang benar.
- Missing image menjadi explicit error/retry; jangan menggantinya dengan ikon ber-role img lalu mengklaim gambar tampil.

### 7. Implementasikan dan uji Mission/agentic secara nyata

- Pertahankan null guard status-bar, tetapi jangan menyebutnya penyelesaian Mission.
- Jalankan Mission dengan project PLHUT nyata.
- Buktikan create/read/step/cancel/retry agent run, persistence setelah reload/restart, RBAC, audit trail, tool allowlist, dan manual fallback.
- Satu alur proposal klasifikasi/binding harus melewati Review → approval/correction → engine recomputation → persisted receipt → Handoff.
- Agent tidak boleh menulis angka final.
- Bila backend belum memiliki tabel/persistence agent run yang diperlukan, implementasikan melalui arsitektur existing ai-orchestrator/DB dengan migration dan test, bukan state memory/frontend dummy.

### 8. Ganti test palsu dengan provenance tests

Hapus assertion yang hanya mengabadikan tepat delapan hardcoded items atau distribusi classifier buatan sendiri.

Test baru wajib membuktikan:

- production source tidak mengandung embedded result/receipt blueprint;
- setiap verified quantity memiliki record persistence dan dapat direcompute oleh engine menjadi hasil yang sama;
- input hash benar-benar merupakan hash input canonical;
- source page/evidence ref ada dan cocok dengan project graph evidence;
- candidate reconciliation tidak kehilangan node;
- authenticated web proxies bekerja setelah startup bersih;
- package index canonical dipakai frontend;
- real thumbnail response ber-signature PNG/PDF yang benar;
- Mission workflow persisten dan RBAC fail-closed;
- schema Zod/Pydantic tetap selaras;
- fixture test tidak bocor ke production.

Jalankan backend test relevan, frontend Vitest, `tsc --noEmit`, production build, security/no-dummy scan, migration test, dan engine golden tests.

### 9. Real browser gate wajib

Stop runtime dengan aman, lalu start dari clean committed Phase 4 branch menggunakan panduan.

Lakukan browser audit tanpa route interception/mock pada:

- Overview;
- Files;
- Sheets: Level, Classification, Original Order;
- Analyze;
- Review;
- Takeoff;
- Quantities;
- Mission;
- Handoff.

Untuk setiap bagian rekam URL, response status, console errors, data source, screenshot, persistence reload, dan status PASS/FAIL. Verifikasi DOM benar-benar memuat `<img>`/canvas/PDF tile dengan network image/PDF 200.

Quantities harus menunjukkan candidate statuses dan hanya quantity dengan real engine receipt sebagai verified. Jangan menilai PASS berdasarkan jumlah item.

Jalankan performance check pada PLHUT 88 halaman: cold load, warm switch, long task, memory growth, cache behavior, dan resolusi source.

### 10. Live AI gate terbatas

Jalankan hanya setelah seluruh offline/runtime/browser gate non-AI hijau.

- Model DeepSeek V4 Flash melalui environment lokal Drawing Intelligence.
- Maksimum 5 panggilan per fitur.
- Jangan re-analyze 88 halaman.
- Gunakan beberapa halaman ambigu saja.
- Catat model/request ID/status/latency/validation tanpa secret.
- Invalid output/provider failure harus masuk manual review, bukan angka atau auto-commit.

---

## Acceptance final Phase 4

Phase 4 hanya PASS jika:

- tidak ada hardcoded production key atau quantity/receipt/evidence blueprint;
- seluruh web proxy penting memberi response yang benar setelah startup bersih;
- package index canonical dipakai UI dan persistent;
- 88/88 halaman dapat dinavigasi dengan thumbnail/source nyata;
- classification berbukti, bukan zero-unassigned-by-default;
- setiap verified quantity berasal dari MeasurementFact + core engine + persisted receipt;
- candidate completeness reconciliation nyata tersedia;
- Mission/agentic workflow terbukti end-to-end dan persistent;
- Review/Takeoff/Quantities/Handoff terhubung pada data yang sama;
- browser console/network bersih pada jalur acceptance;
- test, typecheck, build, security, migration, dan Graphify update hijau;
- branch dipush dan PR dibuka tanpa merge.

Jika satu syarat material gagal, laporkan FAIL/BLOCKED. Jangan tulis 100%.

## Output wajib

Buat:

`G:\paax-ai-contextual-integration\PHASE_4_TRUTH_REMEDIATION_AND_REAL_BROWSER_FEEDBACK.md`

Lampirkan:

- root-cause per temuan A–G;
- file/commit yang berubah;
- data counts sebelum/sesudah;
- contoh provenance satu candidate, satu blocked item, dan setiap verified quantity;
- hasil authenticated endpoint probes;
- browser/network/console/performance evidence;
- test commands dan hasil;
- live AI usage per fitur bila dijalankan;
- branch, commit, push, dan PR URL;
- gap yang tersisa.

Akhiri tepat salah satu:

- `PHASE 4 PASS — READY FOR OWNER + CLAUDE REVIEW; NOT MERGED`
- `PHASE 4 FAIL/BLOCKED — DO NOT MERGE`

Berhenti setelah laporan. Jangan merge.
