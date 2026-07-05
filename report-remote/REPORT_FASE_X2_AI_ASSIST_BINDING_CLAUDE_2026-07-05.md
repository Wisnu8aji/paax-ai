# REPORT FASE X2 - LAPISAN AI-ASSIST KLASIFIKASI/BINDING (DIKERJAKAN LANGSUNG OLEH CLAUDE)

Tanggal eksekusi: 2026-07-05
Branch kerja: `feat/fase-x1b-packaging-binding-footplat` (working tree yang sama, BELUM di-commit)
Dikerjakan oleh: **Claude (claude-sonnet-5, reasoning tinggi)** — BUKAN Codex.
Prompt sumber: `docs/prompts/PAAX_CODEX_PROMPT_FASE_X2_AI_ASSIST_KLASIFIKASI_BINDING_2026-07-05.md`
(ditulis Claude di sesi sebelumnya sbg spek Codex, TAPI owner mengubah instruksi
di sesi yang sama untuk minta Claude mengimplementasikan langsung, dengan
scope diperluas dari 1 slice menjadi 2 slice).

> **Catatan penting soal atribusi.** Semua kode di report ini ditulis dan
> diverifikasi oleh Claude langsung dalam sesi percakapan yang sama dengan
> analisis Fase X1B/perencanaan roadmap sebelumnya — bukan hasil eksekusi
> Codex. Ini menyimpang dari pembagian kerja baku proyek (`CLAUDE.md` §9:
> Codex biasanya mengerjakan backend mekanis), sesuai instruksi eksplisit
> owner untuk sesi ini. **Tidak ada commit yang dibuat** — working tree
> tetap uncommitted sesuai instruksi owner, menunggu review manusia sebelum
> di-commit oleh siapa pun.

## Ringkasan

Fase X2 dipicu temuan jujur Fase X1B: PDF PLHUT nyata (88 halaman)
menghasilkan **13/13 (100%)** elemen `pondasi_telapak` `perlu_review` karena
dimensinya hanya ada di halaman detail/grafis (kode+angka lepas), bukan
tabel kode-dimensi yang bisa diparse `page.find_tables()`. Instruksi awal
owner (menulis prompt Codex utk slice sempit "dimensi footplat saja")
diubah di sesi yang sama menjadi: **Claude mengimplementasikan langsung**,
dengan scope diperluas menjadi **2 slice**:

1. **Dimensi footplat dari halaman detail** (`dimension_assist.py`) — slice
   asli dari prompt Codex, diikuti dengan penyesuaian teknis (lihat §2).
2. **Klasifikasi zona sheet yang gagal rule-based** (`zone_assist.py`) —
   slice BARU, diambil dari catatan `docs/plans/PAAX_ANALISA_RAB_DARI_
   GAMBAR_BIG_PLAN_2026-07-13.md` §0.1 poin 4 (ditulis 2026-07-13, baru
   dieksekusi sekarang) yang sudah lebih dulu mengantisipasi pola gap ini
   untuk `zone_classifier.py`.

Prinsip inti (`CLAUDE.md` §1.1, tidak dilanggar): rule-based tetap
fast-path utama; LLM hanya dipanggil saat rule-based sudah gagal; LLM
membaca teks yang SUDAH diekstrak PyMuPDF (bukan piksel); setiap usulan
divalidasi deterministik sebelum jadi kandidat; **tidak ada auto-commit ke
input engine** — usulan hanya ditempel sbg field baru, field asli (`dimensi`,
`zone`) tidak pernah ditimpa; `bridge_galian_footplat`/`work_items.py` (jalur
deterministik ke `core-engine`) sama sekali tidak disentuh/tidak pernah
melihat usulan AI.

## 1. Penyesuaian teknis terhadap spek awal (kenapa berbeda dari prompt Codex)

Sebelum implementasi, saya (Claude) membaca ulang kode nyata (`consolidate.py`,
`consolidated_models.py`, `bridging_tanah.py`, `work_items.py`,
`app/perception/tkg/models.py`) dan menemukan bahwa **desain di prompt Codex
awal (span teks + koordinat/bbox presisi) tidak match dengan data yang
benar-benar tersedia di titik integrasi yang tepat**:

