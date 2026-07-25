# Halaman Site Agent

Route: `/proyek/[projectId]/site-agent`. Status: **[roadmap v2.0]**.

> Baca [README.md](README.md) §1 (Aturan Emas) dulu.

## Tujuan
Pelaporan progres lapangan: foto, % progres, deviasi rencana vs realisasi.

## Data yang ditampilkan
Laporan progres, foto lapangan, deviasi terhadap Kurva S rencana.

## Sumber angka (ENGINE-ONLY)
Deviasi dihitung dengan membandingkan realisasi vs rencana engine
(`/schedule/s-curve`). ❌ Frontend tidak menghitung deviasi sendiri.

## Peran AI di halaman ini
- **EXPLAIN / lapor** — analisa foto progres, deteksi deviasi, ringkasan
  harian. AI **tidak menggantikan verifikasi manusia**.
- **NEVER** — AI tidak menetapkan % progres final tanpa konfirmasi manusia;
  tidak mengarang angka deviasi.

## Akses Engineering Chat
READ laporan & warning lapangan untuk reasoning lintas-data (mis. dampak
keterlambatan ke jadwal/biaya — angka tetap dari engine).

## Fallback manual
PM input progres manual; engine hitung deviasi. Tanpa AI tetap jalan.

## Status
Roadmap v2.0 (setelah fondasi & chat matang).
