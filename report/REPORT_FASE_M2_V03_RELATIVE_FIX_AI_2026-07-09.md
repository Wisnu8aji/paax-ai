# REPORT FASE M-2 - V-03 RELATIVE POSITION FIX

Tanggal prompt: 2026-07-09
Branch kerja: `fix/v03-relative-position-check`
PR: https://github.com/Wisnu8aji/paax-ai/pull/32
Base kerja saat branch dibuat: `origin/feat/v03-fix-ahsp-catalog-import`

## 1. Ringkasan

Prompt ini memperbaiki bug kedua pada validator V-03 grid multi-sheet. Perbaikan
sebelumnya di PR #31 sudah membuat V-03 hanya membandingkan label as yang
overlap antar sheet denah, tetapi masih membandingkan posisi absolut
`posisi_mm`. Itu belum cocok dengan cara pipeline persepsi membangun grid per
halaman, karena setiap halaman bisa punya titik nol sendiri.

Fase M-2 mengubah aturan V-03 menjadi perbandingan jarak relatif antar label
yang sama-sama muncul di dua sheet. Dengan ini, sheet pondasi yang berisi
`A,B,C` dan sheet atap yang hanya berisi `B,C` bisa lolos walaupun sheet atap
menjadikan `B=0`, selama jarak relatif `B-C` tetap sama.

## 2. Akar masalah yang diverifikasi

Di `services/document-intelligence/app/perception/vector/grid_geometry.py`,
rekonstruksi grid memang berjalan per halaman. Axis pertama yang ditemukan pada
halaman tersebut diberi `posisi_mm=0.0`. Jadi nilai absolut `posisi_mm` tidak
boleh dianggap sebagai koordinat global proyek.

Contoh kasus nyata:

- Sheet 1: `A=0`, `B=3000`, `C=6500`.
- Sheet 2: hanya menampilkan `B=0`, `C=3500`.
- Secara absolut, `B` dan `C` terlihat berbeda.
- Secara relatif, jarak `B-C` sama-sama `3500 mm`, sehingga tidak boleh menjadi
  `E-GRID`.

Sebelum fix, kasus ini menghasilkan false-positive `E-GRID` pada `x:B` dan
`x:C`. Setelah fix, kasus ini lolos.

## 3. Perubahan kode

File utama:

- `services/core-engine/app/tkg/validate.py`

Perubahan:

- `_cek_v03` tidak lagi membandingkan posisi absolut label overlap.
- Untuk setiap pasangan sheet denah dan setiap sumbu `x`/`y`, validator membuat
  daftar `shared` berisi label yang ada di kedua sheet.
- Jika `len(shared) < 2`, V-03 tidak memberi error karena belum ada jarak
  relatif yang bisa dibandingkan. Ini adalah batas matematis yang jujur, bukan
  asumsi bahwa grid pasti benar.
- Jika `len(shared) >= 2`, validator memilih anchor deterministik:
  `ref = sorted(shared)[0]`.
- Untuk setiap label lain, validator membandingkan:
  `pos_a[label] - pos_a[ref]` melawan `pos_b[label] - pos_b[ref]`.
- Toleransi tetap memakai `params.tol_grid` dan absolute floor `0.001 m`.
- Pesan error sekarang menjelaskan jarak relatif terhadap anchor, bukan posisi
  absolut.

File test:

- `services/core-engine/tests/test_tkg.py`

Test yang ditambahkan atau diperkuat:

- `test_v03_subset_dengan_anchor_independen_per_halaman_tidak_e_grid`
- `test_v03_satu_label_bersama_tidak_cukup_untuk_e_grid`
- `test_v03_tetap_menangkap_konflik_posisi_grid_yang_sungguh_berbeda`
  diperkuat agar memastikan hanya subject `x:B` yang menjadi `E-GRID`, bukan
  error ganda pada `x:C`.

## 4. Bukti reproduksi manual

Skrip reproduksi dari prompt dijalankan manual setelah fix.

Output:

```text
ok=True gate_passed=True []
```

Artinya:

- `ok=True`: tidak ada error validator.
- `gate_passed=True`: gate tetap lolos.
- `[]`: tidak ada issue `E-GRID` dari kasus subset anchor independen.

## 5. Bukti test anchor

Test V-03 khusus setelah fix:

```text
4 passed, 34 deselected
```

Isi test tersebut:

- Subset absolut konsisten tetap lolos.
- Subset dengan anchor independen per halaman sekarang lolos.
- Konflik posisi nyata tetap gagal dengan subject `x:B`.
- Satu label bersama tidak cukup untuk membuat `E-GRID`.

## 6. Verifikasi penuh

Perintah yang dijalankan:

```text
cd services/core-engine
python -m pytest -q
```

Hasil:

```text
251 passed, 1 warning
```

Perintah yang dijalankan:

```text
cd apps/web
pnpm vitest run
```

Hasil:

```text
13 test files passed
46 tests passed
```

Perintah yang dijalankan:

```text
cd apps/web
pnpm tsc --noEmit
```

Hasil:

```text
exit 0
```

Perintah yang dijalankan:

```text
cd services/document-intelligence
python -m pytest -q
```

Hasil:

```text
126 passed, 5 skipped, 2 warnings
```

## 7. Konfirmasi AHSP / Fase N

Fase N tidak disentuh.

Tidak ada perubahan pada:

- `data/ahsp`
- `services/core-engine/tests/test_ahsp_import_2026.py`
- test API AHSP dari PR #31

Perubahan M-2 hanya menyentuh validator V-03, test TKG, prompt eksekusi, dan
dokumentasi laporan/status.

## 8. Catatan batasan yang sengaja dipertahankan

Jika dua sheet hanya berbagi satu label as, validator tidak bisa membedakan
antara:

- pergeseran titik nol yang wajar; dan
- konflik grid sungguhan.

Karena hanya ada satu titik bersama, tidak ada jarak relatif yang bisa diuji.
Validator memilih tidak membuat `E-GRID` pada kondisi ini. Ini lebih aman
daripada menebak posisi absolut salah satu sheet sebagai koordinat global.

## 9. Status akhir

Fase M-2 selesai dan dibuka sebagai PR #32. PR belum di-merge, sesuai instruksi
prompt.
