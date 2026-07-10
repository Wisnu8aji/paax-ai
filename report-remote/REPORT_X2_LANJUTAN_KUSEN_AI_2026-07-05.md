# REPORT FASE X2 LANJUTAN — SLICE #5: JADWAL KUSEN PINTU/JENDELA (DIKERJAKAN LANGSUNG OLEH SAYA)

Tanggal eksekusi: 2026-07-05
Dikerjakan oleh: **Saya (saya-sonnet-5, reasoning tinggi)** — BUKAN Saya.
Bagian 3 dari rangkaian "v1.0 bridging non-struktur": dinding → atap → **kusen** → MEP.

> **KOREKSI POLA KERJA (ditambahkan 2026-07-05, setelah slice ini
> selesai).** Owner mengoreksi pola kerja rangkaian ini: mulai slice
> berikutnya (ai-orchestrator dst), Saya HANYA merancang — implementasi
> kode nyata WAJIB diserahkan ke Saya lewat prompt file. **Slice kusen ini
> SUDAH TERLANJUR diimplementasikan langsung oleh Saya SEBELUM koreksi
> ini dibuat, dan SUDAH SELESAI 100%** (bukan sebagian — 13 test lulus,
> lihat §5) — kerjanya TETAP DIPERTAHANKAN, tapi ini PENGECUALIAN, BUKAN
> pola yang akan diulang. Tidak ada commit dibuat.

## Ringkasan

Brain-v4.1 F-G11 eksplisit: "KUSEN/PINTU/JENDELA: per SCHEDULE". Bedanya
dari dinding (tidak ada tabel sama sekali) dan gording/dkk (kode sudah
dikenal taksonomi): kusen SEHARUSNYA punya tabel jadwal (tipe/ukuran/
jumlah), tapi `assemble.py::_classify_header` HANYA mengenali header tabel
struktur (kode/dimensi/tul_utama/sengkang/mutu) — tabel jadwal
pintu/jendela TIDAK match header manapun, jatuh sbg teks lepas.

**Risiko konkret yang dihindari sejak desain (bukan ditemukan pas
implementasi)**: kode tipe pintu/jendela sering pakai huruf depan "P"/"J"
(mis. "P1" utk Pintu 1) yang **BENTROK PERSIS** dgn prefiks "P" yang sudah
dipakai `paax_schemas.tkg_taxonomy.PREFIKS` utk `pondasi_telapak`. Karena
itu modul ini **TIDAK PERNAH** mengikat hasil ke `ElementRegistryEntry`
kode asli manapun — selalu entry SINTETIS berprefiks aman `KUSEN-AUTO-`
(diverifikasi eksplisit dgn test anti-tabrakan, §4).

Beda desain lain dari dinding/atap: jadwal kusen biasanya berisi BANYAK
BARIS (banyak tipe sekaligus) — modul ini mengembalikan LIST, dan **tiap
baris divalidasi INDEPENDEN** (baris gagal dibuang sendiri, tidak
menggagalkan baris lain yang valid — beda dari roof_frame yang
all-or-nothing per elemen).

## 1. Modul baru

- `ai_assist/kusen_assist.py` — `suggest_kusen_schedule(document_texts,
  client) -> list[AiKusenSuggestion]`. Fast filter keyword (PINTU/JENDELA/
  KUSEN/DAUN/JADWAL PINTU/JADWAL JENDELA/SCHEDULE). Validasi per baris:
  anti-halusinasi (source_texts + angka harus match teks asli), rentang
  wajar 0.3-6.0m per dimensi, qty 1-200, dan WAJIB punya width+height+qty
  lengkap (baris tanpa salah satu ditolak, bukan disimpan parsial).
- `bridging_kusen.py` — `KusenTakeoffClient`/`HttpKusenTakeoffClient`
  (stdlib `urllib.request`) + `bridge_kusen_schedule`. Default konservatif:
  `hitung_kusen_perimeter=True` (F-G11: "L = keliling"),
  `hitung_daun_area`/`hitung_kaca_area=False` (tidak diasumsikan tanpa
  bukti teks).

