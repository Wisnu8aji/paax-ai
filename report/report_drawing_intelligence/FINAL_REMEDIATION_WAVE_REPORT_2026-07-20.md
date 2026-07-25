# FINAL REMEDIATION WAVE — LAPORAN APA ADANYA

**Tanggal:** 2026-07-20
**Sumber instruksi:** `C:\Users\Nothing\Downloads\PAAX_FINAL_REMEDIATION_WAVE_INSTRUCTIONS.md`
**Status keseluruhan:** **TIDAK SELESAI — 5 dari 6 target selesai & ter-commit, Target 6 baru diagnosis, belum diperbaiki.**
**Ready for independent final audit: NO**

Laporan ini digabung dari dua bagian: (1) pekerjaan paling akhir yang saya kerjakan sebelum berhenti (Target 6), dan (2) rekap menyeluruh semua yang dikerjakan dari awal sesi remediation wave ini.

---

## BAGIAN 1 — PEKERJAAN TERAKHIR: Target 6 (Final Verification)

Ini yang sedang saya kerjakan saat harus berhenti. **Belum ada perbaikan kode untuk Target 6 — baru tahap diagnosis/investigasi.**

### Apa yang sudah saya temukan

Instruksi asli meminta saya memperbaiki **27 test failure yang sudah ada sebelumnya di `services/db`** — sesi sebelumnya (sebelum wave ini) sempat melabeli ke-27 failure ini sebagai "pre-existing, disebabkan oleh test isolation (polusi state DB bersama antar file test)", dibuktikan lewat `git stash` (failure yang sama muncul dengan atau tanpa perubahan saya).

**Saya ulangi verifikasi `git stash` itu di awal Target 6 — hasilnya konsisten: 27 failure yang sama, sama persis, dengan atau tanpa kode Target 1-5 saya.** Jadi kesimpulan "bukan disebabkan oleh remediation wave ini" itu benar.

**Tapi saya mulai membongkar akar masalah sebenarnya (bukan cuma label "pre-existing"), dan menemukan sesuatu yang berbeda dari hipotesis sesi sebelumnya:**

Saya cek 3 dari 27 test itu secara terisolasi (dijalankan sendirian, bukan bareng suite lain) — **kalau memang test isolation/polusi state, harusnya lolos ketika dijalankan sendirian.** Hasilnya:

1. **`test_create_quantity_assumption_success`** — gagal (`422` bukan `200`) bahkan saat dijalankan sendirian. Akar masalahnya: skema `QuantityAssumptionCreate` di `schemas.py` sudah berubah total sejak test ini ditulis. Test masih kirim payload lama (`text`, `status`) tapi skema sekarang mewajibkan field yang sama sekali berbeda (`value`, `unit`, `scope`, `rationale`, `owner`, dst). Ini **bukan bug isolasi test — ini fixture test yang basi/ketinggalan**, tidak diperbarui saat skema di-refactor di sesi lain.

2. **`test_confidence_range_constraints`** — gagal juga saat dijalankan sendirian (`DID NOT RAISE IntegrityError`). Test mengharapkan constraint level-DB yang membatasi `confidence` ke rentang 0-1, tapi constraint itu sepertinya tidak (lagi) ada di model — kemungkinan sama: perilaku berubah, test tidak diperbarui.

3. Test ketiga belum sempat saya periksa detail root cause-nya sebelum harus berhenti.

### Kesimpulan sementara (belum lengkap, jangan dianggap final)

Dugaan saya — **masih dugaan, belum saya buktikan untuk semua 27** — adalah sebagian besar dari 27 failure ini bukan satu akar masalah tunggal ("test isolation"), melainkan **kumpulan test yang basi terhadap kontrak/skema yang sudah berubah** di berbagai titik sepanjang sejarah repo. Kalau dugaan ini benar, perbaikannya bukan satu fix generik, tapi **per-file**: tiap test file perlu ditinjau satu per satu apakah fixture-nya masih cocok dengan skema/endpoint yang sekarang berlaku, lalu diperbarui.

**Saya TIDAK memperbaiki satu pun dari 27 test ini.** Saya juga tidak sempat memverifikasi 24 sisanya untuk tahu apakah semuanya benar-benar akar masalah yang sama atau campuran beberapa penyebab berbeda.

### Yang masih harus dikerjakan untuk Target 6 (belum disentuh sama sekali)

- Diagnosis root cause utuh untuk 24 dari 27 failure yang belum diperiksa.
- Perbaikan aktual (bukan sekadar label) untuk semua 27, tanpa melemahkan assertion atau menandai test sebagai skip.
- Jalankan penuh: pytest core-engine, document-intelligence, db — semua harus hijau.
- Web: `pnpm test` (schemas/ai-orchestrator/web), `tsc --noEmit`, `pnpm build`.
- Verifikasi migrasi Alembic dengan **PostgreSQL + pgvector asli** (bukan JSONB pengganti) — pgvector extension **belum terpasang** di instance PostgreSQL lokal (tidak ada binary Windows prebuilt, tidak ada compiler C untuk build dari source) — ini gap yang sudah diketahui dan didokumentasikan, belum diselesaikan.
- Alur end-to-end deterministik penuh tanpa AI key live (PDF fixture → artifact storage → DEM run → job queue → worker lease → provider fixture deterministik → sintesis → retrieval → verifikasi klaim).
- GitHub Actions CI (Python suites, TypeScript test, typecheck, build, migrasi PostgreSQL+pgvector, test network-block, alur integrasi deterministik).

