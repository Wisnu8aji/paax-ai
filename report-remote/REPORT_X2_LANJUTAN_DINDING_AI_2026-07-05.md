# REPORT FASE X2 LANJUTAN — SLICE #3: DINDING PASANGAN BATA (DIKERJAKAN LANGSUNG OLEH SAYA)

Tanggal eksekusi: 2026-07-05
Dikerjakan oleh: **Saya (saya-sonnet-5, reasoning tinggi)** — BUKAN Saya.
Bagian 1 dari rangkaian "v1.0 bridging non-struktur": **dinding → atap → kusen → MEP**.
Latar: audit B0 (`docs/ai-map/STATE.md`) menemukan `/takeoff/dinding` di
`core-engine` SUDAH lengkap & teruji, tapi TIDAK PERNAH dipanggil karena
`document-intelligence` tidak pernah mendeteksi elemen berkategori "dinding"
sama sekali (beda dari kolom/footplat yang punya kode titik).

> **KOREKSI POLA KERJA (ditambahkan 2026-07-05, setelah slice ini
> selesai).** Owner mengoreksi pola kerja rangkaian ini: mulai slice
> berikutnya (ai-orchestrator dst), Saya HANYA merancang (logika
> deteksi, skema data, validasi anti-halusinasi) — implementasi kode nyata
> WAJIB diserahkan ke Saya lewat prompt file, BUKAN ditulis langsung oleh
> Saya ke source. **Slice dinding ini SUDAH TERLANJUR diimplementasikan
> langsung oleh Saya SEBELUM koreksi ini dibuat** — kerjanya TETAP
> DIPERTAHANKAN (sudah teruji, lihat §5), tapi ini PENGECUALIAN atas
> instruksi eksplisit owner sesi itu, BUKAN pola yang akan diulang untuk
> kategori berikutnya. Tidak ada commit dibuat (aturan ini tidak berubah).

## Ringkasan

