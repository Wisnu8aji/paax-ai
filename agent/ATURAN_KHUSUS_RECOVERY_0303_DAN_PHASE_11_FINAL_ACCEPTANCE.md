# Aturan Khusus Recovery 03:03 dan Phase 11 Final Acceptance

Versi: 2026-07-30  
Status: aturan recovery berlaku satu kali; aturan Phase 11 berlaku saat seluruh
fase sebelumnya selesai.

Dokumen ini menyimpan instruksi langsung pemilik proyek untuk:

1. recovery Antigravity satu kali pada alarm 03:03 WIB; dan
2. audit penerimaan seluruh sistem PAAX setelah semua fase Super Big Plan selesai.

Dokumen ini melengkapi `AGENTS.md`,
`agent/ATURAN_KERJA_ROOT_AGY_DAN_MONITOR_SLEEP.md`, dan seluruh plan di
`docs/superpowers/plans/`. Aturan Emas PAAX tetap berlaku.

## 1. Aturan recovery satu kali pada 03:03 WIB

Aturan bagian ini hanya berlaku untuk alarm **2026-07-30 pukul 03:03 WIB**.
Setelah recovery ini mencapai hasil terminal, aturan permanen kembali mengikuti
`agent/ATURAN_KERJA_ROOT_AGY_DAN_MONITOR_SLEEP.md`.

### 1.1 Urutan recovery

1. Pada 03:03 WIB, periksa bahwa tidak ada executor AGY lain yang aktif.
2. Buka/jalankan Antigravity dan lanjutkan percakapan yang sedang digunakan
   untuk Phase 09E Correction Round 1.
3. Gunakan Gemini 3.6 Flash High Thinking terlebih dahulu.
4. Jika Gemini dapat bekerja, biarkan proses berjalan sampai feedback final,
   quota, atau error terminal.
5. Jika Gemini terkena quota ketika sedang bekerja, pindah ke Sonnet 4.6
   Thinking dalam percakapan yang sama dan lanjutkan hanya pekerjaan tersisa.
6. Jika Sonnet juga terkena quota:
   - hentikan proses AGY secara bersih;
   - jangan membuat alarm pada kejadian pertama ini;
   - pastikan tidak ada proses/port milik AGY atau service fase yang tertinggal.
7. Buka kembali AGY dengan percakapan yang sama dan coba lanjutkan sekali.
8. Jika percakapan yang sama masih error:
   - tutup AGY secara bersih;
   - verifikasi proses dan port bersih;
   - buka AGY dengan percakapan baru satu kali;
   - kirim titik fase, worktree, branch, commit terakhir, acceptance criteria,
     partial-work warning, dan instruksi agar pekerjaan tidak diulang buta.
9. Jika pada percakapan baru quota muncul kembali:
   - kumpulkan seluruh waktu reset model yang terlihat;
   - pilih reset terdekat yang maksimal 5 jam;
   - pasang satu alarm tepat 2 menit setelah reset tersebut.
10. Jika tidak ada reset maksimal 5 jam:
    - tutup seluruh sesi AGY;
    - hentikan seluruh executor;
    - bersihkan proses dan port;
    - laporkan Phase 09E masih belum selesai tanpa membuat klaim PASS.

### 1.2 Perlakuan error non-quota

- Authentication/login timeout adalah error global AGY, bukan quota model.
- Error session/conversation terlebih dahulu dicoba melalui sesi yang sama.
- Percakapan baru hanya boleh dibuat pada langkah 8 di atas.
- Tidak boleh mengganti error autentikasi menjadi laporan quota palsu.
- Tidak boleh membuka dua sesi executor secara paralel.

### 1.3 Kebersihan proses

Setiap penutupan AGY wajib:

- mengidentifikasi proses berdasarkan PID, command line, start time, dan
  worktree;
- menghentikan hanya proses yang dibuat recovery/fase ini;
- memastikan port 3000, 8000, 8001, dan 8002 bebas bila dipakai fase;
- tidak menghentikan proses user atau service lain yang tidak terkait;
- mencatat apakah proses dapat dipulihkan atau harus dimulai ulang.

## 2. Gerbang aktivasi Phase 11

Phase 11 bernama:

> **Final Whole-System Acceptance: Super Big Plan + Feedback 1 + AI**

Phase 11 hanya boleh dijalankan jika:

- seluruh Phase 04C, 05, 06, 07, 08, 09A, 09B, 09C, 09D, 09E, dan 10 sudah
  berstatus selesai berdasarkan feedback final;
- tidak ada correction round yang masih berjalan;
- seluruh commit fase telah direkonsiliasi dengan remote branch;
- seluruh blocker yang mencegah fungsi utama telah diselesaikan;
- owner belum memerintahkan penghentian;
- worktree dan branch final telah ditentukan.

