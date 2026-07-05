# PROMPT CODEX — Task 2/3: Bridging Kuda-Kuda (Rangka Utama Baja Profil)

> Ditulis Claude, 2026-07-05, reasoning tinggi. **Kerjakan SETELAH Task 1**
> (`PAAX_CODEX_TASK_01_COMMIT_X2_BRIDGING_NONSTRUKTUR_2026-07-05.md`)
> selesai & ter-commit — task ini MEMPERLUAS kode yang baru saja kamu
> commit di branch yang sama. **JANGAN checkout branch/worktree lain** —
> lanjutkan di `feat/x2-bridging-non-struktur-dinding-atap-kusen-mep`.
>
> **Setelah task ini selesai DAN report ditulis (§7), WAJIB langsung
> lanjut ke** `docs/prompts/PAAX_CODEX_TASK_03_AI_ORCHESTRATOR_ANALYZE_DRAWING_TOOL_2026-07-05.md`
> — task itu ADA DI BRANCH/WORKTREE BERBEDA (`services/ai-orchestrator`,
> branch `feat/ai-orchestrator-toolcalling`), jadi **kamu PERLU checkout/
> pindah ke branch itu dulu** sebelum mulai (detail di file itu §0).

---

## 0. Konteks — kenapa `kuda_kuda` beda dari gording/trekstang/ikatan_angin

Task 1 mengcommit bridging utk `gording`/`trekstang`/`ikatan_angin`
(`app/perception/bridging_atap.py`, formula dari `app/takeoff/atap.py`).
Laporan Fase X2 lanjutan (`report-remote/REPORT_X2_LANJUTAN_ATAP_CLAUDE_
2026-07-05.md` §7) SENGAJA TIDAK mencakup `kuda_kuda` (rangka utama atap,
biasanya profil baja) krn butuh DATA BERBEDA: `app/takeoff/baja.py`
(`takeoff_baja`, endpoint `/takeoff/baja`) butuh `BajaMember{kode,
designation, length_m, qty}` DAN `profile_table: dict[designation,
{kg_per_m}]` — beda dari gording/dkk yang cuma butuh angka dimensi biasa.

**Prinsip PALING PENTING task ini** (baca dulu sebelum menulis kode
apa pun): `services/core-engine/app/takeoff/baja.py` baris ~36 punya
komentar eksplisit **"Profil {designation} tidak ada di profile_table;
berat profil adalah DATA"** — artinya core-engine SUDAH dirancang utk
TIDAK PERNAH menebak berat profil baja sendiri (beda dgn insinyur yang
mungkin hafal tabel baja standar — sistem ini TIDAK BOLEH berasumsi
begitu). Konsekuensi utk AI-assist yang kamu bangun: **berat per meter
(`kg_per_m`) WAJIB diekstrak dari TEKS YANG ADA DI GAMBAR** (mis. catatan
"WF 150.75.5.7 = 14.0 KG/M" di tabel profil/detail kuda-kuda) — **DILARANG
KERAS** membiarkan model "mengisi sendiri" berat profil dari pengetahuan
umum standar baja (SNI/JIS) walau modelnya mungkin "tahu" angka itu.
Kalau berat tidak disebutkan eksplisit di teks gambar manapun, hasilnya
HARUS `perlu_review`, BUKAN diisi dari tebakan/pengetahuan model. Ini
prinsip yang SAMA PERSIS dgn anti-halusinasi di semua slice AI-assist
sebelumnya, tapi risikonya LEBIH TINGGI di sini (salah berat baja = salah
biaya signifikan) — jadi validasinya harus LEBIH KETAT, bukan lebih
longgar.

---

## 1. Scope task ini

1. Modul baru `services/document-intelligence/app/perception/ai_assist/
   kuda_kuda_assist.py` — fungsi `suggest_kuda_kuda_profile` (§3).
2. Schema baru `AiKudaKudaSuggestion` di `consolidated_models.py` + field
   `ElementRegistryEntry.ai_kuda_kuda_suggestion` (§4).