- `ElementRegistryEntry`/`ConsolidatedExtraction` (output `consolidate_
  document()`) TIDAK menyimpan `TextSpan` mentah dengan bbox — hanya
  `Unclassified.raw` (`str`) + `alasan` (`str`), tanpa koordinat.
- Titik integrasi yang benar bukan `bridging_tanah.py`/`work_items.py`
  (yang menerima `ConsolidatedExtraction` sudah final via HTTP request tanpa
  data mentah), melainkan **`consolidate.py::consolidate_document()`**
  sendiri — fungsi ini menerima `TkgDocument` PENUH (per-sheet, termasuk
  `sheet.unclassified` teks mentah dan `sheet.meta.zone`) SEBELUM
  diringkas jadi `ConsolidatedExtraction`. Titik ini jauh lebih tepat: data
  teks mentah per halaman masih ada, dan hanya ada SATU caller
  (`drawing_routes.py`) sehingga menambah parameter baru aman (backward
  compatible, default `None`).
- Karena `Unclassified` tidak punya bbox, validasi anti-halusinasi saya
  desain berbasis **teks** (source_texts harus persis ada di input,
  angka harus match ke source_texts yang dikutip) bukan koordinat — tetap
  memenuhi prinsip "tidak boleh mengarang", hanya mekanismenya disesuaikan
  ke data yang benar-benar ada.

Keputusan ini saya catat eksplisit di sini karena **prompt Codex asli
(`docs/prompts/PAAX_CODEX_PROMPT_FASE_X2_AI_ASSIST_KLASIFIKASI_BINDING_
2026-07-05.md`) menyebut "koordinat/bbox presisi" sbg bagian validasi** —
itu TIDAK saya implementasikan karena datanya memang tidak tersedia di titik
integrasi yang benar. Validasi teks (bukan koordinat) tetap seketat yang
diminta (dua lapis anti-halusinasi, lihat §2.2).

## 2. Modul baru `services/document-intelligence/app/perception/ai_assist/`

### 2.1 `client.py` — klien LLM

- `AiAssistClient` (Protocol) — kontrak `generate_json(system_prompt,
  user_prompt, response_schema) -> dict | None`.
- `GeminiAiAssistClient` — REST langsung ke Gemini (`gemini-2.5-flash`,
  `generationConfig.responseSchema` terstruktur, `temperature=0.1`, header
  `x-goog-api-key`) — pola PERSIS `apps/web/src/lib/ai/orchestrator.ts`.
  Pakai **stdlib `urllib.request` SAJA** (sama seperti
  `bridging_tanah.py::HttpTanahTakeoffClient`) — **TIDAK ADA dependency
  Python baru ditambahkan** (tidak ada `httpx`/`requests`/SDK Gemini resmi).
  `from_env()` membaca `GEMINI_API_KEY` yang SUDAH ada di `.env.example`
  (tidak ada env var baru).
- `NullAiAssistClient` — dipakai kalau `GEMINI_API_KEY` tidak diset;
  `generate_json` selalu `None`, pipeline utama tetap jalan normal (pola
  degradasi anggun sama dengan `paddle_ocr_extractor.py`).
- Kegagalan jaringan/timeout/parsing JSON di `GeminiAiAssistClient`
  ditangkap (`URLError`, `TimeoutError`, `OSError`, `ValueError`,
  `KeyError`, `IndexError`, `TypeError`) dan mengembalikan `None` — TIDAK
  PERNAH melempar exception ke caller.

### 2.2 `dimension_assist.py` — slice #1: dimensi footplat

`suggest_footplat_dimensions(kode, kode_asli, detail_texts, client)`:

- Prompt sistem MELARANG model mengarang angka; minta model kembalikan
  `b_mm`/`l_mm`/`d_gali_mm` (nullable) + `confidence` + `reasoning` +
  `source_texts` (kutipan PERSIS dari `detail_texts` yang jadi dasar).
- **Validasi anti-halusinasi 2 lapis** (WAJIB, bukan opsional):
  1. Setiap `source_texts` yang dikutip model HARUS `in` salah satu baris
     `detail_texts` asli — kalau model "mengutip" teks yang tak pernah
     dikirim, DITOLAK (`None`).
  2. Setiap angka (`b_mm`/`l_mm`/`d_gali_mm`) HARUS match (toleransi 0.5mm)
     ke angka yang benar-benar ada di `source_texts` yang SUDAH lolos
     validasi #1 (bukan sembarang angka di halaman) — kalau model
     mengarang angka yang tak ada di kutipannya sendiri, DITOLAK.
