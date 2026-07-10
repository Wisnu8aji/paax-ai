# PROMPT SAYA — Task 5: Bridging Arsitektur Sisa (Pondasi Batu / Lantai / Atap Miring / Aanstamping)

> Ditulis Saya, 2026-07-05, reasoning tinggi. Lanjutan Task 1-4 (SEMUA
> diverifikasi bersih oleh Saya — lihat 4 report
> `REPORT_TASK0{1,2,3,4}_*_SAYA_2026-07-05.md` — TIDAK ADA temuan
> korektif dari task manapun). Task ini murni pekerjaan baru, tidak ada
> perbaikan yang perlu disisipkan.
>
> **Task tunggal (bukan rantai baru)** — setelah selesai + report ditulis
> (§8), **BERHENTI, jangan cari prompt lain**.

---

## 0. Konteks — melengkapi `ArsitekturRequest`

Task 4 mem-bridging `keramik_dinding`/`plafon`/`waterproofing` dari 7
sub-domain `ArsitekturRequest` (`services/core-engine/app/takeoff/
models.py`). Report Task 4 (§Gap Tersisa) mencatat jujur 4 sub-domain
LAIN yang formulanya SUDAH ADA & teruji (`docs/BRAIN_ALIGNMENT.md` Fase
3b: "F-G01/03/05 pondasi batu belah, penutup lantai+plin, atap miring
A/cosθ") tapi **belum pernah di-bridging** dari document-intelligence:
`pondasi_batu`, `lantai`, `atap` (miring, BEDA dari kategori "atap"
gording/trekstang/ikatan_angin Task 1/2 yang rangka BUKAN penutup),
`aanstamping`. Task ini melengkapi SEMUA 7 sub-domain `ArsitekturRequest`
(3 dari Task 4 + 4 dari task ini).

**REUSE infrastruktur Task 4** — `ai_assist/arsitektur_area_assist.py`
dan `bridging_arsitektur_area.py` SUDAH ADA (generik, field-spec driven).
Task ini **MEMPERLUAS** file yang sama (tambah entry ke
`_CATEGORY_FIELDS`/`_CATEGORY_KEYWORDS`, tambah 4 fungsi bridge baru) —
**JANGAN buat modul baru terpisah**, JANGAN duplikasi struktur yang
sudah ada.

---

## 1. Verifikasi field SEBELUM implementasi (WAJIB, kutip persis)

Baca `services/core-engine/app/takeoff/models.py` baris ~141-168
(VERIFIKASI ULANG):

```python
class PondasiBatu(BaseModel):
    kode: str
    a_atas: float      # lebar atas trapesium (m) -- WAJIB
    a_bawah: float     # lebar bawah (m) -- WAJIB
    h_pond: float      # tinggi pondasi (m) -- WAJIB
    l: float           # panjang menerus (m) -- WAJIB

class PenutupLantai(BaseModel):
    kode: str
    panjang: float                  # WAJIB
    lebar: float                    # WAJIB
    lebar_pintu_total: float = 0.0  # opsional, default 0
    plin: bool = True               # opsional, default True -- LIHAT §3 soal ini

class AtapMiring(BaseModel):
    kode: str
    a_proyeksi: float   # luas proyeksi horizontal (m2) -- WAJIB
    theta_deg: float    # sudut kemiringan atap (derajat) -- WAJIB

class Aanstamping(BaseModel):
    kode: str
    a_bawah_m: float        # WAJIB
    t_aanstamping_m: float  # WAJIB
    panjang_m: float        # WAJIB
```

Endpoint SAMA `POST /takeoff/arsitektur` (SUDAH dipakai Task 4, JANGAN
diubah). Payload HARUS tetap mengisi list kosong `[]` utk domain lain
yang tidak disentuh (pola SAMA Task 4).

---

## 2. Scope

1. Perluas `_CATEGORY_FIELDS` & `_CATEGORY_KEYWORDS` di
   `arsitektur_area_assist.py` (SUDAH ADA dari Task 4) — tambah 4
   kategori baru: `pondasi_batu`, `lantai`, `atap_miring`, `aanstamping`
   (§3).
2. Perluas `bridging_arsitektur_area.py` — tambah 4 fungsi bridge:
   `bridge_pondasi_batu`, `bridge_lantai`, `bridge_atap_miring`,
   `bridge_aanstamping` (§4).
3. Wiring `consolidate.py::_apply_arsitektur_area_ai_assist` (SUDAH ADA
   dari Task 4) — perluas loop kategori supaya mencakup 4 kategori baru
   ini juga (bukan fungsi baru, cukup tambah ke list kategori yang
   di-iterasi).
4. Wiring `work_items.py` — dispatch 4 kategori baru + parameter (REUSE
   `arsitektur_area_client` yang SUDAH ADA dari Task 4, JANGAN buat
   parameter baru).
5. Test lengkap (§6) — fixture sintetis BARU (kode/angka beda dari
   contoh manapun).

**JANGAN**: menyentuh `apps/web/**`, mengubah `app/takeoff/
arsitektur.py`, membuat modul/parameter duplikat (REUSE yang sudah ada
dari Task 4, itu prinsip utama task ini).

---

## 3. Field spec (tambahkan ke `_CATEGORY_FIELDS`/`_CATEGORY_KEYWORDS`)

```python
"pondasi_batu": (
    _FieldSpec("a_atas", 0.1, 2.0, required=True),
    _FieldSpec("a_bawah", 0.1, 3.0, required=True),
    _FieldSpec("h_pond", 0.1, 2.0, required=True),
    _FieldSpec("l", 1.0, 200.0, required=True),
),
"lantai": (
    _FieldSpec("panjang", 0.5, 100.0, required=True),
    _FieldSpec("lebar", 0.5, 100.0, required=True),
    _FieldSpec("lebar_pintu_total", 0.0, 20.0, required=False),
),
"atap_miring": (
    _FieldSpec("a_proyeksi", 1.0, 500.0, required=True),
    _FieldSpec("theta_deg", 5.0, 60.0, required=True),
),
"aanstamping": (
    _FieldSpec("a_bawah_m", 0.1, 3.0, required=True),
    _FieldSpec("t_aanstamping_m", 0.05, 1.0, required=True),
    _FieldSpec("panjang_m", 1.0, 200.0, required=True),
),
```

```python
"pondasi_batu": ("PONDASI BATU", "PONDASI BATU KALI", "BATU BELAH", "PASANGAN BATU KALI"),
"lantai": ("PENUTUP LANTAI", "KERAMIK LANTAI", "LANTAI KERAMIK", "FLOOR FINISH"),
"atap_miring": ("ATAP MIRING", "PENUTUP ATAP", "GENTENG", "KEMIRINGAN ATAP"),
"aanstamping": ("AANSTAMPING", "PASANGAN BATU KOSONG", "LAPIS PENYARING"),
```

**Semua field kategori ini all-required KECUALI `lebar_pintu_total`
(lantai)** — pola sama Task 4 (required→gagal-semua, optional→boleh
kosong tapi kalau ada tetap divalidasi).

### 3.1 Soal `plin: bool` (PenutupLantai) — keputusan desain, BACA dulu

`plin` (pakai plin/skirting atau tidak) adalah BOOLEAN, TIDAK cocok
dgn `_FieldSpec` yang didesain utk field NUMERIK (`_CATEGORY_FIELDS`
generik krn semua field lain di seluruh sistem ini numerik — JANGAN
paksakan `_FieldSpec` menangani boolean, itu akan merusak desain generik
yang sudah teruji). **Keputusan: `plin` TIDAK diekstrak AI-assist sama
sekali** — `bridge_lantai` SELALU mengirim `plin=True` (default engine
sendiri, konsisten §0.1 "jangan menebak dari teks, tapi juga tidak perlu
menuduh teks harus menyebutkan hal yang sudah ada default wajar") ke
payload, TIDAK PERNAH mencoba menyimpulkan boolean ini dari teks. Ini
konsisten dgn cara `bridge_dinding_pasangan` (Task sebelumnya) memakai
default konservatif `plester_sisi=0` dstnya kalau tidak disebutkan
eksplisit — bedanya di sini `plin` justru defaultnya `True` (sudah
default engine), jadi kita SEKEDAR mengikuti default itu, bukan menebak.

---

## 4. `bridging_arsitektur_area.py` — 4 fungsi baru

Pola PERSIS `bridge_keramik_dinding`/`bridge_plafon` (Task 4, BACA file
itu dulu sbg referensi struktur):

```python
def bridge_pondasi_batu(entry, arsitektur_client=None) -> BridgedArsitekturAreaLine:
    suggestion = entry.ai_arsitektur_area_suggestion
    if suggestion is None or suggestion.kategori != "pondasi_batu":
        return _review("pondasi_batu: tidak ditemukan catatan dimensi trapesium eksplisit dari teks gambar -- perlu input manual")
    required = ("a_atas", "a_bawah", "h_pond", "l")
    missing = [name for name in required if name not in suggestion.fields]
    if missing:
        return _review(f"pondasi_batu: field wajib tidak lengkap ({', '.join(missing)})")
    if arsitektur_client is None:
        return _review("core-engine takeoff arsitektur belum tersedia untuk bridging otomatis")

    payload = {
        "pondasi_batu": [{"kode": entry.kode, **{name: suggestion.fields[name] for name in required}}],
        "lantai": [], "atap": [], "aanstamping": [],
        "keramik_dinding": [], "plafon": [], "waterproofing": [],
    }
    result = arsitektur_client.takeoff_arsitektur(payload)
    # parsing SAMA pola bridge_keramik_dinding/bridge_plafon Task 4
    ...
```

`bridge_lantai` — payload `"lantai": [{"kode": entry.kode, "panjang":
..., "lebar": ..., "lebar_pintu_total": suggestion.fields.get(
"lebar_pintu_total", 0.0), "plin": True}]` (§3.1).

`bridge_atap_miring` — payload key `"atap"` (VERIFIKASI nama field
persis di `ArsitekturRequest` — sudah dikutip `atap: List[AtapMiring]`
di §1, JADI key payload adalah `"atap"` BUKAN `"atap_miring"` — hati-hati
beda nama antara KATEGORI internal kita (`"atap_miring"`, supaya tidak
bentrok dgn kategori "atap" milik Task 1/2 di sistem kategori
document-intelligence) VS nama FIELD di request core-engine (`"atap"`,
sesuai `ArsitekturRequest.atap`). JANGAN tertukar dua hal ini.

`bridge_aanstamping` — payload key `"aanstamping"`.

---

## 5. WBS Section routing — cek dulu, jangan menebak

`_ARCHITECTURE_CATEGORIES` (`work_items.py`, dari Task 4 sudah
dikonfirmasi isinya `{"dinding", "lantai", "plafon", "atap", "finishing",
"kusen"}`): `"lantai"` SUDAH ada di situ (pakai langsung
`section_for_category("lantai")`). `"atap_miring"` BISA pakai
`section_for_category("atap")` (string literal `"atap"`, ADA di set,
TAPI ini String Python biasa dioper ke fungsi, bukan kategori
internal kita — aman dipakai sbg ARGUMEN section meski kategori kita
sendiri namanya `"atap_miring"`, sama persis pola Task 4 yang
`kategori="keramik_dinding"` tapi manggil
`section_for_category("finishing")`). `"pondasi_batu"` dan
`"aanstamping"` TIDAK ADA di kategori manapun yang sudah dikenal
(`_ARCHITECTURE_CATEGORIES`/`_MEP_CATEGORIES`/`_EARTHWORK_CATEGORIES`/
`known_tkg_categories()`) — **cek dulu daftar WBS yang tersedia**
(`paax_schemas.wbs`, fungsi `normalize_section`/`section_title`) dan
pilih section yang PALING MASUK AKAL (kandidat: "Tanah" krn pondasi batu
biasanya bagian pekerjaan pondasi/substruktur — TAPI keputusan akhir
serahkan ke penilaianmu setelah melihat daftar section yang benar-benar
ada, JANGAN memaksakan section yang tidak match kalau ternyata tidak
ada yang cocok — fallback `section_for_category(None)`/generik tetap
lebih baik drpd memaksakan section yang salah).

---

## 6. Test WAJIB (fixture sintetis BARU per kategori, TIDAK PERNAH
memanggil API Gemini sungguhan)

Perluas `tests/test_perception_ai_assist.py` (parametrized test yang
sudah ada dari Task 4 kemungkinan bisa langsung diperluas dgn menambah
case baru ke parameter list, CEK STRUKTUR TEST YANG ADA dulu):
- Tiap 4 kategori baru: usulan lengkap (required + optional kalau ada)
  diterima.
- `lantai`: usulan tanpa `lebar_pintu_total` (optional) tetap diterima.
- Tiap 4 kategori: field required hilang → seluruh usulan `None`.
- Minimal 1 kategori: field ADA tapi halusinasi → ditolak (reuse pola
  test Task 4 `rejects_hallucinated_optional_field`, cukup 1 contoh
  representatif utk kategori baru, tidak perlu 4x kalau logikanya generik
  & sudah teruji Task 4).
- Fast filter tanpa keyword kategori itu → `None`, tidak panggil client.

`tests/test_perception_bridging_arsitektur_area.py` (perluas file yang
sudah ada dari Task 4): 4 fungsi bridge baru, pola sama test Task 4
(tanpa usulan → review; field wajib hilang → review spesifik; lengkap →
payload PERSIS shape dgn list lain kosong, dihitung; tanpa client →
review). **Khusus `bridge_lantai`: assert payload SELALU mengandung
`"plin": True`** apa pun input suggestion-nya (buktikan §3.1 diterapkan
konsisten).

`tests/test_perception_consolidate.py`: minimal 1-2 test wiring end-to-
end utk kategori baru (kode/angka sintetis baru), + pastikan test lama
Task 1-4 tetap hijau (jangan sampai perubahan loop kategori di
`_apply_arsitektur_area_ai_assist` merusak kategori lama).

Jalankan SEMUA test document-intelligence + core-engine + packages/schemas
(tidak berubah, tapi verifikasi tetap) + apps/web (vitest+tsc) — laporkan
angka lengkap before/after.

---

## 7. Zod — TIDAK PERLU perubahan

`AiArsitekturAreaSuggestionSchema` (Task 4) SUDAH generik
(`fields: z.record(z.number())`) — kategori baru otomatis kompatibel,
TIDAK perlu skema Zod baru. Konfirmasi ini di report (jangan menambah
skema yang tidak perlu).

---

## 8. Laporan WAJIB — `report-remote/`, JANGAN hapus/timpa riwayat lama

Nama file baru: `report-remote/REPORT_TASK05_BRIDGING_ARSITEKTUR_SISA_SAYA_<tanggal>.md`.

Isi wajib: (1) kutipan PERSIS `PondasiBatu`/`PenutupLantai`/`AtapMiring`/
`Aanstamping` yang ditemukan (§1), (2) keputusan section WBS utk
`pondasi_batu`/`aanstamping` yang dipilih + alasannya (§5), (3) konfirmasi
`plin` SELALU `True` di payload `bridge_lantai` (§3.1, dgn bukti test),
(4) hasil test lengkap before/after, (5) daftar commit dgn output mentah
`git log`, (6) link PR (lanjutan PR #40, branch
`feat/x2-bridging-non-struktur-dinding-atap-kusen-mep`) + status, (7)
konfirmasi tidak ada `apps/web/**` tersentuh, tidak ada `Co-Authored-By`
di commit manapun, (8) **status akhir SELURUH `ArsitekturRequest`**: 7
dari 7 sub-domain sudah di-bridging (3 Task 4 + 4 task ini) — konfirmasi
tidak ada sub-domain arsitektur yang tersisa.

---

## 9. Pembagian kerja & larangan (sama seperti task sebelumnya)

- Branch: LANJUTKAN `feat/x2-bridging-non-struktur-dinding-atap-kusen-mep`
  (PR #40), JANGAN branch baru.
- Commit HANYA Saya, TANPA `Co-Authored-By`/signature AI apa pun.
- JANGAN merge sendiri.
- JANGAN sentuh `apps/web/**`, JANGAN ubah `app/takeoff/arsitektur.py`.
- JANGAN buat modul/parameter duplikat — REUSE `arsitektur_area_assist.py`/
  `bridging_arsitektur_area.py`/parameter `arsitektur_area_client` yang
  SUDAH ADA dari Task 4.

**SETELAH report selesai: BERHENTI.** Tidak ada task 6 yang menunggu.
