# Halaman Pengaturan

Route: `/pengaturan`. Status: **[sebagian]**.

> Baca [README.md](README.md) §1 (Aturan Emas) dulu.

## Tujuan
Pengaturan akun, proyek, parameter default perhitungan, dan integrasi AI.

## Data yang ditampilkan / dikontrol
- Default parameter engine: `ppn_rate`, `overhead_override` (BUK%),
  `rounding_mode` (`exact`/`rounddown_int`), wilayah harga aktif.
- Profil, peran/RBAC, preferensi tampilan.
- Status integrasi AI (provider model aktif).

## Sumber angka (ENGINE-ONLY)
Parameter di sini hanya **input** ke engine; perhitungan tetap di engine.
Mengubah BUK%/PPN/rounding mengubah hasil engine, bukan dihitung frontend.

## Peran AI & keamanan kunci (PENTING)
- **API key model (Gemini, dll) TIDAK disimpan di repo.** Disimpan sebagai env
  server-side (`apps/web/.env.local`, gitignored) / secret manager — JANGAN
  `NEXT_PUBLIC`, jangan dikirim ke browser. Lihat CLAUDE.md §7.
- Jika key bocor (mis. terkirim di chat) → rotate/buat ulang.
- Key Gemini AI Studio normalnya diawali `AIza...`. Verifikasi sumbernya
  (https://aistudio.google.com/apikey).

## Akses Engineering Chat
Pengaturan default (BUK%/PPN/wilayah) memengaruhi hasil tool chat (recompute).

## Fallback manual
Semua pengaturan punya nilai default aman; app jalan tanpa key AI (mode
rule-based / tanpa narasi).

## Status
Sebagian. Slot konfigurasi provider AI menyusul wiring Gemini (v0.8).
