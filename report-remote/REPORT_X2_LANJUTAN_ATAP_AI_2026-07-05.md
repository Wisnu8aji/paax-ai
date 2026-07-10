# REPORT FASE X2 LANJUTAN — SLICE #4: RANGKA ATAP NON-BETON (DIKERJAKAN LANGSUNG OLEH SAYA)

Tanggal eksekusi: 2026-07-05
Dikerjakan oleh: **Saya (saya-sonnet-5, reasoning tinggi)** — BUKAN Saya.
Bagian 2 dari rangkaian "v1.0 bridging non-struktur": dinding → **atap** → kusen → MEP.

> **KOREKSI POLA KERJA (ditambahkan 2026-07-05, setelah slice ini
> selesai).** Owner mengoreksi pola kerja rangkaian ini: mulai slice
> berikutnya (ai-orchestrator dst), Saya HANYA merancang — implementasi
> kode nyata WAJIB diserahkan ke Saya lewat prompt file. **Slice atap ini
> SUDAH TERLANJUR diimplementasikan langsung oleh Saya SEBELUM koreksi
> ini dibuat, dan SUDAH SELESAI 100%** (bukan sebagian — 15 test lulus,
> lihat §6) — kerjanya TETAP DIPERTAHANKAN, tapi ini PENGECUALIAN, BUKAN
> pola yang akan diulang. Tidak ada commit dibuat.

## Ringkasan

