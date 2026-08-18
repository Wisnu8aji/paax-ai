# Instruksi Manual — Phase 06 Correction and Closure

> Kirim seluruh isi file ini kepada Antigravity menggunakan **Claude Sonnet 4.6
> (Thinking)**. Jangan kirim instruksi Phase 07 sebelum feedback akhir Phase 06
> diterima dan seluruh exit gate dinyatakan lulus.

## Peran dan hasil yang wajib dicapai

Anda adalah implementor dan verifier Phase 06 PAAX. Selesaikan koreksi yang sudah
berada sebagian di working tree, buktikan perilakunya menggunakan data nyata,
lalu tutup Phase 06 secara jujur. Jangan memulai Phase 07.

Worktree tunggal:

```text
G:\paax-ai-contextual-integration
```

Branch tunggal:

```text
codex/contextual-intelligence-integration
```

Kondisi awal yang harus dipertahankan:

- HEAD awal `36e7f981` (`feat(di): expose universal sheet navigation`);
- branch satu commit di depan remote;
- terdapat 18 file termodifikasi yang memuat pekerjaan koreksi parsial;
- terdapat direktori artefak runtime untracked;
- jangan menganggap satu pun perubahan parsial sudah benar sebelum diverifikasi.

## Dokumen yang wajib dibaca sebelum mengubah apa pun

1. `G:\paax-ai-main\AGENTS.md`
2. `docs\superpowers\specs\2026-07-26-drawing-intelligence-feedback-remediation-design.md`
3. `docs\superpowers\plans\2026-07-26-di-sheet-classification-indexing.md`
4. `.superpowers\sdd\2026-07-26-di-sheet-classification-indexing\task-3-brief.md`
5. `.superpowers\sdd\2026-07-26-di-sheet-classification-indexing\task-3-review.md`
6. `.superpowers\sdd\2026-07-26-di-sheet-classification-indexing\phase-06-correction-resume-prompt.md`

Gunakan `graphify query` sebagai langkah navigasi kode pertama. Setelah itu
periksa `git status`, `git diff`, dan bukti test yang benar-benar tersedia.

## Larangan keras

- Jangan reset, restore, checkout file, rebase, amend, discard, atau menimpa
  pekerjaan parsial.
- Jangan pindah ke `G:\paax-ai-main` atau
  `G:\paax-ai-feedback1-remediation` untuk implementasi.
- Jangan menggunakan data dummy, mock production, static response, thumbnail
  sintetis, assertion kondisional, test yang di-skip, atau angka buatan.
- Jangan memasukkan API key atau secret ke kode, fixture, log, screenshot,
  laporan, commit, maupun terminal output.
- Jangan menghitung quantity/RAB/BoQ/schedule di TypeScript atau LLM.
- Jangan mengubah source order atau page number PDF.
- Jangan menjalankan Phase 07.
- Jangan merge ke `main`.

## Tahap 0 — Audit dan amankan scope

1. Inventarisasi tepat 18 perubahan awal dan pisahkan:
   - koreksi Phase 06 yang dibutuhkan;
   - perubahan test/runtime pendukung yang dibutuhkan;
   - debug sementara atau perubahan yang tidak relevan.
2. Jangan menghapus perubahan yang tampak tidak relevan sebelum membuktikan
   origin dan dependensinya.
3. Periksa seluruh proses Chrome Headless, Playwright, Next.js, dan service lama.
   Hentikan hanya proses yang terbukti dibuat oleh pekerjaan Phase 06 ini.
4. Jangan memasukkan `services/document-intelligence/.artifacts/` ke commit.
   Gunakan artefak itu hanya bila provenance-nya jelas dan dibutuhkan untuk
   pengujian.

## Tahap 1 — Security blocker wajib diperbaiki terlebih dahulu

Audit menemukan regression berikut di working tree:

```text
INTERNAL_SERVICE_KEY fallback menjadi "live-test-key"
X-User-Id fallback menjadi "paax-test"
```

Perbaiki dengan ketentuan:

1. Production dan mode non-test harus **fail closed** bila internal key tidak
   tersedia. Tidak boleh ada hardcoded live/test key sebagai fallback global.
2. Nilai test hanya boleh datang dari konfigurasi test yang eksplisit dan tidak
   boleh aktif pada production/runtime normal.
3. E2E mendapatkan internal key melalui environment proses test, bukan dari
   literal production.
4. Jangan mengubah atau menampilkan nilai secret yang sudah ada.
5. Tambahkan/pertahankan regression test yang membuktikan:
   - missing key non-test tidak meneruskan request secara terbuka;
   - test configuration tetap bisa berjalan secara eksplisit;
   - header user tidak menyamar sebagai test actor pada production.

Phase 06 otomatis `BLOCKED` bila security ini belum lulus.

## Tahap 2 — Tutup tiga temuan CHANGES_REQUIRED

### A. Filter multi-axis nyata

Pastikan navigator index-backed menyediakan kontrol accessible untuk:

- `view`;
- `revision`;
- `zone`;
- `status`.

Syarat:

- pilihan berasal hanya dari `DrawingPackageIndex` tervalidasi;
- unknown tetap explicit;
- masing-masing filter dapat bekerja sendiri;
- kombinasi filter menggunakan deterministic intersection;
- clear-all mengembalikan hasil penuh;
- mode/filter/search tidak memicu refetch index;
- tidak ada option hardcoded khusus proyek.

### B. Search pada primary index-backed path

Search harus mencakup:

- `sheet_code`;
- `sheet_title`;
- `page_number`;
- `level.value`;
- `classification.value`;
- `view.value`;
- `revision.value`;
- `zone.value`.

Search harus bisa digabungkan dengan semua filter dan tidak melakukan network
refetch. Pertahankan fallback legacy hanya jika masih benar-benar dipakai dan
tidak merusak index-backed path.

### C. Browser evidence non-vacuous untuk fixture asli 53 halaman

Gunakan hanya:

```text
G:\paax-data\gambar kerja\gambar-kerja-arsitektur-gedung-a.pdf
```

Fixture ini berbeda dari PLHUT 88 halaman. Jangan menjalankan ulang
transcription/extraction/AI terhadap PLHUT.

Playwright real-stack harus membuktikan:

1. Original order menampilkan tepat **53 page identity unik**.
2. Identitas 53 halaman berasal dari response backend/index fixture nyata,
   bukan array sintetis pada test.
3. Page number mengikuti source order API secara tepat.
4. View/revision/zone/status controls terlihat dan dapat digunakan.
5. Combined filters dan search menghasilkan intersection yang benar.
6. Clear-all memulihkan hasil.
7. Pergantian mode/filter/search tidak melakukan index refetch.
8. Viewer tidak meminta semua 53 thumbnail secara eager.
9. Tidak ada `pageerror`, unhandled rejection, atau runtime TypeError.
10. Tidak ada assertion dalam blok `if`, silent skip, `count > 0` guard, atau
    success yang tetap hijau ketika navigator/index kosong.

Jangan memakai synthetic/mocked backend sebagai bukti final browser. Bila
service atau fixture nyata tidak bisa dijalankan, laporkan `BLOCKED` dengan
penyebabnya.

## Tahap 3 — Verifikasi berlapis

Jalankan sekurang-kurangnya:

1. Focused Vitest navigator/index/search.
2. Semua Phase 06 navigator/index tests.
3. Focused Next proxy security tests.
4. Focused document-intelligence tests untuk index route, `run_id`, zone
   parsing, dan auth.
5. Focused DB tests bila schema/response DB tetap berubah.
6. `pnpm --filter @paax/web exec tsc --noEmit`.
7. Playwright real-stack pada fixture 53 halaman.
8. `git diff --check`.
9. Source scan untuk memastikan tidak ada secret, production dummy, debug log,
   atau generated runtime artifact yang akan di-commit.

Catat command, exit code, jumlah pass/fail, waktu, serta lokasi trace/screenshot
dan response log. Jangan menggunakan commit message lama sebagai bukti test.

Setelah perubahan kode selesai, jalankan:

```text
graphify update .
```

## Tahap 4 — Commit, PR gate, dan stop

Jika semua gate hijau:

1. Buat satu commit koreksi terfokus:

   ```text
   fix(di): close Phase 06 navigator audit findings
   ```

2. Jangan masukkan `.artifacts`, secret, log service mentah, atau file di luar
   scope.
3. Push branch yang sama dan buka/update draft PR untuk owner + Claude review.
4. Jangan merge ke `main`.
5. Berhenti setelah feedback akhir ditulis.

Jika repo/review workflow pada branch ini sudah mempunyai draft PR, update PR
yang sama; jangan membuat PR duplikat.

## Exit gate Phase 06

Status hanya boleh `PASS` bila seluruh syarat berikut terpenuhi:

- security fail-closed dipulihkan dan diuji;
- tiga temuan review tertutup;
- original order membuktikan 53 halaman autentik;
- Vitest dan typecheck hijau;
- backend/proxy focused tests hijau;
- Playwright real-stack hijau dan non-vacuous;
- proses runtime dibersihkan;
- commit koreksi ada;
- branch/PR review gate tersedia;
- tidak ada concern severity High/Medium yang terbuka.

Selain itu gunakan `CHANGES_REQUIRED`, `BLOCKED`, atau `QUOTA_EXHAUSTED`.

## File feedback wajib

Buat:

```text
G:\paax-ai-contextual-integration\.superpowers\sdd\2026-07-26-di-sheet-classification-indexing\task-3-fix-r2-final-feedback.md
```

Isi wajib:

```text
PHASE: 06
STATUS:
WORKTREE:
BRANCH:
STARTING HEAD:
FINAL COMMIT(S):
SECURITY EVIDENCE:
FILTER EVIDENCE:
SEARCH EVIDENCE:
53-PAGE AUTHENTICITY EVIDENCE:
UNIT/INTEGRATION TEST EVIDENCE:
TYPECHECK EVIDENCE:
BROWSER EVIDENCE:
PROCESS CLEANUP:
GRAPHIFY UPDATE:
PR/PUSH STATUS:
REMAINING CONCERNS:
NEXT RECOMMENDED ACTION:
QUOTA STATUS:
```

Terminal response harus mengulang seluruh isi feedback tersebut. Jangan
memulai Phase 07, meskipun Phase 06 `PASS`.