3. Modul baru `services/document-intelligence/app/perception/
   bridging_kuda_kuda.py` — `BajaTakeoffClient`/`HttpBajaTakeoffClient`
   (stdlib `urllib.request`, pola PERSIS `bridging_atap.py` yang sudah
   ada) + `bridge_kuda_kuda` (§5).
4. Wiring: `consolidate.py` (fungsi `_apply_kuda_kuda_ai_assist`, REUSE
   `_collect_detail_texts` yang SUDAH ADA, generik utk kategori apa pun),
   `work_items.py` (`_bridged_kuda_kuda_item`, dispatch kategori
   `kuda_kuda`, parameter `baja_client`), `tkg_routes.py` (panggil
   `HttpBajaTakeoffClient.from_env()`) (§6).
5. Zod mirror `AiKudaKudaSuggestionSchema` di `packages/schemas/src/
   index.ts` (§7).
6. Test lengkap (§8) — TIDAK PERNAH memanggil API Gemini sungguhan.

**JANGAN**: menyentuh `apps/web/**`; mengubah formula `app/takeoff/
baja.py` (formula SUDAH ADA & benar, jangan disentuh); membiarkan model
mengisi `kg_per_m` dari pengetahuan umum (§0) — ini pelanggaran paling
serius kalau terjadi.

---

## 2. Verifikasi field SEBELUM implementasi (WAJIB, jangan menebak)

Baca dulu **persis** (jangan andalkan ringkasan di prompt ini saja):
- `services/core-engine/app/takeoff/models.py` — cari `class BajaMember`,
  `class ProfileData`, `class BajaRequest` (sudah dikonfirmasi Claude ada
  di sekitar baris 202-226 sesi lalu, TAPI VERIFIKASI ULANG PERSIS krn
  file bisa berubah):
  ```python
  class BajaMember(BaseModel):
      kode: str
      designation: str
      length_m: float
      qty: int = 1

  class BajaRequest(BaseModel):
      profile_table: dict[str, ProfileData] = Field(default_factory=dict)
      members: List[BajaMember] = Field(default_factory=list)
      builtup_plates: List[BuiltUpPlate] = Field(default_factory=list)
      paint_members: List[BajaMember] = Field(default_factory=list)
      params: BajaParams = Field(default_factory=BajaParams)
  ```
- `ProfileData` (cari definisinya persis, field yang dikonfirmasi Claude
  sesi lalu: `kg_per_m: float`, `perimeter_m: Optional[float] = None`).
- Response `/takeoff/baja` — sama shape `ManualTakeoffResult` (`domain,
  items: List[TakeoffLine], assumptions, warnings, params_used,
  n_needs_review`) yang SUDAH dipakai `bridging_atap.py` — konsisten.

---

## 3. `ai_assist/kuda_kuda_assist.py`

```python
def suggest_kuda_kuda_profile(
    kode: str,
    kode_asli: list[str],
    detail_texts: list[str],
    client: AiAssistClient,
) -> AiKudaKudaSuggestion | None:
    ...
```

Field yang diekstrak (SEMUA WAJIB lengkap, tidak ada rumus parsial —
konsisten pola `roof_frame_assist.py`):
- `designation: str` — mis. "WF 150.75.5.7" atau "150.75.5.7" — string
  bebas, TAPI **WAJIB muncul sbg substring di salah satu `source_texts`
  yang dikutip model** (validasi yang SAMA seperti angka — anti-
  halusinasi berlaku jg utk string designasi, bukan cuma angka).
- `kg_per_m: float` — **WAJIB match ke angka yang benar-benar ada di
  `source_texts`** (pola SAMA PERSIS `dimension_assist.py`/
  `roof_frame_assist.py`). Rentang wajar: **0.5 - 300 kg/m** (profil baja
  ringan ~1-5 kg/m, profil WF berat bisa >100 kg/m — rentang lebar
  sengaja krn variasi profil besar, TAPI tetap ada batas menolak angka
  yang jelas bukan berat, mis. kebetulan menangkap "2024" tahun anggaran).