- **Rentang wajar**: 100mm–5000mm untuk tiap dimensi. Angka di luar rentang
  ini (mis. kebetulan menangkap nomor besar seperti tahun/halaman) DITOLAK
  walau lolos anti-halusinasi.
- Kalau tidak ada `reasoning`/`source_texts`, atau ketiga field dimensi
  semua `null`, hasil DITOLAK.
- Hasil sukses → `AiDimensionSuggestion` (Pydantic, lihat §4).

### 2.3 `zone_assist.py` — slice #2 (BARU, perluasan scope)

`suggest_zone(judul, context_texts, client)`:

- Enum tertutup `ZONE_ENUM` (10 nilai, SINKRON dgn `zone_classifier.py`
  `_ZONE_RULES` + fallback `cover`): `substruktur`, `struktur_atap`,
  `struktur_lantai_1`, `struktur_lantai_2`, `daftar_gambar`, `situasi`,
  `tampak`, `potongan`, `detail_tabel`, `cover`.
- Model boleh menjawab salah satu dari 10 nilai itu ATAU `"tidak_yakin"`.
- **Validasi deterministik**: hasil HARUS persis salah satu dari 10 nilai
  `ZONE_ENUM` — `"tidak_yakin"`, string kosong, atau nilai asing APA PUN
  (termasuk yang terlihat masuk akal tapi tidak terdaftar) DITOLAK sbg
  kandidat (`None`), BUKAN diloloskan dengan confidence rendah.
- Kalau tidak ada `reasoning`, DITOLAK.

## 3. Wiring ke pipeline nyata

- `consolidate.py::consolidate_document()` — parameter baru
  `ai_client: AiAssistClient | None = None` (default `None`, SEMUA 16
  caller test lama TIDAK berubah perilakunya — diverifikasi lewat full
  test suite, lihat §6).
  - `_apply_dimension_ai_assist()`: untuk tiap `ElementRegistryEntry`
    berkategori `pondasi_telapak` yang `definisi.dimensi` KOSONG (rule-based
    gagal), cari sheet berzona `detail_tabel` yang MEMUAT label kode elemen
    ini di `unclassified` (toleran variasi penulisan via `_normalize_kode`
    yang sudah ada, Fase V), kumpulkan SEMUA teks `unclassified` sheet itu
    sbg konteks, panggil `suggest_footplat_dimensions`. Kalau lolos
    validasi → `entry.ai_dimension_suggestion` diisi. **Kalau
    `definisi.dimensi` SUDAH terisi dari rule-based, AI-assist TIDAK
    dipanggil sama sekali** (fast-path, hemat biaya, dibuktikan test §5).
  - `_apply_zone_ai_assist()`: untuk tiap `SheetSummary` dengan `zone is
    None`, kumpulkan `judul` + teks `unclassified` sheet itu, panggil
    `suggest_zone`. Kalau lolos validasi → `zone_ai_suggestion` diisi.
    **Sheet yang SUDAH punya `zone` dari rule-based TIDAK dipanggil sama
    sekali.**
- `drawing_routes.py` (`POST /drawings/analyze`) — memanggil
  `consolidate_document(tkg_document, ai_client=GeminiAiAssistClient.
  from_env())`. Kalau `GEMINI_API_KEY` tidak diset di env, `from_env()`
  mengembalikan `None` dan seluruh pipeline berperilaku IDENTIK dengan
  sebelum Fase X2 (tidak ada regresi utk deployment yang belum punya key).
- **`bridging_tanah.py` dan `work_items.py` (jalur deterministik ke
  `core-engine`) SAMA SEKALI TIDAK DIUBAH** — keduanya tidak pernah melihat
  `ai_dimension_suggestion`/`zone_ai_suggestion`. Ini keputusan desain
  sengaja: usulan AI hidup sbg metadata advisory di lapisan konsolidasi,
  terpisah dari kontrak input fungsi bridging deterministik, supaya batas
  Aturan Emas tetap tegas secara arsitektural (bukan cuma secara konvensi).

