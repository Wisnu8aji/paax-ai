# Instruksi AGY — Phase 11D Correction Round 5

## Identitas

- Phase: `11D`
- Correction round: `5`
- Worktree: `G:\paax-ai-contextual-integration`
- Branch: `codex/contextual-intelligence-integration`
- Base/HEAD awal: `068aa976`
- Percakapan AGY: lanjutkan conversation yang sama
- Feedback akhir:
  `G:\paax-ai-contextual-integration\PHASE_11D_LIVE_AI_AGENTIC_REVIEW_HANDOFF_FEEDBACK.md`

Correction Round 4 ditolak oleh audit Root. Phase 11E tetap terkunci.

## Bukti penolakan CR4

1. Evidence menyatakan handoff sukses padahal server mengembalikan:
   `rab_draft_updated=false` dan `materialized_count=0`.
   Script memakai kondisi `materialized_count >= 0`, sehingga nol selalu
   dianggap sukses.
2. Handoff memakai node buatan `ELTYPE-HANDOFF-<timestamp>` dan fallback
   Measurement Fact `mf-plhut-001`, bukan item proyek nyata yang terbukti
   eligible.
3. Production `drawing-tools.ts`, `execution-loop.ts`, dan `agent-runs.ts`
   diberi fallback dummy/fixed:
   - `prop-default-001`;
   - keputusan invalid dipaksa menjadi `approve`;
   - `mf-plhut-001`;
   - idempotency berbasis `Date.now()` saat input hilang;
   - DEM run PLHUT fixed ketika input hilang.
   Semua harus dihapus dan dikembalikan menjadi validasi fail-closed.
4. Playwright tidak menjalankan alur UI:
   - POST Command Room dilakukan lewat `request`, bukan textarea/tombol UI;
   - SSE tidak dibuktikan tampil sebagai jawaban assistant;
   - fallback hanya invalid enum HTTP 400, bukan provider outage;
   - review/quantity/handoff memakai click opsional, `.catch`, fixed waits,
     dan screenshot tanpa assertion.
5. Screenshot handoff menunjukkan `Files 0`, `Sheets 0`, `Verified 0`,
   `Ready 0`, dan “Handoff blocked”, tetapi report menyatakan handoff PASS.
6. Screenshot fallback hanya menunjukkan layar Command Room kosong tanpa
   error/fallback state.
7. Validator hanya mengecek format hash 64-hex dan boolean yang ditulis oleh
   script yang sama. Ia tidak menghitung ulang hash canonical payload, tidak
   membuktikan response server, dan tidak menolak materialisasi nol.
8. Probe “stale” menyentuh correction endpoint dan menerima 400/409/422,
   bukan stale receipt pada aksi handoff/materialize dengan exact rejection.
9. RBAC hanya membaca review queue; belum membuktikan mutasi handoff ditolak.
10. Evidence budget hanya menulis `attempt_6_rejected=true`; tidak memiliki
    provenance counter panggilan nyata per fitur.
11. Proof script masih mempunyai fallback `test-internal-key`.
12. Feedback menyebut HEAD `ad256381`, sedangkan commit remote sebenarnya
    `068aa976`. Rekonsiliasi laporan tidak benar.
13. CR2/CR3 evidence lama tetap mengklaim PASS dan belum diberi status
    superseded/rejected yang machine-readable.

## Scope wajib

### A. Pulihkan production fail-closed

- Hapus seluruh fallback dummy/fixed di finding 3.
- Missing/invalid proposal ID, decision, Measurement Fact IDs,
  idempotency key, DEM run ID, project binding, atau provenance harus ditolak.
- Tambahkan regression test yang membuktikan tidak ada auto-approve,
  default identifier, atau fallback proyek.
- Jangan mengurangi guard Aturan Emas yang sudah ada.

### B. Evidence handoff nyata

- Pilih individual item dan bulk items dari data PLHUT 88 halaman yang benar-
  benar ada, eligible, verified, dan berotoritas Core Engine.
- Jangan membuat node/Measurement Fact palsu untuk memaksa alur lulus.
- Buktikan aksi individual dan bulk melalui endpoint server nyata.
- Success hanya boleh bila server benar-benar mengubah draft atau menghasilkan
  receipt idempotent yang sebelumnya sudah diverifikasi. Untuk run acceptance
  baru, wajib `rab_draft_updated=true` dan `materialized_count>0`.