Dinding pasangan bata TIDAK diberi kode per-segmen di gambar kerja
Indonesia pada umumnya (beda dari kolom "K1"/footplat "PC1") — biasanya
cuma digambar sbg garis + (kadang) SATU catatan spesifikasi umum ("PANJANG
DINDING KELILING 45.6 M", dsb). Karena itu, TIDAK ADA `ElementRegistryEntry`
yang bisa "dilengkapi" seperti footplat — pendekatannya beda: pindai
SELURUH dokumen (semua sheet, semua teks belum-terklasifikasi) untuk
catatan spesifikasi dinding, dan kalau AI-assist menemukan+memvalidasi
usulan, buat SATU entry sintetis baru berkategori "dinding".

**Keputusan desain eksplisit (dicatat, bukan disembunyikan)**: deteksi
otomatis panjang dinding dari GEOMETRI garis gambar (pasangan garis sejajar
di `page.get_drawings()`, ditelusuri jadi keliling ruangan) **TIDAK
dicoba** di slice ini — itu pekerjaan computer-vision vektor tersendiri
yang lebih besar (mirip beban kerja `grid_geometry.py`, perlu validasi
analitis geometri PDF nyata dulu) dan tidak cocok jadi vertical slice
sempit. Yang dikerjakan: AI-assist membaca CATATAN TEKS eksplisit
(`Unclassified.raw`, sudah diekstrak PyMuPDF) tentang panjang/tinggi
dinding — kalau catatan itu tidak ada (kemungkinan besar utk banyak
gambar), hasil jujur `belum_didukung`/`perlu_review`, bukan ditebak.

## 1. Modul baru

- `services/document-intelligence/app/perception/ai_assist/wall_assist.py`
  — `suggest_dinding_pasangan(candidate_texts, client)`. Fast filter GRATIS
  (`has_wall_keyword`, cek keyword DINDING/PASANGAN/BATA/HEBEL/BATAKO/PARTISI)
  SEBELUM panggil LLM sama sekali — dokumen tanpa kata kunci dinding sama
  sekali TIDAK memicu panggilan API. Validasi anti-halusinasi 2 lapis (sama
  pola `dimension_assist.py`): source_texts harus persis ada di input,
  angka harus match ke source_texts yang dikutip. Rentang wajar: panjang
  1-200m, tinggi 2-6m. Material SENGAJA tidak diekstrak (tidak memengaruhi
  rumus volume, hanya pemilihan AHSP di tahap lain).
- `services/document-intelligence/app/perception/bridging_dinding.py` —
  `DindingTakeoffClient` (Protocol) + `HttpDindingTakeoffClient` (stdlib
  `urllib.request`, TIDAK ADA dependency baru, pola sama
  `HttpTanahTakeoffClient`) + `bridge_dinding_pasangan(entry, client)`.
  Bukaan (lubang pintu/jendela) disederhanakan disengaja: usulan AI cuma
  kasih TOTAL luas bukaan (bukan per-lubang), dikirim ke engine sbg SATU
  entri `Bukaan(nama="bukaan_total_dari_ai_assist", lebar=total_m2,
  tinggi=1.0, n=1)` — identik matematis utk tujuan pengurangan luas.

## 2. Schema baru

`consolidated_models.py`: `AiDindingSuggestion` (l_dinding_m, h_dinding_m,
bukaan_total_m2, plester_sisi, acian, cat, confidence, reasoning,
source_texts, model, generated_at) + field
`ElementRegistryEntry.ai_dinding_suggestion`.
`packages/schemas/src/index.ts`: `AiDindingSuggestionSchema` mirror persis.

## 3. Wiring

- `consolidate.py::_apply_dinding_ai_assist` — dipanggil dari
  `consolidate_document()` (parameter `ai_client` yang sudah ada dari X2
  sebelumnya). Kumpulkan SEMUA `unclassified.raw` lintas sheet, panggil
  `suggest_dinding_pasangan`. Kalau valid → buat entry
  `kode="DINDING-AUTO-1"`, `kategori="dinding"`, `status="perlu_review"`.
  Guard: kalau entry itu sudah ada (idempotent), tidak dipanggil ulang.
- `work_items.py::_bridged_dinding_item` — dispatch baru di `_fallback_item`
  saat `category == "dinding"`, sama pola `_bridged_pondasi_telapak_item`.
  `build_work_items()` dapat parameter baru `dinding_client` (default
  `None`, backward compatible).
- `tkg_routes.py` (`POST /drawings/tkg/work-items`) — memanggil
  `HttpDindingTakeoffClient.from_env()`.
- **TIDAK ADA auto-commit ke input engine tanpa validasi** — status entry
  TETAP `perlu_review` sampai `bridge_dinding_pasangan` benar-benar
  memanggil `/takeoff/dinding` dan dapat hasil valid; kalau usulan AI
  tidak lengkap (l ATAU h kosong), tetap `perlu_review` dgn alasan
  spesifik, TIDAK PERNAH `dihitung` dari tebakan.

## 4. Test (16 test baru, TIDAK ADA panggilan API Gemini sungguhan)

- `test_perception_ai_assist.py` (+8): usulan valid diterima; **fast filter
  tanpa keyword dinding TIDAK memanggil client sama sekali**; halusinasi
  source_text ditolak; angka tidak match source_texts ditolak; panjang di
  luar rentang wajar (450m) ditolak; tinggi di luar rentang wajar (25m)
  ditolak; tanpa panjang&tinggi sama sekali ditolak; client `None` →
  degradasi anggun.
- `test_perception_bridging_dinding.py` (+5, baru, pola sama
  `test_perception_bridging_tanah.py`): tanpa usulan AI → perlu_review;
  usulan tidak lengkap → perlu_review spesifik; usulan lengkap → panggil
  engine, dapat `dihitung`; bukaan total dikirim sbg 1 entri sintetis;
  tanpa client → perlu_review.
- `test_perception_consolidate.py` (+3, wiring penuh via
  `consolidate_document()`): entry sintetis dibuat saat catatan dinding
  ditemukan (status tetap `perlu_review`, bukan `terbaca`); TIDAK dibuat
  kalau tidak ada kata kunci dinding SAMA SEKALI di dokumen; TIDAK dibuat
  tanpa `ai_client`.

## 5. Hasil verifikasi

```
services/document-intelligence : 189 passed, 5 skipped  (naik dari 173 — 16 test baru)
packages/schemas  pnpm build    : success
packages/schemas  pnpm test     : 12 passed
```
core-engine & apps/web tidak disentuh sesi ini (tidak dijalankan ulang,
tidak ada perubahan file di service/folder itu).

## 6. File yang diubah/ditambah

Baru:
- `services/document-intelligence/app/perception/ai_assist/wall_assist.py`
- `services/document-intelligence/app/perception/bridging_dinding.py`
- `services/document-intelligence/tests/test_perception_bridging_dinding.py`
- `report-remote/REPORT_X2_LANJUTAN_DINDING_SAYA_2026-07-05.md` (file ini)

Diubah:
- `services/document-intelligence/app/perception/consolidated_models.py`
  (model `AiDindingSuggestion` + field baru)
- `services/document-intelligence/app/perception/consolidate.py` (fungsi
  `_apply_dinding_ai_assist` + wiring)
- `services/document-intelligence/app/perception/work_items.py`
  (`_bridged_dinding_item` + parameter `dinding_client`)
- `services/document-intelligence/app/api/tkg_routes.py` (panggil
  `HttpDindingTakeoffClient.from_env()`)
- `services/document-intelligence/tests/test_perception_ai_assist.py`
  (+8 test wall_assist)
- `services/document-intelligence/tests/test_perception_consolidate.py`
  (+3 test wiring)
- `packages/schemas/src/index.ts` (`AiDindingSuggestionSchema`)

## 7. Pending / gap jujur

- **Deteksi geometri garis dinding** (tanpa perlu catatan teks eksplisit)
  — TIDAK dikerjakan, dicatat sbg pekerjaan CV vektor tersendiri yang lebih
  besar. Kandidat kalau AI-assist berbasis-teks terbukti tidak cukup
  general di dokumen nyata beragam.
- **Deduksi bukaan per-jenis** (pintu vs jendela terpisah) disederhanakan
  jadi satu total — cukup utk volume total, tidak cukup kalau nanti perlu
  breakdown per jenis bukaan di BOQ.
- **Belum diuji dgn PDF nyata** (PLHUT atau lainnya) — semua test pakai
  fixture sintetis (kode/angka BERBEDA dari PLHUT, konsisten §0.1).
- **Tidak ada commit** — sesuai instruksi owner, working tree tetap
  uncommitted.

## 8. Lanjut ke slice berikutnya

Sesuai instruksi owner (rangkaian dinding → atap → kusen → MEP, autonomous,
tanpa menunggu instruksi manual kecuali ada blocker) — lanjut ke **atap**
(rangka: gording/kuda_kuda/ikatan_angin/trekstang, kategori yang SUDAH
dikenali taksonomi tapi belum pernah dihitung — pola lebih dekat ke X1
footplat daripada dinding, lihat laporan berikutnya).
