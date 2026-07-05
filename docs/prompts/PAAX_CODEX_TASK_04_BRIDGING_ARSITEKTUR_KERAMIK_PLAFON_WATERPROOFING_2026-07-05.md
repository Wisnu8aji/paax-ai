# PROMPT CODEX — Task 4: Bridging Arsitektur (Keramik Dinding Basah / Plafon / Waterproofing)

> Ditulis Claude, 2026-07-05, reasoning tinggi. Lanjutan rantai Task 1-3
> (semua diverifikasi bersih, TIDAK ADA temuan korektif — lihat
> `report-remote/REPORT_TASK01_COMMIT_X2_BRIDGING_CODEX_2026-07-05.md`,
> `REPORT_TASK02_BRIDGING_KUDA_KUDA_CODEX_2026-07-05.md`,
> `REPORT_TASK03_ANALYZE_DRAWING_TOOL_CODEX_2026-07-05.md` — verifikasi
> Claude 2026-07-05 mengonfirmasi test lulus, branch/PR benar,
> `kg_per_m` anti-halusinasi bekerja, tidak ada pelanggaran aturan). Task
> ini MURNI pekerjaan baru, tidak ada perbaikan yang perlu disisipkan.
>
> **Ini task TUNGGAL, bukan bagian rantai berantai baru** — setelah
> selesai + report ditulis (§9), **BERHENTI, jangan cari prompt lain**.
> Kalau Claude/owner memutuskan lanjut lagi, prompt baru akan ditulis
> terpisah.

---

## 0. Konteks — kenapa task ini, dan kenapa BUKAN `binding.py`

Setelah Task 1-3, Claude menginvestigasi `app/perception/binding.py`
(salah satu dari 3 modul target awal konsep AI-assist X2:
`zone_classifier.py` ✓ selesai via `zone_assist.py`, `consolidate.py` ✓
selesai via entry sintetis dinding/kusen/mep, `binding.py` — BELUM).
**Temuan jujur**: `binding.py` PURELY GEOMETRIS (bandingkan koordinat bbox
elemen vs titik grid PDF, hitung toleransi jarak) — TIDAK ADA celah teks
yang bisa diisi AI-assist di situ; kasus `needs_review=True` terjadi
karena elemen benar-benar di luar rentang grid manapun, bukan krn ada
data teks yang terlewat. Memaksakan AI-assist ke modul ini TIDAK
match pola yang sudah terbukti aman (ekstrak data STRUKTURAL/NUMERIK
yang hilang dari teks) — jadi **`binding.py` SENGAJA TIDAK dikerjakan**,
dicatat sbg kesimpulan investigasi (bukan gap tertunda).

Sebagai gantinya: `docs/BRAIN_ALIGNMENT.md` §4 mengonfirmasi F-G04
(keramik dinding basah), F-G09 (plafon), F-G10 (waterproofing) SUDAH
diimplementasikan & teruji di `app/takeoff/arsitektur.py`
(`KeramikDindingBasah`, `PlafonBidang`, `WaterproofingBidang`, semua
bagian `ArsitekturRequest`) TAPI **belum pernah di-bridging** dari
document-intelligence — pola GAP YANG SAMA PERSIS dgn dinding (Task 01):
kategori ini TIDAK PUNYA kode per-instance di gambar kerja (tidak ada
"PL1" utk plafon atau "WP1" utk waterproofing yang lazim), biasanya cuma
disebut sbg catatan area/spesifikasi umum. Pola solusinya SAMA PERSIS
`wall_assist.py`/`bridging_dinding.py` (Task sebelumnya, SUDAH ADA di
repo, JADIKAN REFERENSI STRUKTUR KODE) — dokumen-luas, satu usulan per
kategori per dokumen, entry sintetis.

---

## 1. Verifikasi field SEBELUM implementasi (WAJIB, kutip persis)

Baca `services/core-engine/app/takeoff/models.py` baris ~149-190
(VERIFIKASI ULANG, file bisa berubah):

