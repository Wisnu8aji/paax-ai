# INSTRUKSI GEMINI — PHASE 4 CORRECTION ROUND 1
## Runtime Wajib Hidup, Receipt Engine Nyata, Canonical Package Index, Viewer Nyata, dan Browser Gate Tanpa Skip

### Keputusan audit

Laporan `PHASE_4_TRUTH_REMEDIATION_AND_REAL_BROWSER_FEEDBACK.md` **DITOLAK**. Status aktual adalah:

`PHASE 4 FAIL — CORRECTION ROUND 1 REQUIRED`

Jangan lanjut Phase 5, merger, final acceptance, push, atau PR sebelum correction round ini lulus.

### Lokasi dan perlindungan pekerjaan

- Worktree: `G:\paax-ai-contextual-integration`
- Branch: `codex/phase4-truth-remediation`
- Base commit saat audit: `8090e7b0`
- Seluruh perubahan Phase 4 masih uncommitted. Pertahankan semuanya; jangan reset, checkout, clean, rebase, amend, atau membuang file.
- Jangan mengubah `G:\paax-ai-main`.
- Gunakan Gemini 3.6 Flash High Thinking.
- Baca `AGENTS.md` dan gunakan Graphify sebelum perubahan.

---

## Temuan yang belum diperbaiki

### 1. Klaim PASS dibuat ketika real runtime gate tidak dijalankan

- Seluruh port `3000`, `8001`, `8081`, `8082`, `8083`, dan `8085` sedang tidak listen saat audit.
- Test Phase 4 melaporkan `17 PASSED, 2 SKIPPED`; dua skip tersebut justru adalah runtime verification yang diwajibkan.
- Tidak ada screenshot, browser trace, network ledger, console ledger, performance result, atau bukti fitur Sheets/Review/Quantities/Mission/Handoff.
- Laporan tidak diakhiri deklarasi acceptance yang diwajibkan.
- Perubahan belum memiliki commit Phase 4.

Tidak boleh menyebut Real Browser Gate PASS jika runtime mati atau test dilewati.

### 2. Secret dipindahkan ke plaintext batch file

`Start-PLHUT-Local.ps1` menulis `INTERNAL_SERVICE_KEY` secara plaintext ke:

`G:\PAAX-Data\runtime\{service}.launch.bat`

Ini bukan solusi aman. Secret tidak berada di command line, tetapi tetap tersimpan pada script plaintext yang dapat dibaca dan tertinggal setelah proses selesai. Scanner tidak memeriksa generated runtime wrappers sehingga memberikan false PASS.

### 3. MeasurementFact masih salah disebut hasil engine

`civil_work_items_live.py` sekarang:

- membaca `measurement_facts.value`;
- menghitung SHA-256 sendiri;
- memberi status `engine_verified` jika mapping `approved`;
- menampilkan nilai fact langsung sebagai `result`.

Tidak ada core-engine invocation atau persisted calculation receipt yang dibuktikan. MeasurementFact adalah input/fakta pengukuran, bukan receipt hasil engine. Mapping approval juga bukan bukti engine calculation. `ai_verified` tidak boleh otomatis menjadi input authoritative tanpa human approval.

### 4. Completeness ledger masih kehilangan data

- Kandidat hanya membaca `element_type` dan `drawing_reference`; `element_occurrence` tidak direkonsiliasi.
- Deduplication hanya berdasarkan canonical name dapat menggabungkan occurrence/lokasi berbeda secara salah.
- `evidence_refs` kandidat masih dibentuk sebagai string `graph-node-*`, bukan record evidence canonical yang benar.
- Tidak ada reconciliation jumlah input nodes → merged candidates → rejected/not-work-item → review/blocked/verified.

### 5. Persistensi package index tidak production-ready

- Migration dilakukan dengan `ALTER TABLE` langsung di fungsi runtime/getter, bukan migration resmi.
- `_persist_classifications()` memilih `SELECT id FROM dem_runs ORDER BY created_at DESC LIMIT 1` tanpa project filter, sehingga dapat menulis run proyek lain.
- Getter dapat mengubah database sebagai side effect.
- Persisted response menghilangkan discipline menjadi `Unknown`.
- Tidak ada Zod/Pydantic/schema parity untuk kolom/contract baru.
- Frontend masih memanggil document-intelligence `/drawings/dem/{run_id}/index`; DB package-analysis yang baru belum terbukti sebagai canonical source UI.

### 6. Viewer dan Mission belum diperbaiki

- Tidak ada perubahan frontend yang menghubungkan package index baru.
- `sheet-gallery.tsx` masih menggunakan `SheetPlanSvg` synthetic.
- Tidak ada perubahan Mission/agentic persistence selain perbaikan status-bar dari Phase 3.
- Tidak ada bukti Review viewer, Takeoff, correction workflow, engine recomputation, atau Handoff nyata.

### 7. Runtime tests terlalu permisif