## 4. Schema baru (Pydantic + Zod, diubah bersamaan)

`services/document-intelligence/app/perception/consolidated_models.py`:
- `AiDimensionSuggestion` (baru): `b_mm`, `l_mm`, `d_gali_mm` (semua
  `Optional[float]`), `confidence: float`, `reasoning: str`,
  `source_texts: List[str]`, `model: str`, `generated_at: str`.
- `AiZoneSuggestion` (baru): `zone: str`, `confidence: float`,
  `reasoning: str`, `model: str`, `generated_at: str`.
- `ElementRegistryEntry.ai_dimension_suggestion: Optional[AiDimensionSuggestion] = None` (field baru, opsional).
- `SheetSummary.zone_ai_suggestion: Optional[AiZoneSuggestion] = None` (field baru, opsional).

`packages/schemas/src/index.ts`:
- `AiDimensionSuggestionSchema`, `AiZoneSuggestionSchema` (Zod mirror
  persis field Pydantic di atas) + tipe TS `AiDimensionSuggestion`/
  `AiZoneSuggestion` diekspor.
- **Catatan jujur soal batas mirror**: `ElementRegistryEntry`/
  `SheetSummary`/`ConsolidatedExtraction` (tipe induk field baru ini)
  **TIDAK PUNYA mirror Zod sama sekali** di repo ini SEBELUM Fase X2 —
  ini gap pre-existing yang saya temukan saat implementasi, BUKAN sesuatu
  yang saya perkenalkan. Saya hanya menambah mirror untuk 2 tipe BARU
  (`AiDimensionSuggestion`/`AiZoneSuggestion`) itu sendiri, tidak
  memperbaiki gap lama (di luar scope task ini) — dicatat sbg pending §7.

## 5. Test baru (24 test, TIDAK ADA panggilan API Gemini sungguhan)

`services/document-intelligence/tests/test_perception_ai_assist.py` (19 test,
`FakeAiAssistClient` stub in-memory):
- Dimensi: usulan valid diterima; angka halusinasi (tidak ada di
  source_texts) ditolak; source_text yang tidak pernah dikirim ditolak;
  nilai di luar rentang wajar ditolak; tanpa `detail_texts` tidak memanggil
  client sama sekali; client mengembalikan `None` → degradasi anggun;
  `reasoning`/`source_texts` kosong ditolak.
- Zona: nilai enum valid diterima; nilai enum asing ditolak; `"tidak_yakin"`
  ditolak sbg kandidat (bukan diloloskan); `reasoning` kosong ditolak; tanpa
  `judul`/konteks tidak memanggil client; client `None` → degradasi anggun.
- Client: `NullAiAssistClient` selalu `None`; `GeminiAiAssistClient.from_env()`
  `None` tanpa `GEMINI_API_KEY`, instance valid dengan key; parsing response
  Gemini sukses/gagal-jaringan/response-malformed **dgn `urlopen` di-
  monkeypatch** (TIDAK memanggil jaringan sungguhan sama sekali).

`services/document-intelligence/tests/test_perception_consolidate.py` (+5 test,
fixture sintetis kode **"P9"** dan angka **900/800/450** — SENGAJA BERBEDA
dari kode/angka PLHUT `P1-P7`/`PC1-PC3`/`1500`/`1300`, konsisten §0.1
"PLHUT = fixture bukan template", membuktikan generalisasi bukan hafalan):
- Usulan dimensi ditempel saat rule-based gagal + ada sheet `detail_tabel`
  yang memuat kode; `entry.definisi.dimensi` TETAP kosong (rule-based tidak
  "menang" secara diam-diam), status bukan `dihitung`.
- Tanpa `ai_client` (default `None`) → tidak ada usulan sama sekali
  (perilaku identik pra-X2).
- **Fast-path dibuktikan eksplisit**: kalau tabel kode-dimensi SUDAH mengisi
  `definisi.dimensi`, AI-assist TIDAK dipanggil (`fake.calls == []`).
- Usulan zona ditempel HANYA utk sheet `zone is None`; sheet yang sudah
  terklasifikasi TIDAK dapat usulan & TIDAK memicu panggilan client sama
  sekali (`len(fake.calls) == 1`, bukan 2).