```python
class KeramikDindingBasah(BaseModel):
    kode: str
    keliling_basah_m: float          # WAJIB
    h_pasang_m: Optional[float] = None   # opsional -- default dari ArsitekturParams.h_pasang_keramik (1.5) kalau None
    bukaan_m2: float = 0.0           # opsional, default 0

class PlafonBidang(BaseModel):
    kode: str
    a_neto_m2: float                 # WAJIB
    keliling_tepi_m: float = 0.0     # opsional, default 0

class WaterproofingBidang(BaseModel):
    kode: str
    a_bidang_m2: float                # WAJIB
    keliling_upstand_m: float = 0.0   # opsional, default 0
    h_upstand_m: Optional[float] = None  # opsional -- default dari ArsitekturParams.h_upstand kalau None

class ArsitekturRequest(BaseModel):
    pondasi_batu: List[PondasiBatu] = Field(default_factory=list)
    lantai: List[PenutupLantai] = Field(default_factory=list)
    atap: List[AtapMiring] = Field(default_factory=list)
    aanstamping: List[Aanstamping] = Field(default_factory=list)
    keramik_dinding: List[KeramikDindingBasah] = Field(default_factory=list)
    plafon: List[PlafonBidang] = Field(default_factory=list)
    waterproofing: List[WaterproofingBidang] = Field(default_factory=list)
    params: ArsitekturParams = Field(default_factory=ArsitekturParams)
```

Endpoint: `POST /takeoff/arsitektur` (SUDAH ADA, JANGAN diubah), response
`ManualTakeoffResult` (shape sama semua bridging lain: `domain, items:
List[TakeoffLine], assumptions, warnings, params_used, n_needs_review`).

**PENTING beda dari Task 1/2**: request `ArsitekturRequest` menampung
BANYAK domain sekaligus (`pondasi_batu`, `lantai`, `atap`, dst) dalam
SATU request. Task ini HANYA mengisi `keramik_dinding`/`plafon`/
`waterproofing` — field lain (`pondasi_batu`, `lantai`, `atap`,
`aanstamping`) **WAJIB dikirim sbg list kosong `[]`**, JANGAN diisi
apa pun (di luar scope task ini).

---

## 2. Scope

1. Modul baru `services/document-intelligence/app/perception/ai_assist/
   arsitektur_area_assist.py` — SATU fungsi generik (pola PERSIS
   `roof_frame_assist.py`, BACA file itu dulu sbg referensi struktur
   field-spec) yang menangani 3 kategori: `keramik_dinding`, `plafon`,
   `waterproofing` (§3).
2. Schema baru `AiArsitekturAreaSuggestion` (generik, `fields: Dict[str,
   float]` sama pola `AiRoofFrameSuggestion`) di `consolidated_models.py`
   (§4).
3. Modul baru `bridging_arsitektur_area.py` — `ArsitekturTakeoffClient`/
   `HttpArsitekturTakeoffClient` (endpoint `/takeoff/arsitektur`) + 3
   fungsi bridge (`bridge_keramik_dinding`, `bridge_plafon`,
   `bridge_waterproofing`) (§5).
4. Wiring `consolidate.py` (`_apply_arsitektur_area_ai_assist`, pola
   DOKUMEN-LUAS sama `_apply_dinding_ai_assist` — BUKAN per-entry spt
   atap/kuda_kuda, krn kategori ini juga TIDAK punya kode per-instance),
   `work_items.py` (3 fungsi bridge + dispatch + parameter
   `arsitektur_area_client`), `tkg_routes.py` (§6).