- `length_m: float` — panjang batang, rentang wajar 0.5 - 20 m.
- `qty: int` — jumlah batang, rentang wajar 1 - 500.

Response schema Gemini (`_RESPONSE_SCHEMA`):
```python
{
    "type": "OBJECT",
    "properties": {
        "designation": {"type": "STRING", "nullable": True},
        "kg_per_m": {"type": "NUMBER", "nullable": True},
        "length_m": {"type": "NUMBER", "nullable": True},
        "qty": {"type": "INTEGER", "nullable": True},
        "confidence": {"type": "NUMBER"},
        "reasoning": {"type": "STRING"},
        "source_texts": {"type": "ARRAY", "items": {"type": "STRING"}},
    },
    "required": ["confidence", "reasoning", "source_texts"],
}
```

System prompt HARUS eksplisit melarang mengisi dari pengetahuan umum,
contoh kalimat (boleh disesuaikan tapi JANGAN hilangkan larangan ini):
```
"... Anda HANYA boleh mengisi kg_per_m dari ANGKA YANG SUDAH ADA di daftar
teks -- DILARANG KERAS mengisi berat profil dari pengetahuan umum/tabel
baja standar walau Anda mungkin tahu nilai itu. Kalau berat tidak
disebutkan eksplisit di teks, kembalikan null untuk kg_per_m."
```

Validasi (fungsi `_validate` internal, SEMUA harus lolos):
1. `reasoning` & `source_texts` tidak kosong.
2. Tiap `source_texts` yang dikutip HARUS substring dari salah satu
   `detail_texts` asli (persis pola slice lain).
3. `designation` (kalau ada) HARUS muncul sbg substring di salah satu
   `source_texts` yang SUDAH lolos validasi #2 (BARU, khusus task ini —
   antisipasi model "mengarang" nama designasi yang kedengarannya masuk
   akal tapi tidak pernah disebut).
4. `kg_per_m`/`length_m`/`qty` (yang ada) HARUS match angka yang muncul
   di `source_texts` (toleransi 0.05 utk kg_per_m/length_m, exact utk
   qty — pola sama slice lain).
5. Rentang wajar tiap field (di atas).
6. **SEMUA 4 field (`designation`, `kg_per_m`, `length_m`, `qty`) WAJIB
   ada & lolos validasi** — kalau SATU SAJA kosong/gagal, seluruh usulan
   ditolak (`None`), TIDAK ADA rumus parsial (pola sama `roof_frame_
   assist.py`, BUKAN pola dinding/kusen yang boleh sebagian).

---

## 4. Schema `AiKudaKudaSuggestion`

Di `consolidated_models.py`, tambahkan SETELAH `AiRoofFrameSuggestion`:
```python
class AiKudaKudaSuggestion(BaseModel):
    """Usulan AI-assist utk kuda_kuda (rangka utama atap, profil baja).
    kg_per_m WAJIB dari teks eksplisit gambar -- TIDAK PERNAH dari
    pengetahuan umum model (app/takeoff/baja.py: "berat profil adalah
    DATA"). Lihat app/perception/ai_assist/kuda_kuda_assist.py."""
    designation: str
    kg_per_m: float
    length_m: float
    qty: int
    confidence: float
    reasoning: str
    source_texts: List[str] = Field(default_factory=list)
    model: str
    generated_at: str
```
Tambahkan field `ai_kuda_kuda_suggestion: Optional[AiKudaKudaSuggestion]
= None` ke `ElementRegistryEntry` (SETELAH `ai_roof_frame_suggestion`).

---

## 5. `bridging_kuda_kuda.py`

Pola PERSIS `bridging_atap.py` (BACA file itu dulu sbg referensi
struktur): `BajaTakeoffClient` (Protocol, method `takeoff_baja`),
`HttpBajaTakeoffClient` (stdlib `urllib.request`, endpoint
`/takeoff/baja`), `bridge_kuda_kuda(entry, baja_client) ->
BridgedKudaKudaLine`.

