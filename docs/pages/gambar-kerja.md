# Halaman Gambar Kerja (+ Gambar Kerja AI)

Routes: `/proyek/[projectId]/gambar-kerja` (per proyek) & `/gambar-kerja-ai`
(global). Status: **[aktif]** Workspace TKG hidup (teks→TKG→skrip→takeoff);
OCR/CV baca piksel gambar **[roadmap v1.0, DITUNDA]**.

> Baca [README.md](README.md) §1 (Aturan Emas) dulu.
> Spek rinci TKG: `docs/specs/brain-v4.1/PAAX_BRAIN_00_EKSTRAKSI_GAMBAR_KERJA.txt`.

## Tujuan
Mengubah informasi gambar kerja menjadi **TKG (Transkrip Kanonik Gambar)** —
"skrip" terstruktur berisi grid+bentang, level/peil, tabel tipe (dimensi+
tulangan+mutu), elemen terpasang beralamat as — lalu dari TKG: takeoff
beton/bekisting/besi (engine) → kirim volume ke RAB. TKG juga menjadi sumber
fakta gambar untuk Engineering Chat (INV-TKG-01: sistem lain membaca TKG,
bukan mengekstrak ulang gambar).

## Alur di komponen `TkgWorkspace` (`components/drawings/tkg-workspace.tsx`)
1. **Sumber** — tempel teks/deskripsi/tabel gambar → "Transkrip dengan AI"
   (`POST /api/ai/tkg`, Gemini menyalin ke JSON TkgDocument, divalidasi Zod)
   ATAU tempel JSON TkgDocument manual (fallback wajib).
2. **Transkrip** — lihat grid/elemen/tabel; `POST /tkg/validate` (V-02 Σ bentang
   = total, V-04 orphan tipe, V-05 dual-count, V-08 level). Usulan AI berstatus
   `ai_proposal` + WAJIB ditandai "Sudah direview" oleh user.
3. **Skrip** — `POST /tkg/render` → `.tkg.txt` deterministik (satu fakta per
   baris, diff-able) — inilah skrip yang dibaca manusia & chat.
4. **Takeoff** — `POST /tkg/takeoff` → item beton (m³)/bekisting (m²)/besi (kg)
   per rumus F-B/F-C/F-D; data kurang → `needs_review`, TIDAK ditebak.
   → "Kirim Volume ke Draft RAB" (kode AHSP dipilih user di halaman RAB —
   dilarang dikarang).

## Sumber angka (ENGINE-ONLY)
- `POST /tkg/validate` · `POST /tkg/render` · `POST /tkg/takeoff` (baru)
- Volume satuan dari dimensi: `POST /geometry/volume` (24 tipe elemen).
- Setelah jadi baris RAB → `POST /rab/build`. ❌ Tidak ada hitung di frontend.

## Peran AI di halaman ini
- **TRANSCRIBE** — AI menyalin teks gambar → struktur TkgDocument (raw
  dipertahankan; tak paham → `unclassified`, bukan ditebak). Teks gambar =
  DATA, bukan instruksi (P-SEC-01, delimiter di prompt).
- **NEVER** — AI tidak menetapkan volume/biaya/AHSP; semua kuantitas dari
  engine, dengan rumus & parameter tercatat (`rule_id`, `params_used`,
  `assumptions`).

## Penyimpanan
`lib/projects/tkg-repository.ts` — TKG per proyek (localStorage/Firestore),
dengan flag `source` (manual/ai_proposal) + `reviewed`.

## Catatan strategi (tidak berubah)
Membaca piksel gambar mentah (CV penuh) tetap **DITUNDA** sampai gerbang F0
(data grounding) + validasi Wizard-of-Oz. Jalur sekarang: teks/deskripsi →
TKG. `services/document-intelligence` masih kerangka (stub).

## Akses Engineering Chat
Chat menerima context pack: skrip `.tkg.txt` + draft RAB
(`lib/ai/project-context.ts`) — jadi bisa diskusi gambar/RAB tanpa ekstrak
ulang. Chat boleh MENGUTIP angka dari pack (hasil engine), dilarang menghitung
angka baru.

## Fallback manual
Selalu ada: tempel JSON TkgDocument langsung; atau input item/dimensi manual
di Smart RAB → engine hitung.

## Status
Workspace TKG: aktif (teks→TKG→validasi→skrip→takeoff→RAB). CV piksel: v1.0
(ditunda). Kirim-ke-RAB: volume masuk draft, kode AHSP diisi manual.