5. Zod mirror (§7).
6. Test lengkap (§8) — fixture sintetis kode/angka BARU (§0.1 "PLHUT
   bukan template" tetap berlaku).

**JANGAN**: menyentuh `apps/web/**`, mengubah `app/takeoff/arsitektur.py`
atau kategori `pondasi_batu`/`lantai`/`atap`/`aanstamping` (di luar
scope), memaksakan AI-assist ke `binding.py` (§0 sudah menyimpulkan ini
BUKAN pola yang cocok — kalau kamu menemukan alasan kuat utk tetap
mengerjakannya, STOP dan laporkan alasannya, jangan langsung kerjakan).

---

## 3. `ai_assist/arsitektur_area_assist.py`

Field spec per kategori (REQUIRED vs OPTIONAL, beda dari
`roof_frame_assist.py` yang semua wajib):

```python
@dataclass(frozen=True)
class _FieldSpec:
    name: str
    min_value: float
    max_value: float
    required: bool = True

_CATEGORY_FIELDS: dict[str, tuple[_FieldSpec, ...]] = {
    "keramik_dinding": (
        _FieldSpec("keliling_basah_m", 1.0, 100.0, required=True),
        _FieldSpec("h_pasang_m", 0.5, 3.0, required=False),
        _FieldSpec("bukaan_m2", 0.0, 50.0, required=False),
    ),
    "plafon": (
        _FieldSpec("a_neto_m2", 1.0, 500.0, required=True),
        _FieldSpec("keliling_tepi_m", 0.0, 200.0, required=False),
    ),
    "waterproofing": (
        _FieldSpec("a_bidang_m2", 1.0, 500.0, required=True),
        _FieldSpec("keliling_upstand_m", 0.0, 200.0, required=False),
        _FieldSpec("h_upstand_m", 0.05, 2.0, required=False),
    ),
}

# Fast filter keyword per kategori (gratis, sebelum panggil LLM)
_CATEGORY_KEYWORDS: dict[str, tuple[str, ...]] = {
    "keramik_dinding": ("KERAMIK DINDING", "KERAMIK KM", "KERAMIK WC", "AREA BASAH", "DINDING KAMAR MANDI"),
    "plafon": ("PLAFON", "PLAFOND", "CEILING"),
    "waterproofing": ("WATERPROOFING", "WATERPROOF", "ANTI BOCOR", "KEDAP AIR"),
}
```

```python
def suggest_arsitektur_area(
    kategori: str,               # "keramik_dinding" | "plafon" | "waterproofing"
    candidate_texts: list[str],  # SEMUA unclassified text lintas dokumen
    client: AiAssistClient,
) -> AiArsitekturAreaSuggestion | None:
    ...
```

Logika:
1. Kalau `kategori` tidak dikenal (bukan salah satu dari 3 di atas) →
   `None`.
2. Fast filter: kalau tidak ada satu pun keyword kategori itu muncul di
   `candidate_texts` → `None`, JANGAN panggil client sama sekali.
3. Bangun response schema DINAMIS dari field spec kategori itu (pola
   sama `roof_frame_assist.py::_response_schema`, semua field `nullable:
   true` di level Gemini schema TERLEPAS dari required/optional —
   validasi required/optional terjadi di kode Python SETELAH respons,
   bukan di level schema Gemini).
4. Validasi (SEMUA harus lolos):
   - `reasoning`/`source_texts` tidak kosong.
   - Tiap `source_texts` HARUS substring dari `candidate_texts` asli.
   - **Field REQUIRED HARUS ada & lolos** (match angka di
     `source_texts`, dlm rentang wajar) — kalau field required kosong/
     gagal validasi → SELURUH usulan kategori itu `None` (tidak ada
     rumus tanpa field wajib, sama filosofi footplat butuh b DAN l).
   - **Field OPTIONAL boleh `null`** (diteruskan sbg `None` ke engine,
     engine pakai default sendiri) TAPI KALAU ADA NILAINYA (bukan null),
     tetap WAJIB lolos validasi anti-halusinasi + rentang (tidak boleh
     "opsional jadi longgar validasinya" — opsional cuma soal BOLEH
     kosong, bukan BOLEH salah).
5. Return `AiArsitekturAreaSuggestion(kategori=kategori, fields={...
   hanya field yang lolos/ada, key->value...}, ...)`.

---

## 4. Schema `AiArsitekturAreaSuggestion`

Di `consolidated_models.py`, SETELAH `AiKudaKudaSuggestion` (yang sudah
ada dari Task 02):
```python
class AiArsitekturAreaSuggestion(BaseModel):
    """Usulan AI-assist utk kategori arsitektur area-based (keramik_dinding/
    plafon/waterproofing) -- kategori ini TIDAK PUNYA kode per-instance sama
    sekali (pola sama dinding), konteksnya dokumen-luas. `fields` generik
    (nama field beda per kategori, field opsional yang tidak disebutkan
    boleh tidak ada di dict ini -- engine akan pakai default sendiri).
    Lihat app/perception/ai_assist/arsitektur_area_assist.py."""
    kategori: str
    fields: Dict[str, float] = Field(default_factory=dict)
    confidence: float
    reasoning: str
    source_texts: List[str] = Field(default_factory=list)
    model: str
    generated_at: str
```
Tambahkan field `ai_arsitektur_area_suggestion:
Optional[AiArsitekturAreaSuggestion] = None` ke `ElementRegistryEntry`.

---

## 5. `bridging_arsitektur_area.py`

Pola PERSIS `bridging_dinding.py` (dokumen-luas, entry sintetis) +
`bridging_atap.py` (payload builder per-kategori). Karena
`ArsitekturRequest` menggabungkan banyak domain, payload HARUS eksplisit
mengisi list kosong utk domain lain:

```python
def bridge_keramik_dinding(entry, arsitektur_client=None) -> BridgedArsitekturAreaLine:
    suggestion = entry.ai_arsitektur_area_suggestion
    if suggestion is None or suggestion.kategori != "keramik_dinding":
        return _review("keramik_dinding: tidak ditemukan catatan area/keliling eksplisit dari teks gambar -- perlu input manual")
    if "keliling_basah_m" not in suggestion.fields:
        return _review("keramik_dinding: keliling_basah_m (field wajib) tidak tersedia dari usulan AI")
    if arsitektur_client is None:
        return _review("core-engine takeoff arsitektur belum tersedia untuk bridging otomatis")

    payload = {
        "pondasi_batu": [], "lantai": [], "atap": [], "aanstamping": [],
        "keramik_dinding": [{
            "kode": entry.kode,
            "keliling_basah_m": suggestion.fields["keliling_basah_m"],
            "h_pasang_m": suggestion.fields.get("h_pasang_m"),  # None kalau tidak ada -> engine pakai default
            "bukaan_m2": suggestion.fields.get("bukaan_m2", 0.0),
        }],
        "plafon": [], "waterproofing": [],
    }
    result = arsitektur_client.takeoff_arsitektur(payload)
    # parsing SAMA pola bridge_gording/bridge_dinding_pasangan
    ...
```

`bridge_plafon`/`bridge_waterproofing` analog, isi list `plafon`/
`waterproofing` masing-masing, list lain kosong.

---

## 6. Wiring

- `consolidate.py::_apply_arsitektur_area_ai_assist(doc, registry,
  ai_client)` — kumpulkan SEMUA `unclassified.raw` lintas sheet (SAMA
  cara `_apply_dinding_ai_assist`), lalu utk TIAP kategori
  (`keramik_dinding`, `plafon`, `waterproofing`) panggil
  `suggest_arsitektur_area(kategori, all_texts, ai_client)`; kalau
  hasilnya tidak `None`, buat entry sintetis `kode=f"{KATEGORI_UPPER}-
  AUTO-1"` (mis. `"KERAMIK_DINDING-AUTO-1"`, `"PLAFON-AUTO-1"`,
  `"WATERPROOFING-AUTO-1"`), `kategori=kategori`,
  `status="perlu_review"`. Panggil fungsi ini dari `consolidate_document()`
  SETELAH baris `_apply_kuda_kuda_ai_assist(...)` yang sudah ada dari
  Task 02 (VERIFIKASI baris itu ada dulu sebelum menambah).
- `work_items.py`: 3 fungsi `_bridged_keramik_dinding_item`/
  `_bridged_plafon_item`/`_bridged_waterproofing_item` (pola sama
  `_bridged_dinding_item`), dispatch di `_fallback_item` utk 3 kategori
  ini. **PENTING**: `section_for_category` utk `keramik_dinding` dan
  `waterproofing` HARUS dipanggil dgn argumen `"finishing"` (BUKAN nama
  kategori asli, krn `_ARCHITECTURE_CATEGORIES` di file itu TIDAK
  memuat "keramik_dinding"/"waterproofing" — cek dulu isi
  `_ARCHITECTURE_CATEGORIES` yang ada, JANGAN menebak), `plafon` bisa
  pakai `section_for_category("plafon")` langsung (sudah ada di set
  itu). `build_work_items()` dapat parameter baru
  `arsitektur_area_client: ArsitekturTakeoffClient | None = None`.
- `tkg_routes.py`: `HttpArsitekturTakeoffClient.from_env()` diteruskan.

---

## 7. Zod mirror

Di `packages/schemas/src/index.ts`, SETELAH `AiKudaKudaSuggestionSchema`:
```typescript
export const AiArsitekturAreaSuggestionSchema = z.object({
  kategori: z.string(),
  fields: z.record(z.number()).default({}),
  confidence: z.number(),
  reasoning: z.string(),
  source_texts: z.array(z.string()).default([]),
  model: z.string(),
  generated_at: z.string(),
});
export type AiArsitekturAreaSuggestion = z.infer<typeof AiArsitekturAreaSuggestionSchema>;
```

---

## 8. Test WAJIB (fixture sintetis BARU, TIDAK PERNAH panggil API Gemini
sungguhan)