**Karena Target 6 belum selesai, saya TIDAK BISA menyatakan "Ready for independent final audit: YES".** Itu jawabannya: **NO**, dan alasannya bukan basa-basi kehati-hatian — beberapa suite memang masih merah dan saya belum tahu skala penuh masalahnya.

---

## BAGIAN 2 — REKAP MENYELURUH: SEMUA YANG DIKERJAKAN DARI AWAL WAVE INI

Sumber instruksi: `PAAX_FINAL_REMEDIATION_WAVE_INSTRUCTIONS.md` mendefinisikan 6 target. Berikut status tiap target, urut, apa adanya.

### Target 1 — Production durable worker untuk antrian DEM ✅ SELESAI & TER-COMMIT (`22c073ed`)

Sebelumnya sistem produksi tidak punya worker nyata yang me-lease job dari `DbDurableJobStore` — hanya `InMemoryDurableJobStore` (test-only) dan FastAPI `BackgroundTasks` (bukan executor produksi yang aman restart/duplicate-delivery).

Dibangun:
- Endpoint HTTP baru di `services/db` (`transition`, `heartbeat`, `complete`, `retry`, get-by-id) untuk siklus hidup job penuh, dengan enforcement lease ownership.
- `AsyncDurableJobQueue` protocol terpisah dari `DurableJobQueue` sync yang sudah ada (sengaja dipisah, bukan dipaksa satu interface).
- `AsyncDurableWorker` (worker loop nyata: lease → transition_running → heartbeat loop paralel → dispatch handler → complete/retry, retry dibatasi dengan backoff eksponensial sama persis dengan `InMemoryDurableJobStore`).
- `DemJobHandlers` (pembungkus deterministik untuk `dem.extract`/`dem.synthesize` memakai kode produksi yang sama, bukan duplikasi logic).
- Entrypoint `python -m app.durable_worker_main` — gagal start (fail-closed) kalau queue/storage/kredensial tidak lengkap, bukan diam-diam jalan dengan konfigurasi salah.
- Test: 7 test worker async, 2 test handler, 4 test startup fail-closed, 3 test siklus hidup job di services/db.

### Target 2 — Identitas end-user & otorisasi proyek di rute DEM ✅ SELESAI & TER-COMMIT (`27496669`)

Sebelumnya semua panggilan `document-intelligence` → `services/db` memakai identitas service tetap (`dem-job-orchestrator`), jadi pengecekan keanggotaan proyek apa pun selalu lolos lewat jalur bypass `internal_scopes`/`service_scope` — tidak peduli siapa user asli yang memicu request.

Dibangun:
- Endpoint baru `POST /internal/authorize-actor` di services/db — menerima `actor_id` eksplisit di body (bukan identitas si pemanggil), dicek keanggotaannya sungguhan, digerbangi scope khusus `dem:authorize-actor` (supaya tidak jadi bypass global baru).
- Semua 6 rute DEM (`start`, `status`, `synthesize`, `pages/{index}/image`, `artifact-url`, `artifact` DELETE) sekarang resolve identitas actor asli dari header auth (bukan dari field yang dikirim client), verifikasi keanggotaan proyek sebelum operasi apa pun, catat `requested_by`/actor di audit trail.
- Test: +2 test endpoint baru, +1 test audit trail, +1 test bukti actor dari auth header, +2 test penolakan, 3 test lama diperbarui untuk mock alur baru.

### Target 3 — Provenance numerik per-klaim di Command Room ✅ SELESAI & TER-COMMIT (`53a0caf8`)

Sebelumnya satu panggilan tool Core Engine mengotorisasi SEMUA angka di jawaban satu giliran chat — tidak ada pengecekan bahwa angka spesifik itu benar-benar berasal dari hasil tool spesifik itu.

Dibangun:
- Kontrak `Claim` terstruktur baru (`claim-provenance.ts`) dengan field lengkap sesuai instruksi (claim_id, value, authority_class, verification_status, dst).
- `result` mentah dari tiap tool call sekarang benar-benar diteruskan lewat pipeline SSE (sebelumnya dibuang setelah dipakai LLM), lalu dicocokkan per-klaim terhadap tool result spesifik yang benar-benar mengandung nilai itu.
- 2 bug nyata ditemukan & diperbaiki lewat test adversarial saya sendiri: (1) redaksi klaim yang ditolak dulu menghapus seluruh baris — kalau klaim valid & klaim ditolak berbagi satu kalimat, klaim valid ikut hilang; (2) placeholder sintetis untuk klaim kontekstual tidak pernah cocok dengan teks asli, jadi redaksi diam-diam tidak berfungsi.
- Test: 14 test termasuk skenario adversarial persis dari instruksi (dimensi+jumlah palsu tidak saling mengotorisasi, volume+harga tidak saling mengotorisasi, dst).