Jika satu fase sebelumnya belum selesai, Phase 11 dilarang berjalan.

## 3. Tujuan Phase 11

Phase 11 bukan fase penambahan fitur. Tujuannya:

1. mengaudit ulang seluruh Super Big Plan;
2. mengaudit setiap feedback di `G:\REVISI\feedback 1.docx`;
3. menjalankan seluruh fitur utama PAAX melalui web dan service nyata;
4. membuktikan engine, AI-assist, agentic system, review, quantity, dan handoff
   bekerja bersama;
5. membuktikan tidak ada dummy production data, fake success, atau angka final
   buatan AI/frontend;
6. menghasilkan keputusan akhir `PASS`, `CHANGES_REQUIRED`, atau `BLOCKED`
   berdasarkan bukti aktual.

## 4. Aturan secret dan live AI

Pemilik memberikan otorisasi terbatas untuk final testing:

- gunakan API key Drawing Intelligence yang sudah berada di `.env.local`;
- gunakan key hanya melalui environment proses lokal;
- jangan membaca nilainya ke terminal, chat, screenshot, report, atau artifact;
- jangan menyalin key ke source, test, fixture, command argument, atau commit;
- pastikan `.env.local` tetap tidak terlacak Git;
- gunakan model **DeepSeek V4 Flash** untuk live AI final testing;
- sebelum panggilan, verifikasi model ID/alias yang benar dari konfigurasi
  provider yang tersedia;
- jika DeepSeek V4 Flash tidak tersedia, jangan mengganti diam-diam ke model
  lain; laporkan `BLOCKED`;
- maksimal **15 live provider calls per fitur AI**;
- setiap fitur memiliki counter terpisah dan fail-closed pada panggilan ke-16;
- panggilan retry, timeout, dan provider error tetap dihitung;
- hentikan fitur tersebut lebih awal jika acceptance sudah terbukti atau pola
  kegagalan sudah jelas;
- jangan menampilkan secret pada request/response ledger.

Batas 15 per fitur ini berlaku untuk Phase 11 final testing. Batas ini tidak
secara otomatis mengubah runtime cap internal yang telah diimplementasikan pada
fase sebelumnya.

## 5. Pengecualian live AI

Jangan menjalankan fitur ekstraksi gambar kerja mentah menjadi JSON pada Phase
11 karena ukuran dan biaya proses terlalu besar.

Pengecualian ini hanya berlaku pada eksekusi ekstraksi mentah. Phase 11 tetap
wajib mengaudit:

- kontrak dan test offline ekstraksi;
- artifact DEM/PCKM yang sudah ada;
- provenance, page count, hash, dan lossless coverage artifact;
- downstream sheet classification, evidence, review, quantity, dan handoff.

## 6. Inventaris wajib Super Big Plan

Phase 11 harus membuat matriks yang menghubungkan setiap fase dengan
requirement, implementasi, commit, test otomatis, bukti browser, bukti
service/API, status, limitation, dan tindak lanjut bila gagal.

Minimal mencakup:

1. viewer PDF, range request, lazy loading, cache/tile lifecycle, dan performa;
2. kualitas gambar asli, zoom, ketajaman teks/garis, dan tidak ada kompresi
   destruktif;
3. sheet navigator, urutan halaman, multi-axis classification, filter, dan
   source-page navigation;
4. klasifikasi sheet, level, view, revision, zone, status, dan disiplin;
5. DEM/PCKM/consolidated candidate inventory tanpa halaman hilang;
6. klasifikasi quantity/capability per domain;
7. fakta ukuran, unit/dimensi, evidence lineage, conflict, dan review status;
8. typed request/response, verified receipt, request fingerprint, dan Core
   Engine authority;
9. quantity final, unit, provenance, stale-context rejection, dan no frontend
   calculation;
10. AI-assist fallback, deterministic validation, audit ledger, approval manusia,
    dan manual fallback;
11. agentic runner, state transition, tool scope, idempotency, budget, retry,
    approval, dan recovery;
12. review queue, correction/rejection/approval, evidence navigation, dan audit
    trail;
13. coverage, blocked reason, eligible selection, bulk selection, RBAC, dan
    server-side handoff revalidation;
14. no production mock/dummy/sample fallback;
15. security fail-closed, secret isolation, schema parity, dan Command Room;
16. desktop/mobile accessibility, console/network errors, dan process cleanup.

## 7. Audit Feedback 1

Gunakan `G:\REVISI\feedback 1.docx` sebagai sumber utama.

Wajib:

- baca seluruh paragraf dan tabel;
- pertahankan mapping P2-P62 yang sudah direncanakan;
- tambahkan requirement yang tidak masuk rentang tersebut jika ditemukan;
- beri setiap feedback satu status dan bukti;
- larang status PASS jika test atau bukti browser gagal;
- cek ulang Word setelah seluruh test selesai untuk memastikan tidak ada
  feedback yang terlewat;