### 8.1 `tests/test_perception_ai_assist.py` (tambah ke file yang sudah
ada)
- Tiap 3 kategori: usulan lengkap (field wajib + opsional semua ada &
  valid) diterima.
- Tiap 3 kategori: usulan dgn HANYA field wajib (opsional tidak
  disebutkan/null) tetap diterima — `fields` dict cuma berisi field
  wajib.
- Tiap 3 kategori: field wajib kosong/gagal validasi → SELURUH usulan
  `None`.
- Field opsional ADA tapi halusinasi (tidak match teks) → DITOLAK
  (bukan cuma diabaikan) — buktikan opsional tidak berarti longgar.
- Fast filter: kategori tanpa keyword sama sekali di `candidate_texts` →
  `None`, TIDAK memanggil client.
- Kategori tidak dikenal (mis. "lantai") → `None` (di luar 3 kategori
  yang didukung task ini).
- Client `None` → degradasi anggun.

### 8.2 `tests/test_perception_bridging_arsitektur_area.py` (baru)
Utk TIAP 3 fungsi bridge: tanpa usulan → review; field wajib hilang →
review spesifik; lengkap → payload PERSIS shape (assert payload mentah
dgn field lain semua list kosong `[]`), hasil dihitung; tanpa client →
review.

### 8.3 `tests/test_perception_consolidate.py` (wiring, tambah)
- Dokumen dgn catatan "PLAFON AREA NETO 45 M2 KELILING TEPI 28 M" (angka
  BARU, beda dari contoh manapun) → entry `PLAFON-AUTO-1` dgn
  `fields={"a_neto_m2": 45.0, "keliling_tepi_m": 28.0}`.