### Target 4 — Versi ruang koordinat & migrasi bbox legacy ✅ SELESAI & TER-COMMIT (`863b8b07`)

Sebelumnya sistem menebak ruang koordinat bbox dari ada-tidaknya `page_transform` — bug nyata: bbox yang sudah normalized bisa ditransformasi ulang seolah itu koordinat PDF-point, merusak setiap kutipan evidence.

Dibangun:
- Field eksplisit `bbox_space` (normalized/pixel/pdf_point/viewport/unknown) — fakta yang dinyatakan, bukan ditebak.
- `canonicalize_bbox()` yang bercabang ketat berdasarkan `bbox_space`, dan **mengkarantina** (bukan menebak) apa pun yang tidak bisa ditangani.
- Kolom DB baru (`bbox_space`, `bbox_quarantine_reason`, `coordinate_schema_version`, `transform_version`) via migrasi Alembic.
- Utilitas deteksi/pelaporan migrasi bbox legacy — **bukan penulisan langsung**, karena baris evidence bersifat immutable by design (guard `before_update` di model). `dry_run=False` sengaja raise `NotImplementedError` dengan penjelasan, bukan diam-diam gagal.
- Test: 11 test canonicalize, 5 test migration utility.

### Target 5 — Karantina evidence & typed DEM ✅ SELESAI & TER-COMMIT (`236520ab`)

Sebelumnya evidence yang hilang/konflik cuma menurunkan `verification_status` node jadi "ambiguous" — tapi nilainya tetap bisa dipakai seolah otoritatif, karena `retrieve_project_graph` (jalur konteks Command Room) **sama sekali tidak pernah memfilter** berdasarkan `verification_status`/`confidence_class`. Field `allowed_claims`/`forbidden_claims` yang seharusnya jadi mekanisme penolakan ternyata **mati total di sisi produsen** — tidak ada satu pun kode synthesis yang pernah mengisinya.

Dibangun:
- Gerbang eligibility retrieval nyata: node/edge dengan `verification_status` ambiguous/conflicting/superseded, `confidence_class` AMBIGUOUS/CONFLICTING, atau evidence dengan `bbox_quarantine_reason` (dari Target 4) — dikeluarkan dari `facts`/`relationships`/`citations`/`allowed_claims` (payload otoritatif ke Command Room), tapi tetap ada di `nodes`/`edges` mentah untuk audit.
- `allowed_claims`/`forbidden_claims` sekarang diturunkan sungguhan dari gerbang eligibility ini, bukan lagi diambil dari property node yang tidak pernah diisi siapa pun.
- `measurement_policy.py` diperluas: measurement ditolak kalau evidence-nya terkarantina, walau `verification_status` node-nya "confirmed".
- Mode `strict` vs `legacy_compatibility` untuk validasi typed-DEM v2 — sebelumnya validasi ini "best-effort audit saja, tidak pernah jadi hard gate". Sekarang ada flag env `DEM_TYPED_VALIDATION_MODE` eksplisit; default tetap `legacy_compatibility` (pilihan konservatif, didokumentasikan jelas bahwa ini TIDAK BOLEH jadi default permanen untuk ekstraksi baru).
- Test: 1 test eligibility gate baru + 1 test lama diperbarui ke perilaku baru yang benar, 1 test measurement policy, 2 test typed_observations mode, 1 test integrasi strict-mode quarantine di synthesis_task.

### Target 6 — Verifikasi akhir ❌ BELUM SELESAI

Lihat Bagian 1 di atas. Baru diagnosis, belum ada perbaikan kode.

---

## RINGKASAN STATUS AKHIR

| Target | Status | Commit |
|---|---|---|
| 1. Production durable worker | ✅ Selesai | `22c073ed` |
| 2. Identitas & otorisasi proyek | ✅ Selesai | `27496669` |
| 3. Provenance klaim per-item | ✅ Selesai | `53a0caf8` |
| 4. Versi ruang koordinat bbox | ✅ Selesai | `863b8b07` |
| 5. Karantina evidence & typed DEM | ✅ Selesai | `236520ab` |
| 6. Verifikasi akhir | ❌ Belum (baru diagnosis) | — |

**Aturan Emas** (AI/TypeScript tidak pernah menghitung angka) tidak dilanggar di target manapun — semua perubahan bersifat gating/klasifikasi/otorisasi, bukan kalkulasi.

**Tidak ada commit yang di-push ke `origin`** kecuali yang memang sudah ada sebelumnya (6 commit lokal, sesuai catatan git status). Tidak ada merge ke `main`. Tidak ada force-push/reset.

**Ready for independent final audit: NO** — Target 6 belum selesai, dan temuan awal saya menunjukkan 27 failure di services/db kemungkinan besar bukan satu bug sederhana, melainkan kumpulan test basi yang perlu ditinjau satu per satu. Melanjutkan Target 6 sampai tuntas adalah pekerjaan berikutnya yang jelas — belum bisa diklaim selesai.
