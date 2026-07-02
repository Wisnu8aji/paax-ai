# Review Kritis Claude — Sesi PLHUT Codex (2026-07-03)

Menjawab `report/PROMPT_UNTUK_CLAUDE.md`. Semua temuan **sudah dieksekusi
perbaikannya** (bukan sekadar catatan). Guardrail akhir: **pytest 193 ·
schemas jest 11 + build · web tsc OK · vitest 30 · build produksi sukses**.

---

## 1. Breakdown temuan (pressure-test klaim Codex)

### 1.1 `usage_factor` bekisting — laporan ≠ kode, dan salah tempat secara arsitektur
- **Laporan Codex klaim** "volume m2 **dibagi** usage_factor". **Kode aslinya TIDAK membagi**
  (hanya anotasi formula). Kontradiksi report-vs-kode = temuan terberat: reviewer yang
  percaya laporan akan mengira kuantitas sudah dipotong.
- **Vonis domain**: kode yang benar, laporan yang salah. Kuantitas bekisting RAB = **luas
  kontak penuh** — upah pasang/bongkar terjadi TIAP pemakaian. Pakai-ulang memengaruhi
  **koefisien bahan / pemilihan varian AHSP**, bukan kuantitas. Membagi m² akan
  under-count upah di gedung 10 lantai (justru gagal scale-up).
- **Cacat arsitektur**: faktor dibaca dari `rec.dimensi` (TKG). TKG = transkrip gambar
  (INV-TKG-05); pakai-ulang = keputusan METODE → per brain §Z ini parameter `reuse_form`.
- **Perbaikan**: param `reuse_form` di `TakeoffParams` (validasi ≥1), helper
  `_faktor_pakai_ulang()` — sumber sah = param; `usage_factor` di dimensi masih dibaca
  (kompat) tapi mengeluarkan **warning INV-TKG-05**; terpakai → tercatat di
  `params_used` + assumption (kuantitas tetap kontak penuh, material ≈ A/u). Mirror Zod
  `usage_factor` + `reuse_form` ditambahkan (schema drift ditutup).

### 1.2 SMKK — struktur benar arah, eksekusi banyak cacat
- **rule_id "F-H01" SALAH TOTAL** — F-H01 = rumus upah HSP (Σ koef×harga), bukan SMKK.
  Jejak audit teracuni. → Diganti taxonomy **SMKK-01…SMKK-09** (komponen penerapan
  SMKK Permen PUPR No. 10/2021), diverifikasi terhadap RAB PLHUT asli.
- **Bug numerik personil**: unit "ob" tapi kuantitas = jumlah petugas saja. 1 petugas ×
  6 bulan harusnya **6 OB**, bukan 1. → Diperbaiki (petugas × durasi).
- **Asumsi diam-diam**: masker "box/pekerja/bulan" hanya di komentar kode — melanggar
  RULE-BOE. → Masker jadi opsional (`include_masker`, default False — TIDAK ada di RAB
  PLHUT asli), semua konvensi (APD 1 unit/pekerja, asuransi ls) tercatat di `assumptions`.
- **Item kurang** vs RAB PLHUT asli: P3K, rambu peringatan, traffic cone, kegiatan
  pengendalian risiko, sosialisasi per-orang. → Ditambahkan semua.
- **Tanpa validasi**: durasi 0 / pekerja 0 menghasilkan RAB kosong diam-diam. → Validator
  menolak input nonsens (422, bukan angka salah).

### 1.3 MEP Advanced — klaim needs_review fiktif + rule_id salah
- Laporan klaim "input tidak ada → needs_review", **logikanya tidak ada di kode**.
  → Ditambahkan: count/length ≤ 0 → item `needs_review` beralasan (jalur MEP wajib dari
  denah, bukan tebakan).
- **rule_id "F-G14" salah** (itu pengecatan besi/baja) → **F-G13** (MEP).
- Endpoint `/v1/takeoff/*` menyimpang dari konvensi seluruh API (tanpa prefix) →
  dinormalkan ke `/takeoff/mep-advanced` & `/takeoff/smkk`.

### 1.4 Anchor "PLHUT" — sintetis, bukan dari RAB
- Anchor Codex valid aritmetikanya (6.4 m³; 75.76 kg — dua-duanya saya verifikasi manual)
  tapi **bukan angka RAB PLHUT** (overclaim "berdasarkan RAB PLHUT"), plus field `version`
  yang tidak ada di skema (lolos diam-diam karena pydantic ignore).
