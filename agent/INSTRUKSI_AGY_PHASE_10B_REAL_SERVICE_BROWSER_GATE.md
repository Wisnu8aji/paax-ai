# Instruksi AGY — Phase 10B Real Service and Browser Quality Gate

Gunakan **Gemini 3.6 Flash High Thinking** sebagai executor pada percakapan AGY
yang sama. Kerjakan hanya **Phase 10B / Task 2: Real service and browser quality
gate**. Jangan menjalankan Phase 10C atau Phase 11.

## Titik kerja

- Worktree: `G:\paax-ai-contextual-integration`
- Branch: `codex/contextual-intelligence-integration`
- Base commit:
  `d15a8d865c981bb4b84ebcd013c0fdbbd561eba3`
- Remote sebelum fase sama dengan base.
- Viewer/sheet source:
  `G:\paax-data\gambar kerja\gambar-kerja-arsitektur-gedung-a.pdf`
  (53 halaman).
- Quantity/project source: PLHUT PDF dan artifact DEM/PCKM 88 halaman yang sudah
  ada, hanya read-only; jangan menjalankan ulang ekstraksi/transkripsi mentah.
- Feedback matrix Phase 10A:
  `scripts/quality/feedback1_matrix.json`.

## Aturan wajib

1. Baca penuh `AGENTS.md`, aturan Root–AGY, aturan khusus Phase 11, plan
   audit/E2E/PR handoff, dan feedback Phase 10A.
2. Gunakan Graphify lebih dahulu.
3. Gunakan TDD: simpan baseline E2E merah untuk acceptance condition yang belum
   tersedia, lalu implementasikan sampai hijau.
4. Gunakan empat service nyata:
   - Web `3000`;
   - Core Engine `8000`;
   - DB/project API `8001`;
   - Document Intelligence `8002`.
5. Browser proof dilarang memakai Playwright route interception, fake server,
   mock workspace, demo/sample fallback, atau response yang dikarang.
6. Core Engine menjadi satu-satunya otoritas angka final.
7. Jangan menggunakan provider AI atau API key dalam Phase 10B.
8. Jangan merge ke `main`, membuka PR final, memulai Phase 10C, atau membuka
   Phase 11.

## Scope plan

Implementasikan:

- Create `scripts/live_test/start_feedback1_stack.ps1`
- Create `apps/web/e2e/feedback1-real-stack.spec.ts`
- Create `apps/web/e2e/feedback1-visual-checklist.md`
- Modify root `package.json` bila perlu
- Modify `apps/web/package.json` bila perlu

Reuse stack management Phase 09E jika benar, tetapi Phase 10B launcher harus
fail-closed, menyimpan PID task-local, health-check keempat service, dan tidak
menganggap stack siap sebelum endpoint data nyata terverifikasi.

## Acceptance browser dan service

### A. Viewer/sheet PDF 53 halaman

- Buktikan PDF yang ditampilkan adalah file sumber 53 halaman dengan identity
  dan hash aktual.
- Buktikan original PDF transport mendukung response range/header yang benar;
  jangan menyimpulkan dari screenshot.
- Buktikan navigator berisi 53 halaman dalam urutan sumber, tidak hilang atau
  diduplikasi.
- Buktikan tiga sheet views/navigasi yang diminta bekerja dengan data sheet
  aktual.
- Buktikan klasifikasi sheet dan source-page navigation memakai endpoint/state
  nyata.

### B. Viewer visual quality

Pada viewport desktop `1440x900` dan mobile `390x844`, periksa dan simpan bukti:

- initial render;
- thumbnail/navigation;
- zoom pada teks kecil, garis tipis, dimensi, dan simbol;
- perpindahan halaman/sheet;
- tidak ada blur atau kompresi destruktif;
- page identity tetap sama setelah zoom/switch;
- loading, empty, retry, dan error state tidak menghasilkan fake success.

Checklist harus menyebut bukti screenshot, trace, zoom/viewport, PDF identity,
response headers, dan hasil inspeksi visual; checklist tanpa artifact bukan
PASS.