Logika:
```python
def bridge_kuda_kuda(entry, baja_client=None):
    suggestion = entry.ai_kuda_kuda_suggestion
    if suggestion is None:
        return _review("kuda_kuda: tidak ditemukan data profil baja (designasi/berat/panjang/jumlah) yang tervalidasi dari teks gambar -- perlu input manual")
    if baja_client is None:
        return _review("core-engine takeoff baja belum tersedia untuk bridging otomatis")

    payload = {
        "profile_table": {suggestion.designation: {"kg_per_m": suggestion.kg_per_m}},
        "members": [{
            "kode": entry.kode, "designation": suggestion.designation,
            "length_m": suggestion.length_m, "qty": suggestion.qty,
        }],
        "builtup_plates": [], "paint_members": [],
    }
    result = baja_client.takeoff_baja(payload)
    # parsing SAMA pola bridge_gording (cari item dgn kode == entry.kode,
    # cek needs_review/quantity None -> perlu_review, else dihitung)
    ...
```

---

## 6. Wiring

- `consolidate.py`: fungsi `_apply_kuda_kuda_ai_assist(doc, registry,
  ai_client)` — utk entry berkategori `kuda_kuda` yang
  `entry.definisi.dimensi` TIDAK punya 4 field yang dibutuhkan (cek exact
  key `designation`/`kg_per_m`/`length_m`/`qty` — tapi INGAT `dimensi`
  bertipe `Dict[str, float]`, `designation` adalah STRING jadi TIDAK
  MUNGKIN ada di situ; artinya rule-based utk kuda_kuda praktis TIDAK
  PERNAH bisa lengkap dari `entry.definisi.dimensi` — cek saja apakah
  `entry.definisi` None ATAU kurang lengkap, lalu SELALU lanjut ke AI-
  assist kalau kondisi itu true), panggil `_collect_detail_texts` (SUDAH
  ADA, generik) lalu `suggest_kuda_kuda_profile`. Tambahkan pemanggilan
  fungsi ini di `consolidate_document()` (baris yang sudah ada
  `_apply_roof_frame_ai_assist(...)` dst — tambah baris baru
  setelahnya).
- `work_items.py`: `_bridged_kuda_kuda_item`, dispatch `if
  normalized_category == "kuda_kuda": return _bridged_kuda_kuda_item(entry,
  baja_client)` di `_fallback_item`. `build_work_items()` dapat parameter
  baru `baja_client: BajaTakeoffClient | None = None`.
- `tkg_routes.py`: `HttpBajaTakeoffClient.from_env()` diteruskan ke
  `build_work_items(..., baja_client=...)`.

---

## 7. Zod mirror

Di `packages/schemas/src/index.ts`, SETELAH `AiRoofFrameSuggestionSchema`:
```typescript
export const AiKudaKudaSuggestionSchema = z.object({
  designation: z.string(),
  kg_per_m: z.number(),
  length_m: z.number(),
  qty: z.number().int(),
  confidence: z.number(),
  reasoning: z.string(),
  source_texts: z.array(z.string()).default([]),
  model: z.string(),
  generated_at: z.string(),
});
export type AiKudaKudaSuggestion = z.infer<typeof AiKudaKudaSuggestionSchema>;
```
Jalankan `pnpm build` di `packages/schemas` setelah menambah ini.

---

## 8. Test WAJIB (pola sama slice sebelumnya, fixture SINTETIS BERBEDA
dari PLHUT/contoh lain — kode & angka baru, konsisten §0.1 "PLHUT bukan
template")

### 8.1 `tests/test_perception_ai_assist.py` (tambahkan ke file yang
sudah ada)
- Usulan lengkap & valid diterima (4 field semua ada & match teks).
- Usulan ditolak kalau `designation` TIDAK muncul di `source_texts` (BARU
  — khusus task ini, test paling penting krn ini validasi tambahan yang
  tidak ada di slice lain).
- Usulan ditolak kalau `kg_per_m` halusinasi (tidak match angka manapun
  di `source_texts`).
- Usulan ditolak kalau salah SATU dari 4 field kosong (all-or-nothing,
  sama pola gording).