## 2. Schema baru

`AiKusenSuggestion` (tipe, width_m, height_m, qty, confidence, reasoning,
source_texts, model, generated_at) + field
`ElementRegistryEntry.ai_kusen_suggestion`. Zod mirror
`AiKusenSuggestionSchema`.

## 3. Wiring

- `consolidate.py::_apply_kusen_ai_assist` — scan dokumen-luas (sama pola
  dinding), TAPI bisa hasilkan **beberapa entry sintetis sekaligus**
  (`KUSEN-AUTO-{tipe}`, tipe disanitasi jadi A-Z0-9 saja).
- `work_items.py::_bridged_kusen_item` + parameter `kusen_client` di
  `build_work_items()`.
- `tkg_routes.py` — `HttpKusenTakeoffClient.from_env()`.

## 4. Test (13 test baru)

- `test_perception_ai_assist.py` (+6): multi-baris valid diterima; fast
  filter tanpa keyword tidak panggil client; **baris invalid dibuang
  sendiri, baris valid lain tetap lolos** (beda dari roof_frame); halusinasi
  ditolak; rentang tidak wajar ditolak; degradasi anggun.
- `test_perception_bridging_kusen.py` (+4, baru): tanpa usulan → review;
  usulan tidak lengkap → review spesifik; usulan lengkap → dihitung; tanpa
  client → review.
- `test_perception_consolidate.py` (+3, wiring penuh): **beberapa entry
  sekaligus** dari satu jadwal (P1 & J1); **test anti-tabrakan eksplisit**
  — elemen pondasi kode "P1" (nyata) dan tipe kusen "P1" (dari teks) HARUS
  jadi 2 entry terpisah (`P1` vs `KUSEN-AUTO-P1`), tidak tertukar; tanpa
  client tidak ada entry dibuat.

Catatan verifikasi: satu bug test ditemukan+diperbaiki SEBELUM lolos —
fixture awal salah campur notasi cm ("80X210") di teks dgn nilai meter
(0.8/2.1) di respons fake, validasi anti-halusinasi (BENAR) menolaknya
krn angka tidak match. Diperbaiki jadi notasi meter konsisten di teks
maupun respons.

## 5. Hasil verifikasi

```
services/document-intelligence : 217 passed, 5 skipped  (naik dari 204 — 13 test baru)
packages/schemas  pnpm build    : success
packages/schemas  pnpm test     : 12 passed
```
core-engine & apps/web tidak disentuh.

## 6. File yang diubah/ditambah

Baru: `ai_assist/kusen_assist.py`, `bridging_kusen.py`,
`tests/test_perception_bridging_kusen.py`, report ini.
Diubah: `consolidated_models.py`, `consolidate.py`, `work_items.py`,
`tkg_routes.py`, `tests/test_perception_ai_assist.py`,
`tests/test_perception_consolidate.py`, `packages/schemas/src/index.ts`.

## 7. Pending / gap jujur

- **`qty_counted`** (jumlah aktual di denah, vs `qty` jadwal) TIDAK
  diekstrak — butuh pencocokan SIMBOL pintu/jendela di gambar (bentuk
  grafis, bukan teks), itu vision/CV territory yang di luar cakupan slice
  berbasis-teks ini.
- **`hitung_daun_area`/`hitung_kaca_area`** selalu `False` (konservatif) —
  tidak pernah diaktifkan otomatis walau AHSP mungkin butuh itu.
- **Tabel jadwal terstruktur** (kolom TIPE/UKURAN/JUMLAH rapi) belum
  dikenali `assemble.py` sbg tipe tabel khusus — modul ini bekerja dari
  teks lepas (unclassified), bukan dari struktur tabel asli kalau ada.
- **Tidak ada commit.**

## 8. Lanjut ke slice berikutnya

Lanjut ke **MEP** (titik lampu/stop kontak/saklar — kategori terakhir
dalam rangkaian).