### C. PLHUT/quantity/review/handoff

Gunakan artifact PLHUT DEM/PCKM yang sudah ada secara read-only:

- inventory kandidat lossless berdasarkan artifact aktual;
- quantity/capability classification yang membedakan `supported`, `ready`,
  `blocked`, dan `needs_review`;
- formula-free UI source labels;
- review reason dan source evidence navigation;
- manual correction/approval state;
- individual dan bulk selection;
- handoff rejection dan approval yang divalidasi ulang server-side;
- actual local Core Engine calculation response;
- angka final hanya tampil setelah verified Core Engine receipt;
- stale/mismatched project, snapshot, evidence, unit, dimension, fingerprint,
  atau receipt ditolak.

### D. Network dan console evidence

- Simpan bukti request/response nyata ke Web proxy, DB API, Document
  Intelligence, dan Core Engine.
- Tidak boleh ada Playwright interception pada final proof.
- Fail bila service yang wajib tidak menerima request.
- Fail pada uncaught console error, unhandled rejection, unexpected 4xx/5xx,
  atau response yang berasal dari mock/demo endpoint.

## Test dan gate

1. Tulis baseline test merah dan catat alasan yang benar.
2. Tambahkan package commands:
   - `test:e2e:feedback1`;
   - `test:visual:feedback1`.
3. Jalankan focused backend/frontend tests yang disentuh.
4. Jalankan real-stack E2E desktop dan mobile.
5. Jalankan visual checklist dengan artifact aktual.
6. Jalankan `npx tsc --noEmit`.
7. Jalankan Next production build.
8. Jalankan `graphify update .`.
9. Jalankan `git diff --check`.
10. Scan staged files untuk secret, SQLite/runtime DB, `.env`, logs, PID files,
    traces atau generated artifact yang tidak seharusnya di-commit.
11. Hentikan hanya proses fase ini dan pastikan port 3000/8000/8001/8002 bebas.

## Update matrix

Update evidence Phase 10A hanya untuk requirement yang benar-benar terbukti
Phase 10B. P2-P8 dan P59-P61 tidak boleh berstatus selesai jika browser/service
gate terkait gagal. Jangan mengubah `pending` menjadi PASS berdasarkan
screenshot saja.

## Commit dan feedback

Jika seluruh acceptance terpenuhi:

1. commit scoped implementation dengan pesan
   `test(di): verify Feedback 1 in real browser`;
2. push branch remote yang sama;
3. tulis
   `G:\paax-ai-contextual-integration\PHASE_10B_REAL_SERVICE_BROWSER_FEEDBACK.md`;
4. commit feedback terpisah bila diperlukan;
5. rekonsiliasi local HEAD/remote dan bedakan implementation/feedback commit.

Feedback final wajib memuat:

```text
PHASE:
STATUS:
MODEL:
WORKTREE:
BRANCH:
BASE COMMIT:
IMPLEMENTATION COMMIT:
FEEDBACK COMMIT:
POST-FEEDBACK HEAD/REMOTE:
RED TEST EVIDENCE:
GREEN TEST EVIDENCE:
REAL-STACK SERVICE EVIDENCE:
53-PAGE PDF EVIDENCE:
88-PAGE ARTIFACT EVIDENCE:
VIEWER IMAGE-QUALITY EVIDENCE:
NETWORK/CONSOLE EVIDENCE:
CORE ENGINE AUTHORITY EVIDENCE:
REVIEW/HANDOFF EVIDENCE:
TYPECHECK/BUILD EVIDENCE:
MATRIX UPDATES:
SECURITY/SECRET SCAN:
PROCESS CLEANUP:
REMAINING CONCERNS:
NEXT RECOMMENDED ACTION:
QUOTA STATUS:
```

Gunakan `DONE` hanya jika semua bukti nyata tersedia. Jika ada gate gagal,
gunakan `CHANGES_REQUIRED`; jika sumber eksternal benar-benar tidak tersedia,
gunakan `BLOCKED`. Hentikan setelah feedback dan jangan memulai Phase 10C.
