# Instruksi AGY — Phase 09E Correction Round 1 Recovery 03:03

Gunakan **Gemini 3.6 Flash High Thinking** sebagai executor. Ini adalah
kelanjutan percakapan dan pekerjaan Phase 09E Correction Round 1 yang sama,
bukan fase baru.

## Titik kerja yang wajib dipertahankan

- Worktree: `G:\paax-ai-contextual-integration`
- Branch: `codex/contextual-intelligence-integration`
- Base/HEAD terverifikasi sebelum recovery: `c6cc6c6a`
- Remote sebelum recovery:
  `origin/codex/contextual-intelligence-integration` juga `c6cc6c6a`
- Phase 09E initial delivery pada `c6cc6c6a` berstatus
  **CHANGES_REQUIRED**.
- Phase 11 dilarang dijalankan.

Pekerjaan parsial berikut sudah ada dan belum di-commit:

- `scripts/live_test/fixtures/plhut/project-manifest.json`
- `scripts/live_test/preflight_real_stack.py`
- `scripts/live_test/run_bootstrap.py`
- `scripts/live_test/seed_plhut_real.py`
- `services/db/portable.sqlite`

Audit pekerjaan parsial tersebut terlebih dahulu. Pertahankan bagian yang benar,
perbaiki yang belum selesai, dan jangan menghapus atau mengulang secara buta.
`services/db/portable.sqlite` tidak boleh di-commit apabila hanya merupakan
runtime database/artifact lokal.

## Alasan correction round

Phase 09E initial delivery belum diterima karena bukti browser sebelumnya hanya
menjalankan Core Engine dan Web. Belum ada bukti final bahwa browser memakai
stack nyata yang mencakup DB/project API dan Document Intelligence dengan data
proyek nyata. Screenshot atau UI yang tampak benar tidak cukup bila transport,
state, atau data masih berasal dari mock, fixture-only, interception, atau
fallback produksi.

## Tujuan

Tutup hanya sisa Phase 09E dengan membuktikan alur web nyata end-to-end:

1. real Web;
2. real Core Engine;
3. real DB/project API;
4. real Document Intelligence;
5. data PLHUT/proyek yang benar-benar diproses dan dapat dilacak;
6. viewer, klasifikasi sheet, quantity/capability, review, selection, dan
   server-side handoff menggunakan state/service nyata.

Engine deterministik tetap menjadi satu-satunya otoritas angka quantity final.
AI/frontend tidak boleh menghitung atau mengarang angka final.

## Urutan kerja

1. Baca penuh:
   - `G:\paax-ai-main\AGENTS.md`;
   - `G:\paax-ai-main\agent\ATURAN_KERJA_ROOT_AGY_DAN_MONITOR_SLEEP.md`;
   - `G:\paax-ai-main\agent\ATURAN_KHUSUS_RECOVERY_0303_DAN_PHASE_11_FINAL_ACCEPTANCE.md`;
   - Super Big Plan dan plan Phase 09E yang relevan.
2. Gunakan Graphify terlebih dahulu sebelum membaca source secara luas.
3. Rekonsiliasi HEAD, remote, status Git, dan pekerjaan parsial. Jangan
   menyentuh perubahan user yang tidak terkait.
4. Lanjutkan dengan TDD: buat atau perbaiki regression test yang membuktikan
   kekurangan real-stack sebelum mengubah implementasi.
5. Pastikan bootstrap/preflight/seed bersifat fail-closed:
   - tidak mengklaim sukses bila DB atau Document Intelligence tidak hidup;
   - tidak mengganti kegagalan dengan mock/demo/sample/synthetic production
     data;
   - tidak memalsukan project/package/run/snapshot;
   - tidak menyembunyikan page-count, hash, provenance, unit, atau blocked
     reason yang tidak cocok.
6. Jalankan stack nyata pada port yang sesuai:
   - Web `3000`;
   - Core Engine `8000`;
   - DB/project API `8001`;
   - Document Intelligence `8002`.
7. Gunakan data proyek nyata yang tersedia. Identitas dokumen, jumlah halaman,
   hash, package/run/snapshot, dan coverage harus berasal dari artifact aktual,
   bukan angka yang diasumsikan.
8. Jalankan browser E2E desktop dan mobile tanpa Playwright route interception
   sebagai bukti final. Buktikan melalui network/service evidence bahwa UI
   benar-benar memanggil endpoint DB dan Document Intelligence yang nyata,
   selain Web dan Core Engine.
9. Verifikasi minimal:
   - pemilihan project/package nyata;
   - viewer dan source-page navigation;
   - urutan dan klasifikasi sheet;
   - quantity/capability state;
   - review/blocked/manual correction state;
   - individual dan bulk selection;
   - server-side handoff revalidation;
   - quantity authoritative hanya setelah verified Core Engine receipt;
   - stale/mismatched context/receipt ditolak;
   - tidak ada uncaught console error atau fake success.
10. Jalankan suite relevan, typecheck, build, dan test browser yang diwajibkan.
    Jangan mengurangi suite hanya agar hijau.
11. Bersihkan hanya proses yang dibuat fase ini. Setelah selesai, pastikan port
    `3000`, `8000`, `8001`, dan `8002` bebas.
12. Jalankan `graphify update .` setelah perubahan source, kemudian
    `git diff --check`.

## Batas scope

- Jangan memulai Phase 10 atau Phase 11.
- Jangan melakukan live drawing-to-JSON extraction besar.
- Jangan mengubah rumus inti RAB/HSP atau membiarkan LLM/TypeScript menghitung.
- Jangan menambahkan API key ke source, log, artifact, screenshot, atau commit.
- Jangan merge ke `main`.
- Jangan menyamarkan test fixture sebagai bukti real-stack.

## Commit dan feedback

Jika seluruh acceptance criteria Phase 09E Correction Round 1 benar-benar
terpenuhi:

1. commit hanya perubahan terkait pada branch yang sama;
2. push ke
   `origin/codex/contextual-intelligence-integration`;
3. rekonsiliasi local HEAD dan remote SHA;
4. tulis feedback final di:
   `G:\paax-ai-contextual-integration\PHASE_09E_CORRECTION_ROUND_1_FEEDBACK.md`.

Feedback final wajib mengikuti kontrak:

```text
PHASE:
STATUS:
MODEL:
WORKTREE:
BRANCH:
BASE COMMIT:
FINAL COMMIT:
REMOTE RECONCILIATION:
IMPLEMENTED:
TEST EVIDENCE:
TYPECHECK/BUILD EVIDENCE:
BROWSER EVIDENCE:
REAL-DATA EVIDENCE:
SECURITY/SECRET SCAN:
PROCESS CLEANUP:
REMAINING CONCERNS:
NEXT RECOMMENDED ACTION:
QUOTA STATUS:
```

Gunakan `DONE` hanya jika real DB + Document Intelligence + Core Engine + Web
dan data nyata terbukti. Jika ada defect dalam scope, gunakan
`CHANGES_REQUIRED`. Jika kebutuhan eksternal benar-benar tidak tersedia,
gunakan `BLOCKED`. Jika model terkena quota, hentikan dengan
`QUOTA_EXHAUSTED`, sertakan pesan quota dan waktu reset persis, jangan mengarang
PASS.
