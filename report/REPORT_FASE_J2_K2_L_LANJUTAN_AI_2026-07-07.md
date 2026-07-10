# REPORT SAYA — Fase J-2/K-2/L Lanjutan

Prompt: `docs/prompts/PAAX_SAYA_PROMPT_FASE_J2_K2_L_LANJUTAN_2026-07-07.md`
Branch: `feat/rab-nav-validator-audit-ahsp-suggest`
Base branch: `origin/feat/gambar-generate-rab-wiring`
Alasan base: PR #29 (`feat/gambar-generate-rab-wiring`) masih open/belum merged saat pekerjaan ini dimulai.
PR: https://github.com/Wisnu8aji/paax-ai/pull/30

## Ringkasan

Fase J-2 selesai. Setelah user menekan **Kirim Volume ke Draft RAB** dan simpan berhasil, UI sekarang menampilkan tombol kedua **Lihat Draft RAB**. Tombol ini memakai `useRouter` dari `next/navigation` dan membuka `/proyek/[projectId]/rab`. Tidak ada auto-redirect mendadak, sehingga user tetap sempat membaca pesan sukses.

Fase K-2 selesai sebagai audit validator. V-02 dan V-04 terbukti tetap bekerja pada bentuk data pipeline baru (`zone`, `offset_tepi`, `alamat_list`, `alamat_needs_review`). V-03 ditemukan punya false-positive untuk kasus realistis multi-sheet: dua denah valid dengan cakupan grid berbeda/subset masih ditandai `E-GRID`.

Fase L tidak dikerjakan. Ini keputusan sengaja karena sifatnya opsional dan katalog AHSP repo masih hanya 4 item sample, sehingga auto-suggest bisa memberi kesan terlalu matang.

## Fase J-2 — Navigasi Draft RAB

File utama:
- `apps/web/src/components/drawings/tkg-workspace.tsx`
- `apps/web/src/components/drawings/tkg-workspace.test.tsx`

Perubahan:
- Import `useRouter` dari `next/navigation`.
- Tambah state `rabDraftPath` untuk menandai bahwa draft RAB sudah siap dibuka.
- Setelah `rabRepository.save(...)` sukses di `sendToRab`, path `/proyek/${projectId}/rab` disimpan.
- Tombol **Lihat Draft RAB** muncul hanya setelah kirim volume sukses.
- Tombol tersebut memanggil `router.push(rabDraftPath)`.
- State tombol di-reset saat user memulai analisis baru, mengganti file, membuang hasil, atau menjalankan ulang pipeline.

Test J-2:
- Test baru memock `next/navigation`.
- Setelah klik **Kirim Volume ke Draft RAB**, test memastikan tombol **Lihat Draft RAB** muncul.
- Setelah tombol diklik, test memastikan `router.push('/proyek/project-1/rab')` dipanggil.
- Siklus TDD sudah dibuktikan: test gagal dulu karena tombol belum ada, lalu hijau setelah implementasi.

## Fase K-2 — Audit Validator

File utama:
- `services/core-engine/tests/test_tkg.py`

Test baru:
- `test_v02_tetap_menandai_total_grid_salah_dengan_field_pipeline_baru`
- `test_v03_denah_subset_grid_pipeline_sah_tidak_menjadi_e_grid`
- `test_v04_orphan_tetap_warning_pada_pipeline_zone_offset`

Hasil audit:
- V-02 aman: total grid yang salah tetap menjadi `E-GRID`, meski fixture memakai field pipeline baru.
- V-04 aman: orphan instance/definition tetap warning (`W-TYP`, `W-DEF`), bukan error keras.
- V-03 bermasalah untuk subset grid sah. `validate_tkg` sekarang membandingkan fingerprint grid penuh antar semua sheet `denah`. Akibatnya, sheet yang hanya memuat subset grid valid dianggap konflik keras.

Status V-03:
- Test V-03 diberi `pytest.mark.xfail(strict=True)`.
- Logic validator **tidak diubah**, sesuai instruksi prompt.
- Perlu keputusan Saya/owner sebelum mengubah perilaku gate V-03.

## Fase L — AHSP Auto-Suggest

Tidak dikerjakan.

Alasan:
- Fase L bersifat opsional/stretch.
- Katalog AHSP nyata di repo masih `data/ahsp/cipta-karya.sample.json` dengan 4 item.
- Auto-suggest berpotensi menyesatkan user karena coverage katalog belum memadai.
- Jalur saat ini lebih aman: volume masuk Draft RAB, `ahsp_code` tetap kosong, user memilih AHSP manual.

## Dokumentasi

Diperbarui:
- `docs/ai-map/STATE.md`
- `docs/pages/gambar-kerja.md`
- `docs/plans/PAAX_GAMBAR_TEKNIK_SIPIL_BIG_PLAN_2026-07-05.md`

Isi pembaruan:
- Alur end-user sekarang menyebut tombol **Lihat Draft RAB**.
- Roadmap menambahkan status J-2 dan K-2.
- STATE mencatat temuan V-03 secara eksplisit dan alasan Fase L di-skip.

## Verifikasi

Web:
- `cd apps/web && pnpm vitest run`
- Hasil: **13 file test, 46 test passed**
- `cd apps/web && pnpm tsc --noEmit`
- Hasil: **exit 0**

Core Engine:
- `cd services/core-engine && python -m pytest -q`
- Hasil: **242 passed, 1 xfailed, 1 warning**
- Xfailed = temuan V-03 subset grid realistis.

Document Intelligence:
- `cd services/document-intelligence && python -m pytest -q`
- Hasil: **126 passed, 5 skipped, 2 warnings**

Browser:
- Next dev server + core-engine + document-intelligence dijalankan lokal untuk readiness.
- Playwright menjalankan flow UI:
  upload PDF → **Analisa Gambar Kerja** → **Simpan hasil analisis** → **Kirim Volume ke Draft RAB** → **Lihat Draft RAB**.
- Hasil: URL berpindah ke `http://localhost:3000/proyek/project-1/rab`.
- Draft RAB berisi row volume `1.25` dengan `ahsp_code: ""`.
- Input volume di halaman RAB menampilkan `1.25`.
- Server lokal yang dipakai verifikasi sudah dihentikan.

Catatan browser:
- Respons service untuk browser flow memakai intersep kontrak API agar fokus memverifikasi UI, navigasi, dan penyimpanan draft. Service backend tetap diverifikasi penuh lewat pytest terpisah.

## File Berubah

- `apps/web/src/components/drawings/tkg-workspace.tsx`
- `apps/web/src/components/drawings/tkg-workspace.test.tsx`
- `services/core-engine/tests/test_tkg.py`
- `docs/ai-map/STATE.md`
- `docs/pages/gambar-kerja.md`
- `docs/plans/PAAX_GAMBAR_TEKNIK_SIPIL_BIG_PLAN_2026-07-05.md`
- `docs/prompts/PAAX_SAYA_PROMPT_FASE_J2_K2_L_LANJUTAN_2026-07-07.md`
- `report/REPORT_FASE_J2_K2_L_LANJUTAN_SAYA_2026-07-07.md`