Beda dari dinding (slice #3): kategori `gording`/`trekstang`/`ikatan_angin`
**SUDAH terdaftar** di `paax_schemas.tkg_taxonomy.PREFIKS` (kode
"GORDING"/"GD", "TS", "IA") dan **SUDAH dikenali** `known_tkg_categories()`
— elemen dgn kode ini SUDAH masuk `ElementRegistryEntry` lewat jalur normal
(sama seperti kolom/balok, via `zone_classifier`/`binding`/`consolidate`
yang sudah ada). Gap-nya PERSIS pola X1 (galian footplat), BUKAN pola
dinding: `app/tkg/takeoff.py` (loop utama core-engine) tidak punya cabang
hitung utk kategori ini — dibuktikan langsung di kode (baris 971-975):
`if kategori not in _KATEGORI_BETON: _tambah_review(..., "kategori 'X'
(baja/atap) butuh tabel berat profil — belum didukung irisan ini
(F-G06)", ...)`. Rumusnya SUDAH ada & teruji di `app/takeoff/atap.py`
(`GordingInput`/`TrekstangInput`/`IkatanAngin`), tapi butuh field numerik
SPESIFIK per kategori (bukan `TypeRecord.dimensi` generik).

`kuda_kuda` (rangka utama, biasanya profil baja `WF ...`) **SENGAJA TIDAK
dicakup** — butuh `BajaMember{designation, length_m, qty}` + tabel bobot
profil (`profile_table`), yaitu data DESIGNASI PROFIL BAJA yang jauh lebih
spesifik & berisiko salah kalau ditebak AI dari teks umum. Dicatat sbg gap
terpisah (§7), bukan dipaksakan.

## 1. Modul baru

- `services/document-intelligence/app/perception/ai_assist/
  roof_frame_assist.py` — `suggest_roof_frame_dimensions(kategori, kode,
  kode_asli, detail_texts, client)`, GENERIK utk 3 kategori (satu fungsi,
  bukan 3 duplikat) via `_CATEGORY_FIELDS` (nama field + rentang wajar per
  kategori: gording 4 field, trekstang 2 field, ikatan_angin 3 field).
  **BEDA PENTING dari `dimension_assist.py` (footplat)**: SEMUA field
  kategori itu WAJIB lengkap sekaligus — tidak ada rumus parsial gording
  dgn 3 dari 4 field (footplat masih bisa jalan sebagian andai `d_gali`
  belum ada tapi `b`/`l` lengkap; gording/trekstang/ikatan_angin TIDAK
  punya rumus parsial spt itu). Validasi anti-halusinasi 2 lapis + rentang
  wajar per field sama pola sebelumnya.
- `services/document-intelligence/app/perception/bridging_atap.py` —
  `AtapTakeoffClient` (Protocol) + `HttpAtapTakeoffClient` (stdlib
  `urllib.request`) + `bridge_gording`/`bridge_trekstang`/
  `bridge_ikatan_angin`. Tiap fungsi cek `entry.definisi.dimensi` (rule-
  based, kalau tabel kebetulan punya field persis nama sama) DULU, baru
  fallback ke `entry.ai_roof_frame_suggestion` (AI-assist) — rule-based
  tetap fast-path.

## 2. Schema baru

`consolidated_models.py`: `AiRoofFrameSuggestion` (kategori: str, fields:
Dict[str, float] generik — BUKAN field per-kategori terpisah, supaya satu
schema cukup utk 3 kategori — confidence, reasoning, source_texts, model,
generated_at) + field `ElementRegistryEntry.ai_roof_frame_suggestion`.
`packages/schemas/src/index.ts`: `AiRoofFrameSuggestionSchema` mirror
persis (`fields: z.record(z.number())`).

## 3. Wiring

- `consolidate.py::_apply_roof_frame_ai_assist` — utk entry berkategori
  gording/trekstang/ikatan_angin yang `definisi.dimensi` TIDAK lengkap utk
  field yang dibutuhkan kategori itu, kumpulkan teks halaman `detail_tabel`
  yang memuat kode elemen (REUSE `_collect_detail_texts` yang sudah ada
  dari X1/footplat, generik tanpa perubahan), panggil AI-assist.
- `work_items.py::_bridged_roof_frame_item` — dispatch generik (dict
  `_ROOF_FRAME_BRIDGE_FN` map kategori→fungsi bridge) di `_fallback_item`.
  `build_work_items()` dapat parameter baru `atap_client` (default `None`).
- `tkg_routes.py` — memanggil `HttpAtapTakeoffClient.from_env()`.
- Verifikasi arsitektur PENTING sebelum wiring (dicek langsung, bukan
  diasumsikan): `pondasi_telapak` ADA di `_KATEGORI_BETON` sehingga lolos
  ke `_beton()`/`_bekisting()` (bukan placeholder F-G06) — X1's bridging
  bekerja krn test `build_work_items(consolidated, [])` sengaja mengirim
  `takeoff_items` KOSONG (`test_perception_work_items.py` baris 105/124),
  bukan krn kategori itu tidak pernah dapat item dari `takeoff_tkg()`.
  Pola bridging atap ini KONSISTEN dgn precedent yang sama — dites dgn cara
  yang sama (`consolidate_document`/`build_work_items` langsung, bukan
  lewat simulasi HTTP end-to-end penuh).

## 4. Test (15 test baru, TIDAK ADA panggilan API Gemini sungguhan)

- `test_perception_ai_assist.py` (+6): usulan gording lengkap diterima;
  kategori tidak dikenal (`kuda_kuda`, sengaja) ditolak; **usulan tidak
  lengkap ditolak SELURUHNYA** (beda dari footplat yang boleh parsial);
  halusinasi angka ditolak; rentang tidak wajar ditolak; client `None` →
  degradasi anggun.
- `test_perception_bridging_atap.py` (+7, baru): tanpa sumber data →
  perlu_review spesifik; rule-based dari tabel (field nama persis sama) →
  dihitung TANPA panggil AI-assist; AI-assist dipakai kalau rule-based
  tidak lengkap; trekstang & ikatan_angin masing-masing dihitung benar;
  tanpa client → perlu_review; hasil `needs_review` dari engine
  diteruskan apa adanya.
- `test_perception_consolidate.py` (+2, wiring penuh): entry gording
  (kode sintetis "GD9", angka 7/1.5/9/2 — BERBEDA dari contoh manapun di
  codebase, §0.1) dapat usulan lewat halaman detail; entry trekstang yang
  SUDAH lengkap dari tabel TIDAK memicu panggilan AI-assist sama sekali.

## 5. Hasil verifikasi

```
services/document-intelligence : 204 passed, 5 skipped  (naik dari 189 — 15 test baru)
packages/schemas  pnpm build    : success
packages/schemas  pnpm test     : 12 passed
```
core-engine & apps/web tidak disentuh sesi ini.

## 6. File yang diubah/ditambah

Baru:
- `services/document-intelligence/app/perception/ai_assist/roof_frame_assist.py`
- `services/document-intelligence/app/perception/bridging_atap.py`
- `services/document-intelligence/tests/test_perception_bridging_atap.py`
- `report-remote/REPORT_X2_LANJUTAN_ATAP_SAYA_2026-07-05.md` (file ini)

Diubah:
- `consolidated_models.py` (`AiRoofFrameSuggestion` + field baru)
- `consolidate.py` (`_apply_roof_frame_ai_assist` + wiring)
- `work_items.py` (`_bridged_roof_frame_item` + parameter `atap_client`)
- `tkg_routes.py` (panggil `HttpAtapTakeoffClient.from_env()`)
- `tests/test_perception_ai_assist.py` (+6 test)
- `tests/test_perception_consolidate.py` (+2 test)
- `packages/schemas/src/index.ts` (`AiRoofFrameSuggestionSchema`)

## 7. Pending / gap jujur

- **`kuda_kuda`** (rangka utama, profil baja) TIDAK dicakup — butuh
  ekstraksi designasi profil baja dari tabel/jadwal profil, gap terpisah,
  lebih berisiko kalau ditebak AI (kesalahan designasi profil = kesalahan
  berat/harga signifikan).
- **`nok`/`lisplank`/`talang`** (`RoofLine` model, `app/takeoff/atap.py`)
  juga belum dibridge — pola inputnya beda lagi (`work: Literal["nok",
  "lisplank", "talang"], length_m, qty`), bisa jadi slice lanjutan kalau
  terbukti perlu.
- **Belum diuji dgn PDF nyata** — semua test fixture sintetis dgn kode/
  angka berbeda dari PLHUT/contoh manapun.
- **Tidak ada commit** — sesuai instruksi owner.

## 8. Lanjut ke slice berikutnya

Sesuai instruksi owner — lanjut ke **kusen** (pintu/jendela, per SCHEDULE
menurut spek brain-v4.1 F-G11 — kemungkinan lebih dekat ke rule-based
tabel drpd AI-assist, akan diinvestigasi dulu sebelum implementasi, lihat
laporan berikutnya).