- Nilai zona asing dari model ditolak lewat jalur wiring penuh (bukan cuma
  unit test terisolasi) — `zone_ai_suggestion` tetap `None`.

## 6. Hasil verifikasi lengkap (dijalankan nyata sesi ini)

```
services/document-intelligence : 173 passed, 5 skipped  (naik dari 149 passed + 5 skipped)
services/core-engine            : 280 passed              (tidak disentuh, tidak ada regresi)
packages/schemas  pnpm build    : success
packages/schemas  pnpm test     : 12 passed
apps/web          pnpm vitest   : 13 files, 47 tests passed
apps/web          pnpm tsc --noEmit : sukses, tidak ada error
```

## 7. File yang diubah/ditambah

File baru:
- `services/document-intelligence/app/perception/ai_assist/__init__.py`
- `services/document-intelligence/app/perception/ai_assist/client.py`
- `services/document-intelligence/app/perception/ai_assist/dimension_assist.py`
- `services/document-intelligence/app/perception/ai_assist/zone_assist.py`
- `services/document-intelligence/tests/test_perception_ai_assist.py`
- `docs/prompts/PAAX_CODEX_PROMPT_FASE_X2_AI_ASSIST_KLASIFIKASI_BINDING_2026-07-05.md`
  (ditulis sesi sebelumnya, ditandai ulang sbg "tidak dijalankan Codex,
  diimplementasikan Claude langsung")
- `report-remote/REPORT_FASE_X2_AI_ASSIST_BINDING_CLAUDE_2026-07-05.md` (file ini)

File diubah:
- `services/document-intelligence/app/perception/consolidate.py` (wiring
  `ai_client` param + 4 fungsi helper baru)
- `services/document-intelligence/app/perception/consolidated_models.py`
  (2 model Pydantic baru + 2 field opsional baru)
- `services/document-intelligence/app/api/drawing_routes.py` (import +
  panggilan `GeminiAiAssistClient.from_env()`)
- `services/document-intelligence/tests/test_perception_consolidate.py`
  (+5 test wiring)
- `packages/schemas/src/index.ts` (2 Zod schema baru + tipe)
- `docs/ai-map/STATE.md`, `docs/BRAIN_ALIGNMENT.md`,
  `docs/plans/PAAX_ANALISA_RAB_DARI_GAMBAR_BIG_PLAN_2026-07-13.md` (status
  Fase X2 diperbarui dari "belum mulai" jadi "2 slice selesai, belum
  commit")

## 8. Yang TIDAK dikerjakan / pending

- **Generalisasi ke kategori takeoff lain** di luar `pondasi_telapak`
  (mis. kolom, balok yang mungkin punya gap serupa) — belum diselidiki,
  bukan bagian scope sesi ini.
- **`binding.py` (label→grid)** — disebut di konsep awal owner sbg salah
  satu dari 3 modul target (`zone_classifier.py`/`binding.py`/
  `consolidate.py`), TAPI belum jadi slice AI-assist tersendiri. Fase V
  (normalisasi kode) sudah menutup sebagian gap toleransi penulisan di
  modul ini secara rule-based; kandidat gap AI-assist di `binding.py`
  belum diukur konkret (belum ada bukti kegagalan setegas temuan
  footplat/zona).
- **Integrasi `GEMINI_API_KEY` sungguhan belum diuji end-to-end** — semua
  test pakai stub/mock, TIDAK PERNAH memanggil API Gemini asli (sesuai
  instruksi eksplisit owner). Kalau nanti diuji dgn key nyata, verifikasi
  tambahan (biaya per panggilan, latency, kualitas prompt sungguhan thd
  contoh gambar nyata) masih perlu dilakukan terpisah.
- **UI review/approval untuk `ai_suggestion`** — di luar cakupan backend
  sesi ini, domain frontend terpisah (`apps/web/**` tidak disentuh sama
  sekali sesi ini).
- **Mirror Zod penuh `ElementRegistryEntry`/`SheetSummary`/
  `ConsolidatedExtraction`** — gap pre-existing yang ditemukan (bukan
  diperkenalkan) sesi ini, tidak diperbaiki (di luar scope).
- **Tidak ada commit** — sesuai instruksi eksplisit owner, working tree
  tetap uncommitted, menunggu review sebelum siapa pun (Codex atau owner
  sendiri) melakukan commit.
