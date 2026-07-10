# PROMPT SAYA / SAYA — Wiring UI Tanpa Redesign

Tanggal: 2026-07-07  
Repo: `G:\paax-ai-main`  
Mode kerja: perbaiki wiring frontend ke backend tanpa merombak UI.

## Tujuan

Tugas ini hanya untuk menyambungkan fitur backend yang sudah ada tetapi belum tampil/berfungsi benar di frontend.

Jangan merombak desain dashboard. Jangan mengubah arah visual. Jangan mengembalikan dashboard lama.

UI utama PAAX sekarang adalah **Fable Premium Redesign**.

Dokumen pegangan wajib:

`G:\paax-ai-main\docs\plans\PAAX_UI_UTAMA_FABLE_PREMIUM_2026-07-07.md`

## Aturan Paling Penting

1. UI dasar dan utama adalah Fable Premium Redesign.
2. Shell aktif wajib tetap memakai:
   - `apps/web/src/components/app-shell/side-rail.tsx`
   - `apps/web/src/app/(dashboard)/layout.tsx`
   - `apps/web/src/app/(dashboard)/command-room/page.tsx`
3. Jangan membuat ulang atau mengaktifkan file lama:
   - `apps/web/src/components/app-shell/icon-rail.tsx`
   - `apps/web/src/components/app-shell/nav-panel.tsx`
   - `apps/web/src/components/app-shell/sidebar.tsx`
4. Jangan mengganti layout Fable menjadi layout lama.
5. Jangan mengganti styling besar di `globals.css` kecuali sangat kecil dan jelas perlu untuk bug wiring.
6. Jangan mengubah visual premium Fable: sidebar, command room, dashboard cards, topbar, spacing, warna, animasi, dan struktur utama harus tetap.
7. Jangan menambahkan `Co-Authored-By: Saya` atau signature sejenis.

## Masalah Yang Harus Dikerjakan

Sebelumnya ada pekerjaan backend/wiring yang berguna, tetapi sebagian belum tersambung rapi ke frontend karena pengerjaan sempat merombak UI.

Sekarang lakukan ulang dengan pendekatan benar:

- Backend/data wiring boleh diperbaiki.
- UI Fable tidak boleh diganti.
- Kalau perlu menambahkan state/loading/error, ikuti gaya komponen Fable yang sudah ada.
- Kalau perlu tombol/menu baru, tempatkan di struktur Fable yang sudah ada, bukan membuat shell baru.

## Area Yang Boleh Disentuh

Sentuh hanya jika memang perlu untuk wiring:

- `apps/web/src/lib/projects/*`
- `apps/web/src/lib/chat/*`
- `apps/web/src/app/(dashboard)/command-room/page.tsx`
- `apps/web/src/app/(dashboard)/dashboard/page.tsx`
- `apps/web/src/app/(dashboard)/proyek/**`
- `apps/web/src/app/(dashboard)/files/**`
- `apps/web/src/app/(dashboard)/laporan/**`
- `apps/web/src/app/(dashboard)/database-ahsp/**`
- komponen kecil yang sudah dipakai oleh halaman-halaman di atas

## Area Yang Tidak Boleh Dirombak

Jangan rombak file berikut kecuali hanya perbaikan kecil yang terbukti perlu:

- `apps/web/src/components/app-shell/side-rail.tsx`
- `apps/web/src/app/(dashboard)/layout.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/src/components/app-shell/topbar.tsx`
- `apps/web/src/components/theme/theme-provider.tsx`

Jika file-file ini harus disentuh, jelaskan alasan spesifik di report.

## Backend/Wiring Yang Perlu Dicek

Cek apakah frontend sudah memakai koneksi yang benar untuk:

1. Project list/create/update/delete.
2. Project detail.
3. RAB draft per project.
4. TKG / gambar kerja per project.
5. Engineering Chat / Command Room.
6. Laporan pagi.
7. Site Agent jika route frontendnya sudah ada.
8. AI orchestrator jika service/endpoint tersedia.

Jangan memaksakan service yang belum berjalan. Jika service belum tersedia, tampilkan error/loading yang jelas tanpa merusak UI.

## Cara Kerja

1. Baca dulu dokumen kanonik UI Fable:
   `docs/plans/PAAX_UI_UTAMA_FABLE_PREMIUM_2026-07-07.md`
2. Cek status Git.
3. Cari wiring backend yang sudah ada di repo.
4. Cocokkan backend yang ada dengan halaman frontend yang perlu menampilkan data.
5. Lakukan perubahan kecil dan terarah.
6. Jangan menghapus UI Fable.
7. Jangan membuat shell baru.
8. Jangan mengaktifkan dashboard lama.
9. Setelah selesai, jalankan verifikasi.

## Verifikasi Wajib

Jalankan:

```powershell
pnpm --filter @paax/web exec tsc --noEmit
pnpm --filter @paax/web test
```

Jika memungkinkan, cek HTTP:

```powershell
Invoke-WebRequest -Uri http://localhost:3000/dashboard -UseBasicParsing
Invoke-WebRequest -Uri http://localhost:3000/command-room -UseBasicParsing
```

Pastikan:

- `/dashboard` tetap memakai Fable premium.
- `/command-room` tetap ada dan bisa dibuka.
- Tidak ada import ke `icon-rail`, `nav-panel`, atau `sidebar`.
- Tidak ada file shell lama yang dibuat ulang.

## Output Yang Diminta

Buat report singkat di folder:

`G:\paax-ai-main\report\remote`

Isi report:

1. File yang diubah.
2. Wiring backend apa yang diperbaiki.
3. UI Fable bagian mana yang dipertahankan.
4. Verifikasi yang dijalankan dan hasilnya.
5. Jika ada service backend yang belum berjalan, tulis jelas service apa dan port berapa.

## Batasan Commit

Jangan commit jika belum diminta owner.

Jika nanti owner meminta commit:

- Commit message harus ringkas.
- Jangan pakai `Co-Authored-By: Saya`.
- Jangan tulis signature tool lain.

## Definisi Selesai

Task dianggap selesai hanya jika:

- Wiring frontend yang ditargetkan sudah diperbaiki.
- UI Fable premium tetap menjadi tampilan utama.
- Dashboard lama tidak muncul kembali.
- Typecheck lulus.
- Test web lulus.
- Report dibuat di `report\remote`.