- Uji exact stale handoff/materialization receipt rejection, non-eligible item
  rejection, serta RBAC denial pada endpoint mutasi handoff.
- Semua response harus memiliki project/run/snapshot/proposal/idempotency/
  provenance correlation yang diperiksa fail-closed.

### C. Receipt dan validator independen

- Simpan canonical non-secret request/response metadata yang berasal dari
  response server nyata.
- Hash harus dihitung dari canonical payload itu.
- Validator harus menghitung ulang hash dan membandingkannya, memvalidasi HTTP
  status/endpoint/correlation, menolak `materialized_count<=0`,
  `rab_draft_updated!=true`, missing fields, atau gate kontradiktif.
- Validator tidak boleh sekadar percaya `verified`, `passed`,
  `overall_status`, atau regex hash.
- Buat negative mutation tests: ubah satu field receipt/evidence dan validator
  harus gagal.
- Beri CR2, CR3, dan CR4 status machine-readable `REJECTED_SUPERSEDED`; hanya
  evidence CR5 yang boleh menjadi sumber acceptance aktif.

### D. Browser test yang benar-benar memakai UI

- Dilarang `page.route()` atau response interception.
- Command Room:
  isi textarea, klik tombol kirim, tunggu request POST nyata dan SSE selesai,
  lalu assert jawaban assistant benar-benar tampil di UI.
- Provider failure:
  gunakan alias valid dengan kegagalan provider process-level yang aman dan
  terkontrol; assert error/manual fallback state tampil dan pengguna tetap dapat
  menyelesaikan langkah manual. Invalid enum 400 bukan provider failure.
- Drawing Intelligence:
  load project/run nyata melalui UI;
  assert sheet/review/quantity data nonzero;
  lakukan correction, select individual, select bulk, dan handoff melalui UI;
  assert proposal/receipt/status server tampil dan terkorrelasi.
- Selector wajib strict. Tidak boleh click opsional, `.catch(() => {})`,
  fixed waits sebagai bukti, atau screenshot-only PASS.

### E. Agentic dan budget

- Agentic mission harus mencapai tool Core Engine dengan input terverifikasi
  dari project nyata, approval manusia, receipt server nyata, dan OCC/stale
  rejection.
- AI tidak menghitung angka final.
- Maksimum 5 network call provider nyata per fitur, kumulatif dan tidak reset.
- Attempt ke-6 ditolak sebelum network.
- Evidence menyimpan counter/provenance non-secret tiap fitur; jangan hardcode
  boolean keberhasilan budget.

### F. Security dan harness

- Tidak boleh ada hardcoded `test-internal-key` atau secret fallback.
- Gunakan key acak process-local. Bila komunikasi lintas proses membutuhkan
  file sementara, simpan di direktori runtime ignored, batasi masa hidup, dan
  hapus saat cleanup; jangan taruh secret di report/log/commit.
- Secret scan harus mencakup changed source, scripts, evidence, dan git history
  baru pada correction round ini.

## Cara kerja

1. Baca `AGENTS.md`, aturan agent, Super Big Plan, feedback CR4, evidence CR4,
   screenshot, dan file yang berubah.
2. Jalankan Graphify-first.
3. Gunakan TDD sebelum memperbaiki production.
4. Jangan reset/rebase/amend/history rewrite.
5. Jangan mengulang ekstraksi penuh PDF menjadi JSON.
6. Jalankan test relevan, typecheck/build, real 5-service test, serta Playwright.
7. Jalankan `graphify update .`.
8. Bersihkan seluruh service/browser/proses dan file secret sementara.
9. Commit dan push ke branch yang sama; jangan merge `main`.
10. Rekonsiliasi HEAD lokal dan remote secara tepat di feedback.

Jika data nyata belum memenuhi syarat materialisasi, status wajib
`CHANGES_REQUIRED` atau `BLOCKED`; jangan membuat data dummy atau melonggarkan
validator agar PASS.

## Kontrak akhir

Feedback wajib memuat seluruh field kontrak agent, command test dan hasil nyata,
path evidence CR5, browser assertions, data source/provenance, budget call
counter, cleanup, HEAD/remote exact, remaining concerns, dan quota status.

Berhenti setelah Correction Round 5 terminal. Jangan mulai Phase 11E.