Test saat ini:

- melakukan `pytest.skip` bila service tidak terjangkau atau mendapat 401;
- menerima `200`, `401`, atau `403` sebagai sama-sama acceptable untuk valid web proxy request;
- tidak memverifikasi invalid credential secara terpisah;
- tidak memverifikasi commit/data-root identity pada seluruh response;
- tidak memverifikasi browser UI.

Ini tidak dapat menjadi acceptance test.

---

## Pekerjaan koreksi wajib

### A. Perbaiki laporan terlebih dahulu

- Ubah status laporan Phase 4 menjadi `FAIL — CORRECTION ROUND 1 IN PROGRESS`.
- Jangan menghapus bukti test sebelumnya; tandai 17 pass/2 skip sebagai offline partial evidence.
- Jangan menulis `ALL REMEDIATION VERIFIED` sebelum semua gate di file ini selesai.

### B. Ganti mekanisme launcher secara aman

Jangan menulis secret ke `.bat`, `.cmd`, `.ps1`, JSON manifest, log, atau argument command line.

Gunakan mekanisme proses Windows yang dapat memberikan environment block langsung kepada child, misalnya supervisor/helper yang memakai `System.Diagnostics.ProcessStartInfo` dengan environment map, `UseShellExecute=false`, hidden/no-window, working directory eksplisit, serta log redirection aman. Pilih implementasi sesuai arsitektur repository; jangan menebak.

Persyaratan:

- secret hanya berada pada protected key file dan environment memory;
- key file memiliki ACL user-only bila platform mendukung;
- tidak ada generated launcher plaintext yang memuat key;
- stop/cleanup menghapus artifact runtime non-rahasia yang stale;
- semua child menerima repo/commit/data-root/scopes/key yang sama;
- startup menunggu authenticated readiness, bukan health publik saja;
- restart kedua idempotent dan tidak menduplikasi proses;
- foreign PID/port tetap fail closed.

Tambahkan test yang memindai runtime directory dan command lines untuk memastikan nilai secret tidak muncul. Jangan mencetak nilainya dalam output test.

### C. Pisahkan MeasurementFact, Engine Calculation, dan Receipt

Definisikan status jujur:

- `measurement_verified`: fact sudah human-approved tetapi belum dihitung engine;
- `engine_verified`: hanya bila persisted receipt nyata tersedia dan lolos verifikasi;
- `needs_review`;
- `blocked_missing_evidence`.

Jangan menerima `ai_verified` sebagai final tanpa human approval record.

Gunakan pipeline existing core-engine:

1. load MeasurementFact canonical dan evidence;
2. validasi approval, unit, dimensi, dan rule applicability;
3. buat canonical calculation request;
4. panggil core-engine;
5. persist request, result, engine version, rule ID, canonical input hash, timestamp, evidence links, dan approval lineage;
6. baca ulang persisted receipt untuk response UI;
7. recompute test harus menghasilkan nilai/hash yang identik.

Jika repository belum memiliki receipt table yang tepat, buat migration dan model resmi setelah menelusuri arsitektur existing. Jangan membuat receipt dictionary sementara. Sinkronkan Pydantic dan Zod dalam commit sama.

Pada data sekarang, bila belum ada persisted receipt maka `engine_verified_count` wajib **0**, bukan 1 atau 8. Nilai MeasurementFact tidak boleh diberi label hasil engine.

### D. Perbaiki completeness ledger

- Rekonsiliasi `element_type`, `element_occurrence`, hubungan graph, dan evidence.
- Jangan deduplicate hanya berdasarkan nama. Gunakan semantic identity + discipline + level/zone + occurrence/evidence.
- Bedakan element definition, occurrence, drawing reference, dan actual work-item candidate.
- Evidence refs harus menunjuk row evidence canonical yang benar dan dapat di-resolve.
- Buat ledger dengan jumlah:
  - source nodes/occurrences;
  - merged candidates;
  - duplicates dengan alasan;
  - rejected-not-work-item dengan alasan;
  - needs-review;
  - blocked;
  - measurement-verified;
  - engine-verified.
- Total keluaran wajib reconcile ke total input relevan tanpa silent drop.

### E. Buat package index canonical dan schema-safe

- Gunakan migration framework resmi repository, bukan `ALTER TABLE` di getter.
- Getter/read endpoint tidak boleh mengubah database.
- Persist classification melalui explicit materialization command/job yang idempotent.
- Semua update dibatasi `project_id` dan `run_id` yang eksplisit.
- Simpan discipline, level, classification, source, evidence, confidence, status, rule/model version, dan review decision.
- Selaraskan Pydantic/Zod/API contract.
- Tentukan satu canonical endpoint yang digunakan frontend. Hapus atau adaptasi jalur duplikat agar tidak ada dua index berbeda.
- Document-intelligence/frontend harus membaca persisted canonical index yang sama.
- Unknown/needs-review tetap jujur; tidak perlu memaksa zero unassigned.
- Correction/approval manusia harus persistent dan tidak ditimpa materialization ulang.

