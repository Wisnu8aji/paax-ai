# Report Saya — Fase J/K Generate RAB Wiring

Prompt: `docs/prompts/PAAX_SAYA_PROMPT_FASE_J_GENERATE_RAB_WIRING_2026-07-06.md`

Branch: `feat/gambar-generate-rab-wiring`

PR: https://github.com/Wisnu8aji/paax-ai/pull/29

## Ringkasan

Fase J selesai. Tombol placeholder disabled "Generate RAB" di Review Gambar dihapus. Setelah user menekan "Simpan hasil analisis", aplikasi sekarang otomatis menjalankan validasi TKG, render TKG, dan takeoff engine. Jika ada item takeoff yang sudah siap, tombol "Kirim Volume ke Draft RAB" muncul tanpa reload.

Fase K selesai sebagai coverage validator. Validator core-engine sudah dites ulang terhadap field pipeline baru: `SheetMeta.zone`, `ElementInstance.alamat_list`, `alamat_needs_review`, dan notasi offset seperti `B-offset_sebelum_1`.

Fase L tidak dikerjakan karena optional dan mapping AHSP otomatis masih berisiko menutupi fakta bahwa katalog AHSP lokal masih kecil. Keputusan aman: volume masuk Draft RAB, kode AHSP tetap kosong untuk dipilih user.

## Perubahan Utama

1. `apps/web/src/components/drawings/tkg-workspace.tsx`
   - `usePerceptionAsTranscript` sekarang memanggil `runPipeline(next)` setelah menyimpan hasil Review Gambar.
   - Copy status diperbarui agar menjelaskan bahwa validasi dan hitung volume berjalan otomatis.
   - `statusText` memprioritaskan hasil takeoff agar tidak lagi menampilkan pesan "belum masuk transkrip" setelah pipeline selesai.
   - Placeholder disabled "Generate RAB" dihapus.
   - `sendToRab`, `TriagePanel`, dan format `RabDraftLine` tidak diubah.

2. `apps/web/src/components/drawings/tkg-workspace.test.tsx`
   - Test upload PDF memastikan "Simpan hasil analisis" memanggil `validateTkg`, `renderTkg`, dan `takeoffTkg`.
   - Test Draft RAB memastikan volume siap masuk ke `rabRepository.save` dengan `ahsp_code: ""`.
   - Test jalur teks "Proses dengan AI" memastikan pipeline lama tetap berjalan.
   - Test memastikan placeholder "Generate RAB" lama tidak dirender.

3. `services/core-engine/tests/test_tkg.py`
   - Test baru memastikan field `zone`, `alamat_list`, `alamat_needs_review`, dan offset tidak membuat warning palsu.
   - Test baru memastikan mismatch `count_simbol` vs `count_label` tetap tertangkap sebagai `W-CNT`.

4. Dokumentasi
   - `docs/ai-map/STATE.md` diperbarui dengan status Fase J/K.
   - `docs/pages/gambar-kerja.md` diperbarui: wiring RAB sekarang aktif untuk volume siap pakai.
   - `docs/plans/PAAX_GAMBAR_TEKNIK_SIPIL_BIG_PLAN_2026-07-05.md` diperbarui: tahap berikutnya adalah mapping AHSP otomatis, bukan wiring volume.

## Verifikasi

- Web targeted: `pnpm vitest run src/components/drawings/tkg-workspace.test.tsx` → 8/8 passed.
- Web full: `pnpm vitest run` → 45/45 passed.
- TypeScript: `pnpm tsc --noEmit` → passed.
- Core Engine: `python -m pytest -q` → 240/240 passed.
- Document Intelligence: `python -m pytest -q` → 126 passed, 5 skipped.
- Browser headless Chrome:
  - Upload PDF sintetis.
  - Klik "Analisa Gambar Kerja".
  - Review Gambar tampil.
  - Klik "Simpan hasil analisis".
  - Triage Review dan "Kirim Volume ke Draft RAB" muncul tanpa reload.
  - Klik kirim volume.
  - Draft RAB tersimpan dengan `volume: 1.25`, `ahsp_code: ""`, `duration_days: null`.
  - Buka `/proyek/paax-e2e-rab/rab`.
  - Row RAB menampilkan volume `1.25` dan pilihan AHSP masih kosong.

## Temuan Jujur

- PDF sintetis fixture real document-intelligence saat ini dapat menghasilkan item `needs_review` bila definisi tabel dan instance tidak cocok. Itu perilaku benar, bukan bug UI.
- Browser e2e menggunakan fixture backend deterministik untuk memastikan ada satu item siap kirim dan satu item perlu review, karena tujuan verifikasi browser adalah memastikan wiring UI → Draft RAB berjalan.
- AHSP auto-suggest belum diaktifkan. Ini sengaja agar aplikasi tidak mengarang mapping AHSP dari katalog kecil.