- Usulan ditolak kalau `kg_per_m`/`length_m`/`qty` di luar rentang wajar.
- Client `None` → degradasi anggun.
- **Test paling penting secara filosofis**: buat kasus di mana
  `kg_per_m` KEBETULAN adalah angka yang benar (mis. cocok dgn tabel baja
  standar asli) TAPI TIDAK ADA di `source_texts`/`detail_texts` sama
  sekali (simulasikan model "menjawab benar dari pengetahuan umum,
  bukan dari teks gambar") — HARUS TETAP DITOLAK. Ini membuktikan
  sistem menolak berdasarkan SUMBER (harus dari teks), bukan berdasarkan
  benar/salah nilainya secara umum.

### 8.2 `tests/test_perception_bridging_kuda_kuda.py` (baru, pola sama
`test_perception_bridging_atap.py`)
- Tanpa usulan AI → perlu_review.
- Usulan lengkap → payload SAMA PERSIS shape `BajaRequest` dikirim ke
  client (assert payload mentah), hasil `dihitung`.
- Tanpa client → perlu_review.
- Hasil `needs_review` dari engine (mis. designasi tidak dikenal di
  `profile_table` versi core-engine sendiri) diteruskan apa adanya.

### 8.3 `tests/test_perception_consolidate.py` (tambahkan wiring test)
- Entry kuda_kuda (kode sintetis BARU, mis. "KD9", designation BARU mis.
  "WF 200.100.5.5.8", angka BARU) dapat usulan lewat halaman detail,
  status entry TETAP `perlu_review` (bukan `terbaca`).
- Tanpa client → tidak ada usulan dibuat.

Jalankan SEMUA test document-intelligence + core-engine + packages/schemas
setelah selesai, laporkan angka lengkap (before/after).

---

## 9. Laporan WAJIB — `report-remote/`

Nama file baru: `report-remote/REPORT_TASK02_BRIDGING_KUDA_KUDA_CODEX_<tanggal>.md`.
JANGAN hapus/timpa report lama.

Isi wajib: (1) hasil verifikasi field §2 (kutip PERSIS `BajaMember`/
`ProfileData`/`BajaRequest` yang kamu temukan, bukan parafrase), (2)
bukti konkret validasi anti-halusinasi designation bekerja (kutip 1 test
yang membuktikan ini + hasilnya), (3) hasil test lengkap (before/after),
(4) daftar commit dgn output mentah `git log`, (5) link PR (lanjutan PR
dari Task 1 — SAMA branch, jadi PR yang SAMA, cukup update deskripsi
kalau perlu) + status, (6) konfirmasi tidak ada `apps/web/**` tersentuh,
tidak ada `Co-Authored-By` di commit manapun, TIDAK ADA berat profil yang
diisi dari pengetahuan umum model (audit kode kamu sendiri sebelum
melaporkan ini "aman").

---

## 10. Pembagian kerja & larangan (sama seperti Task 1)

- Branch: LANJUTKAN di `feat/x2-bridging-non-struktur-dinding-atap-kusen-mep`
  (dari Task 1), JANGAN branch baru.
- Commit HANYA Codex, TANPA `Co-Authored-By`/signature AI.
- PR draft yang SAMA dari Task 1 tetap terbuka, JANGAN merge sendiri.
- JANGAN sentuh `apps/web/**`, JANGAN ubah `app/takeoff/baja.py`.
- **Larangan paling serius**: JANGAN PERNAH membiarkan `kg_per_m` terisi
  dari pengetahuan umum model tentang tabel baja standar — kalau kamu
  ragu apakah validasi kamu cukup ketat utk mencegah ini, tulis LEBIH
  BANYAK test kasus adversarial (§8.1 poin terakhir) daripada mengurangi
  validasi.

**SETELAH task ini selesai + report ditulis: LANGSUNG lanjut** ke
`docs/prompts/PAAX_CODEX_TASK_03_AI_ORCHESTRATOR_ANALYZE_DRAWING_TOOL_2026-07-05.md`
— **task itu di branch/worktree BERBEDA**, baca §0 file itu dulu utk tahu
cara pindah context dgn benar.