### F. Sambungkan gambar nyata ke seluruh UI

- `FileSheetNavigator`, Sheet Gallery, Level, Classification, Original Order, dan Review harus membaca image/PDF URL canonical.
- Ganti `SheetPlanSvg` synthetic sebagai thumbnail production dengan `<img>` source nyata atau PDF tile/canvas nyata.
- Synthetic SVG hanya boleh menjadi overlay yang diberi label jelas, bukan halaman sumber.
- Verifikasi 88 thumbnail menggunakan lazy loading dan cache bound.
- Review harus memuat source PDF/page asli, zoom/pan, serta bounding box yang benar.
- Tambahkan test page-index off-by-one dan missing artifact recovery.

### G. Selesaikan Mission/agentic end-to-end

- Jangan hanya menguji `statusDotColor`.
- Buktikan create/read/step/cancel/retry run.
- Persist run/event/audit state dan buktikan tetap ada setelah reload/restart.
- Uji RBAC allow/deny dengan actor nyata.
- Uji tool allowlist dan fail-closed provider.
- Jalankan satu proposal classification/binding melalui Review → human correction/approval → engine request → persisted receipt → Quantities → Handoff.
- Agent tidak boleh menulis angka atau auto-approve input.

### H. Rewrite acceptance tests agar tidak dapat skip

Pisahkan dua kelompok:

1. Offline tests boleh berjalan tanpa server.
2. Live acceptance tests **wajib gagal**, bukan skip, bila server mati, auth salah, runtime identity mismatch, endpoint 401/403/500, atau browser gagal.

Valid authenticated probe harus mensyaratkan tepat `200`. Buat test terpisah yang membuktikan missing/invalid key menghasilkan `401/503` sesuai boundary.

Wajib uji melalui port 3000:

- project/list/detail;
- package index canonical;
- civil candidate ledger;
- source PDF/page/thumbnail;
- core-engine calculation;
- review queue/correction;
- Mission runs;
- Handoff.

Semua response wajib project-scoped dan runtime identity harus cocok dengan commit final.

### I. Commit, restart bersih, lalu browser audit

Urutan wajib:

1. selesaikan source dan offline tests;
2. jalankan Graphify update;
3. buat commit Phase 4 CR1;
4. stop seluruh service dengan aman;
5. pastikan enam port bersih;
6. start dari commit baru dengan panduan;
7. pastikan enam service melaporkan commit yang sama;
8. jalankan live tests tanpa skip;
9. jalankan browser audit nyata tanpa interception/mock;
10. bila perlu koreksi lagi, commit ulang dan ulangi clean restart.

Browser audit wajib meliputi Overview, Files, ketiga mode Sheets, Analyze, Review, Takeoff, Quantities, Mission, dan Handoff. Lampirkan screenshot, network status, console error ledger, DOM proof gambar nyata, reload/restart persistence, dan performance result PLHUT 88 halaman.

Jangan menjalankan live AI sampai seluruh non-AI gate hijau. Bila akhirnya diperlukan, DeepSeek V4 Flash maksimum 5 panggilan per fitur dan tanpa full 88-page rerun.

---

## Gate kelulusan Correction Round 1

Semua wajib terpenuhi:

- zero skipped live acceptance tests;
- enam server aktif dari commit Phase 4 CR1 yang sama;
- valid web proxy requests seluruhnya 200;
- secret tidak muncul dalam source, generated runtime files, command line, manifest, atau log;
- tidak ada MeasurementFact yang salah diberi label engine receipt;
- setiap engine-verified item memiliki persisted receipt yang dapat direcompute;
- candidate ledger reconcile tanpa silent drop;
- package index canonical, project/run scoped, schema-aligned, dan digunakan UI;
- seluruh 88 sheet memakai source image/PDF nyata;
- Mission/Review/Takeoff/Quantities/Handoff terbukti end-to-end;
- browser network/console bersih;
- build, typecheck, backend/frontend tests, migration, security, no-dummy, engine golden tests, dan Graphify hijau;
- perubahan committed, branch pushed, dan PR dibuat tanpa merge.

Jika satu poin gagal, status tetap FAIL.

## Output wajib

Perbarui:

`G:\paax-ai-contextual-integration\PHASE_4_TRUTH_REMEDIATION_AND_REAL_BROWSER_FEEDBACK.md`

Tambahkan bagian `CORRECTION ROUND 1` berisi commit, runtime identity, endpoint ledger, data provenance/receipt evidence, reconciliation counts, browser evidence, test outputs, performance, dan PR URL.

Akhiri tepat salah satu:

- `PHASE 4 CR1 PASS — READY FOR OWNER + CLAUDE REVIEW; NOT MERGED`
- `PHASE 4 CR1 FAIL/BLOCKED — DO NOT MERGE`

Berhenti. Jangan merge.
