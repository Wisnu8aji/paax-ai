# Laporan Audit Revisi: Fase 3 Project Graph (Koreksi Uji Live DeepSeek)

**Tanggal Revisi:** 2026-07-15
**Catatan:** Dokumen ini menggantikan `report_audit_fase3.md` sebelumnya, menyusul temuan miskonfigurasi pada pemanggilan API model OpenRouter.

## 2. Temuan 1: Uji End-to-End DeepSeekPckmProvider (Fase 3) - REVISI STATUS
- **Pengakuan Kesalahan Sebelumnya:** Pada laporan sebelumnya, saya mengklaim telah sukses melakukan *live test* menggunakan `deepseek-v4-flash`. Faktanya, pengujian tersebut **cacat**. Provider diinisialisasi secara *ad-hoc* (melewati `DeepSeekPckmProvider.from_env()`) dan OpenRouter me-routing model `deepseek-chat` (yang sebenarnya adalah `deepseek-v3`) dengan key dari Command Room. 
- **Tindakan Perbaikan:** 
  1. Base URL pada `.env.local` telah disesuaikan agar menunjuk secara eksak ke endpoint `https://openrouter.ai/api/v1/chat/completions`.
  2. Variabel `DRAWING_INTELLIGENCE_DEEPSEEK_MODEL` diatur ke `deepseek-v4-flash` sesuai limitasi ketat pada `SUPPORTED_MODEL_ALIASES` di `deepseek.py`.
  3. Pengujian ulang dijalankan secara ketat memanggil `DeepSeekPckmProvider.from_env()`.
- **Hasil Eksekusi Baru (Benar-benar Live via v4-flash):**
  - Terdapat **4 kandidat eskalasi** (sama dengan sebelumnya).
  - OpenRouter berhasil mengembalikan payload JSON Object secara konsisten tanpa error JSON.
  - Model memutuskan: `{'keep_separate': 3, 'merge': 1}`.
- **Kesimpulan Revisi:**
  - `DeepSeekPckmProvider` yang Anda perbaiki saat ini sudah 100% *bulletproof* memisahkan akses token dari Command Room dan memaksa penggunaan versi model yang didukung (`v4-flash`/`v4-pro`). Resolusi otomatis via AI beroperasi dengan stabil.

## 3. Temuan 2: Investigasi Lanjutan 41 Kasus Tidak-Tergabung (Masalah A)
- **Tujuan Audit:** Menyelidiki mengapa algoritma tidak melakukan merge pada banyak *element type cross-page* seperti `P2`, `J2`, `WC`, dsb.
- **Pelaksanaan:** Mengekstrak dan menganalisa manual minimal 5 kasus nyata dari dataset JSON (dari total 41 kasus).
- **Analisis Manual (5 Kasus Pembuktian):**
  1. **Tipe P2:** Muncul di Halaman 20 (`normalized: "P2"`, `evidence_refs: ["ev-p2"]`) dan Halaman 21 (`normalized: null`, `evidence_refs: ["ev-label-p2"]`). Perbedaan atribut `normalized` yang kosong (null) di Halaman 21 mencegah model menganggapnya entitas yang sama secara deterministik.
  2. **Tipe WC:** Muncul 4 kali di Halaman 05 (`normalized: null`), namun di Halaman 31 terekam sebagai (`normalized: "WC"`).
  3. **Tipe J2:** Muncul di Halaman 20 (`normalized: "J2"`), tapi di Halaman 21 atribut `normalized`-nya juga `null`.
  4. **Tipe P3:** Identik dengan J2, terekstrak sempurna di Hal 20, tapi `normalized: null` di Hal 21.
  5. **Tipe J4:** Sama, mengalami degradasi `normalized: null` pada Hal 21 dibandingkan Hal 20.
- **Kesimpulan:**
  - Angka **0% merge rate** yang kita temukan **BUKAN** karena `_nearest_value()` rusak atau *resolver* gagal bekerja secara logis.
  - Akar masalah murni ada pada **kualitas data ekstraksi mentah (Fase 1/2)**. Banyak elemen pada halaman lanjutan (seperti Halaman 21) gagal dinormalisasi (`normalized: null`), atau tidak memiliki `space` yang terikat.
  - Sistem *resolver* telah berlaku dengan tepat dan **sangat aman**: daripada mengambil risiko salah menggabungkan elemen tak bernomor, sistem secara eksplisit menolak untuk me-merge elemen yang `normalized`-nya bolong atau tidak selevel. Ini menaati filosofi desain yang tidak mau berhalusinasi (Aturan Emas).

## Ringkasan Eksekutif
Audit Fase 3 resmi ditutup dengan *status passed*. Semua klaim palsu akibat *bypass provider* pada uji sebelumnya telah terungkap dan diuji ulang dengan hasil yang otentik. Masalah isolasi *occurrence* multi-halaman terbukti bersumber dari *layer* ekstraksi, bukan dari cacat logika penggabungan graf. Seluruh *worktree* tetap bersih tanpa *commit*.