- → Test diperkuat 2→**11**: anchor SMKK dari **struktur RAB PLHUT asli** (APD 15/jenis,
  personil 6 OB, P3K/rambu/cone), reuse_form (kuantitas TIDAK dibagi + warning INV-TKG-05
  + param invalid ditolak), MEP valid/invalid. Golden anchor kuantitas RAB penuh menunggu
  TKG PLHUT lengkap (gerbang F0 — jangan dipaksakan sekarang).

### 1.5 Future-proofing (Vision AI v1.0)
- `TkgDocument.generated_by` ("ai_proposal") + gerbang review UI sudah menampung jalur
  vision; `ManualTakeoffResult` cukup dgn `needs_review` terstruktur per baris. Kunci
  stabil triage `kode.work.rule_id` kini jadi kontrak identitas lintas-recompute.
  Yang HARUS dijaga: metode/parameter tak boleh menyusup ke TKG (kasus usage_factor) —
  sudah dipagari warning. Penambahan `source_ref`/confidence per baris = additive,
  tidak membentur jalan buntu.

## 2. Eksekusi Frontend & Data Layer

- **Task 9 Triage Review UI — SELESAI**: `components/review/triage-panel.tsx` baru +
  wiring TkgWorkspace. Alur: item needs_review → (a) **setor parameter** kurang
  (tinggi/n_ld/l_stock/reuse_form) → "Hitung Ulang (engine)"; (b) **Abaikan** dgn alasan
  wajib → tercatat ke **jejak audit engine** (`/review/corrections`) + persist lokal;
  (c) item yang hilang setelah recompute otomatis ditandai **terselesaikan**. UI murni
  presentasi — nol aritmetika (Aturan Emas).
- **Task 5 Data AHSP/Harga Surakarta — SELESAI**: `scripts/extract_harga_surakarta.py`
  (deterministik, reproducible) mengekstrak sheet "HARGA BAHAN" RAB PLHUT →
  `G:\paax-data\harga-satuan\surakarta.json` — **109 resource** (13 upah, 71 bahan,
  25 alat), sampel diverifikasi 1:1 vs sheet (Pekerja 90.800; PC 1.300/kg; sirtu
  140.000/m³; bata 400/bh). Loader auto-registrasi region via `PAAX_DATA_DIR` —
  region "Surakarta" langsung tersedia di RAB editor.
- **Task 8 RAB Editor & AHSP Browser — SUDAH ADA** (editor 635 baris: region dinamis,
  calculate/validate/S-curve/HSP modal; browser AHSP 190 baris). Gap sebenarnya adalah
  DATA harga (kini terisi). **Task 6/8 poles estetika premium** sengaja TIDAK dikerjakan
  di branch ini — sudah ter-antre sebagai sesi desain khusus
  (`Downloads/PAAX_PROMPT_DESAIN_LANJUTAN_2026-07-02.txt`) di atas PR #21;
  mengerjakannya di sini = konflik merge dua arah. Trade-off eksplisit: hindari
  double-work, satu sumber kebenaran estetika.
- Bonus: `pdf_routes.py` — cek ekstensi case-insensitive + anotasi return diperbaiki.

## 3. Filosofi arsitektur (ringkas)
1. **Kuantitas ≠ metode**: TKG menyimpan apa yang TERGAMBAR; parameter §Z menyimpan
   KEPUTUSAN. Sekali dicampur (usage_factor di dimensi), auditability & vision-readiness
   runtuh — maka dipagari di level kode, bukan konvensi.
2. **Gagal harus terlihat**: input nonsens ditolak (validator) atau di-review
   (needs_review) — tidak pernah jadi angka diam-diam.
3. **Jejak audit dua arah**: engine mencatat parameter yang DIPAKAI (params_used);
   manusia mencatat keputusan triage (corrections). RAB final bisa dipertanggungjawabkan
   per baris.

## 4. Status verifikasi
| Guardrail | Hasil |
|---|---|
| pytest core-engine | **193 passed** (11 anchor PLHUT baru) |
| schemas jest + build | 11 passed, build OK |
| web tsc + vitest + build | OK · **30 passed** · sukses |

Commit/PR: menunggu Codex — `docs/prompts/PAAX_CODEX_PROMPT_PLHUT_REVIEW.md`.