- Dokumen TANPA catatan apa pun terkait 3 kategori ini → TIDAK ada entry
  ke-3 kategori itu dibuat, TIDAK ada panggilan client sia-sia (assert
  `fake.calls` tidak mencakup panggilan tak perlu — atau minimal jumlah
  panggilan sesuai ekspektasi kalau kamu pakai 1 fake client bersama utk
  semua kategori).

Jalankan pytest document-intelligence + core-engine + packages/schemas
+ apps/web (vitest+tsc, krn schemas berubah) — laporkan angka lengkap
before/after.

---

## 9. Laporan WAJIB — `report-remote/`, JANGAN hapus/timpa riwayat lama

Nama file baru: `report-remote/REPORT_TASK04_BRIDGING_ARSITEKTUR_AREA_CODEX_<tanggal>.md`.

Isi wajib: (1) kutipan PERSIS `KeramikDindingBasah`/`PlafonBidang`/
`WaterproofingBidang`/`ArsitekturRequest` yang ditemukan saat verifikasi
§1, (2) isi `_ARCHITECTURE_CATEGORIES` yang ditemukan di `work_items.py`
(§6) — konfirmasi apakah asumsi Claude soal keramik_dinding/waterproofing
TIDAK ada di situ benar, (3) hasil test lengkap before/after, (4) daftar
commit dgn output mentah `git log`, (5) link PR (lanjutan PR #40, branch
`feat/x2-bridging-non-struktur-dinding-atap-kusen-mep`) + status, (6)
konfirmasi tidak ada `apps/web/**` tersentuh, tidak ada `Co-Authored-By`
di commit manapun, (7) pending/gap jujur yang tersisa (mis. `pondasi_
batu`/`lantai`/`atap` miring/`aanstamping` dari `ArsitekturRequest`
masih belum di-bridging — di luar scope task ini, catat sbg kandidat
lanjutan).

---

## 10. Pembagian kerja & larangan (sama seperti task sebelumnya)

- Branch: LANJUTKAN `feat/x2-bridging-non-struktur-dinding-atap-kusen-mep`
  (dari Task 1/2), JANGAN branch baru. PR #40 tetap dipakai.
- Commit HANYA Codex, TANPA `Co-Authored-By`/signature AI apa pun.
- JANGAN merge sendiri.
- JANGAN sentuh `apps/web/**`.
- JANGAN mengisi field opsional dgn nilai tebakan "supaya kelihatan
  lengkap" — opsional yang tidak disebutkan teks HARUS tetap kosong
  (`None`/tidak ada di `fields` dict), biarkan engine pakai default
  parameternya sendiri.

**SETELAH report selesai: BERHENTI.** Tidak ada task 5 yang menunggu.