- bedakan `selesai`, `sebagian`, `blocked`, dan `tidak relevan` secara jujur.

## 8. Pengujian web seluruh fitur

Gunakan real local stack dan data nyata. Fake transport boleh dipakai untuk unit
test, tetapi tidak boleh menjadi bukti akhir.

Wajib menguji:

- login/auth dan RBAC yang relevan;
- pemilihan proyek dan package nyata;
- viewer desktop dan mobile;
- tidak ada gambar yang terkompresi/menurun kualitasnya;
- navigator dan klasifikasi sheet;
- review queue dan source-page navigation;
- klasifikasi quantity/capability;
- quantity authoritative dari Core Engine;
- blocked/review/needs-input states;
- manual correction dan approval;
- AI-assist;
- agentic mission dan tool execution;
- individual/bulk selection;
- handoff server-side;
- retry/error/empty/loading states;
- tidak ada mock/demo/synthetic production data;
- tidak ada uncaught console error;
- request menuju endpoint nyata tanpa Playwright interception untuk final proof.

Untuk kualitas gambar, simpan PDF hash, page identity, viewport, zoom level,
screenshot asli, response headers/range, ukuran raster/tile, serta pemeriksaan
visual garis tipis, teks kecil, dimensi, dan simbol.

## 9. Pengujian seluruh fitur AI

Graphify seluruh AI entrypoint terlebih dahulu dan buat inventaris dinamis agar
tidak ada fitur AI yang terlewat.

Minimal mencakup:

- Drawing Intelligence AI-assist classification/binding;
- ambiguity resolution dan deterministic validation;
- level/view/discipline classification bantuan AI;
- review suggestion dan explanation;
- Command Room routing dan fallback;
- agentic planning, tool selection, approval, retry, budget, dan audit;
- manual fallback ketika AI gagal;
- provider timeout, malformed output, hallucination rejection, dan quota;
- DeepSeek V4 Flash live response quality;
- no numeric authority: AI tidak pernah menulis angka final.

Untuk setiap fitur:

- siapkan kasus valid, ambigu, invalid, provider-error, dan fallback;
- gunakan maksimal 15 live calls;
- catat model, feature, case, attempt, latency, token/cost jika tersedia,
  deterministic validation, outcome, dan reason;
- jangan catat key;
- angka final harus diverifikasi berasal dari Core Engine.

## 10. Bukti engine dan klasifikasi

Phase 11 wajib membuktikan:

- sheet benar-benar terklasifikasi dari data nyata;
- quantity/capability benar-benar terklasifikasi;
- supported tidak disamakan dengan ready;
- blocked reason benar;
- item dengan konflik tidak mendapat authority;
- angka final hanya muncul setelah verified Core Engine receipt;
- unit dan dimensi sesuai;
- project, snapshot, work item, evidence, endpoint, contract, dan request
  fingerprint cocok;
- stale/mismatched receipt ditolak;
- agent tidak dapat melewati engine atau approval;
- review memperbarui input terstruktur, bukan angka final.

## 11. Suite dan gate minimum

Jalankan:

- offline Feedback 1 matrix;
- full Document Intelligence pytest;
- full Core Engine pytest dan manual anchors;
- DB/project API tests;
- AI orchestrator/agentic tests;
- schema Zod/Pydantic parity tests dan build;
- full relevant web Vitest;
- `tsc --noEmit`;
- Next production build;
- real-stack Playwright desktop/mobile;
- viewer performance/heap/long-task gate;
- no-dummy/import/bundle scan;
- secret/security/RBAC scan;
- Graphify update;
- `git diff --check`;
- process/port cleanup.

Tidak boleh mengurangi suite hanya agar PASS.

## 12. Hasil akhir

Artifact minimum:

- matriks seluruh fase Super Big Plan;
- matriks Feedback 1;
- inventaris seluruh fitur AI;
- live-call ledger per fitur dengan jumlah 0-15;
- laporan viewer/image-quality;
- laporan sheet dan quantity classification;
- laporan Core Engine authority;
- laporan agentic/review/handoff;
- raw Playwright traces, screenshots, network logs, dan test results;
- daftar blocker/limitation;
- exact commit dan remote reconciliation;
- draft PR untuk owner + Claude review.

Keputusan akhir:

- `PASS`: seluruh gerbang wajib hijau dan tidak ada feedback material terlewat;
- `CHANGES_REQUIRED`: ada defect yang dapat diperbaiki dalam scope;
- `BLOCKED`: kebutuhan eksternal nyata tidak tersedia;
- dilarang merge langsung ke `main`.
