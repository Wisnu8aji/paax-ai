# PROMPT CODEX — Fase V+W: Normalisasi Kode Lintas-Halaman + Lapisan Item Pekerjaan (BOQ Grouping)

> Ditulis Claude, 2026-07-14, lanjutan langsung dari
> `docs/plans/PAAX_ANALISA_RAB_DARI_GAMBAR_BIG_PLAN_2026-07-13.md` (§1 peta
> fase, §4 ringkasan arah Fase V & W). Fase T/U/U-2 SUDAH selesai (dikerjakan
> Claude langsung) tapi **belum di-commit** — prompt ini menggabungkan dua
> tugas: (0) commit backlog yang sudah diverifikasi, (1) implementasi Fase V,
> (2) implementasi Fase W. Owner (Wisnu) sudah memberi **izin auto-run
> penuh** untuk tugas ini: Codex TIDAK perlu berhenti minta persetujuan
> manual di tiap langkah, termasuk untuk melakukan commit — jalankan sampai
> selesai atau sampai menemukan blocker nyata (test merah, ambiguitas
> arsitektural, atau menyentuh Aturan Emas).

---

## 0. WAJIB BACA DULU (jangan crawl repo di luar ini)

1. `docs/ai-map/START_HERE.md` → `docs/ai-map/STATE.md` (bagian "FASE T",
   "FASE U/U-2", dan "FASE S" paling atas) — status persis apa yang sudah
   diverifikasi tapi belum ter-commit.
2. `docs/plans/PAAX_ANALISA_RAB_DARI_GAMBAR_BIG_PLAN_2026-07-13.md` — §0.1
   (batasan Aturan Emas versi rencana ini, PENTING) dan §4 (ringkasan arah
   Fase V & W yang diperluas jadi spek konkret di prompt ini).
3. `CLAUDE.md` §1 (Aturan Emas) dan §9 (Pembagian Tugas Claude vs Codex) —
   §9 SEKARANG diperjelas lebih tegas oleh owner khusus untuk prompt ini,
   lihat §1 di bawah.
4. `AGENTS.md` §9 (Gerbang Review) — konstitusi kamu sendiri. Baca §1 di
   bawah untuk bagaimana izin auto-run owner berinteraksi dengan gerbang ini.
5. `services/document-intelligence/app/perception/consolidate.py` — modul
   yang disentuh Fase V (cari fungsi yang memanggil
   `registry.setdefault(...kode, ElementRegistryEntry(kode=...))`, saat ini
   ada 2 lokasi pemanggilan; nomor baris persis bisa bergeser sejak Fase
   U/U-2 menambah kode di atasnya — cari via isi fungsi, jangan asumsi nomor
   baris dari dokumen plan).
6. `services/core-engine/app/tkg/takeoff.py` — `TakeoffItem{kode, lantai,
   kategori, work_type, quantity, unit, ...}` (kelas didefinisikan sekitar
   baris 38) + `kategori_dari_kode()` (kamus prefiks kode → kategori
   struktural, sekitar baris 118-139).
7. `services/core-engine/app/rab/sections.py` — `WBS_SECTIONS` (7 seksi baku:
   I Persiapan, II Tanah, III Struktur, IV Arsitektur/Finishing, V MEP,
   VI Luar, VII Akhir) + `normalize_section()`. **Fase W WAJIB reuse
   kategori ini, jangan bikin taksonomi trade baru dari nol.**
8. `docs/BRAIN_ALIGNMENT.md` §4 — daftar rumus takeoff yang SUDAH ada
   (`app/takeoff/*`: tanah, dinding/finishing, arsitektur, besi/BBS) vs yang
   BELUM (dipakai Fase W untuk menandai `formula_status`).

---

## 1. Pembagian kerja — TEGAS, baca sebelum mulai

Owner memperjelas pembagian §9 CLAUDE.md/AGENTS.md khusus untuk task ini:

- **Codex (kamu) mengerjakan SEMUA hal berikut**: backend
  (`services/document-intelligence`, `services/core-engine`), data model
  (`packages/schemas` mirror Zod), arsitektur modul baru, dan seluruh test
  (pytest + vitest schema + `pnpm tsc --noEmit`).
- **Codex DILARANG KERAS menyentuh apa pun di `apps/web/src/components/**`
  atau `apps/web/src/app/**` (UI/frontend)** — itu murni domain Claude,
  bahkan kalau kamu melihat cara mudah untuk "sekalian" mewire endpoint baru
  ke komponen. Kalau Fase W menghasilkan endpoint baru yang butuh dipakai
  UI, cukup pastikan endpoint + tipe Zod-nya SIAP PAKAI dan sebutkan di
  laporan — **jangan** buat/ubah file komponen React apa pun.
  - Pengecualian sempit: `packages/schemas/src/index.ts` (tipe Zod) BUKAN
    UI, itu data-model — boleh & wajib kamu perbarui kalau ada bentuk
    response baru.
- **Commit git HANYA boleh dilakukan oleh Codex** — Claude tidak akan
  commit apa pun untuk bagian frontend yang nanti dikerjakannya terpisah
  (Fase Y, sesi lain, model `claude-sonnet-5` reasoning tinggi — di luar
  cakupan prompt ini, sekadar konteks).
- **Izin auto-run**: owner sudah menyetujui kamu jalan otomatis ujung ke
  ujung TERMASUK commit, tanpa berhenti minta konfirmasi tiap langkah kecil.
  **INI TIDAK MENGUBAH satu aturan keras `AGENTS.md` §9 (Gerbang Review):
  kerja di branch, push branch itu, buka PR — JANGAN merge ke `main`
  sendiri.** Izin auto-commit ≠ izin auto-merge; keduanya beda otorisasi.
  Kalau ternyata owner juga bermaksud mengizinkan merge otomatis, itu
  keputusan terpisah yang harus dikonfirmasi eksplisit olehnya, bukan
  diasumsikan dari prompt ini.
- Kalau di tengah jalan kamu menemukan keputusan yang menyentuh Aturan Emas
  (§1 CLAUDE.md) atau ambiguitas domain (mis. definisi kategori trade yang
  tidak jelas masuk seksi WBS mana) — **STOP, jangan menebak, catat di
  laporan sebagai pertanyaan terbuka untuk owner/Claude.**

---

## 2. STEP 0 — Commit backlog yang SUDAH diverifikasi (sebelum kerja baru)

Working tree saat ini di branch `fix/semarang-candidate-ranking-claude-direct`
berisi 3 kelompok pekerjaan yang SUDAH selesai & diverifikasi Claude langsung,
TAPI belum ter-commit (lihat `docs/ai-map/STATE.md`, bagian "FASE S", "FASE
T", "FASE U/U-2"):

1. **Fase S** — perbaikan ranking kandidat harga Semarang/Kejaksaan
   (`scripts/harga/kejaksaan_semarang_report.py`), beda domain (harga, bukan
   persepsi gambar) dari Fase T/U/U-2/V/W.
2. **Fase T** — AHSP auto-suggest (`app/mapping/takeoff_ahsp.py`, endpoint
   `/tkg/takeoff-ahsp-suggest`, Zod mirror, wiring `tkg-workspace.tsx`).
3. **Fase U/U-2** — perbaikan noise konsolidasi + gap page-type classifier
   (`consolidate.py`, `zone_classifier.py`).

### 2.1 Verifikasi dulu, JANGAN commit kalau merah

```powershell
cd services/core-engine && python -m pytest -q
# harapan: 279 passed (266 + 13 test_takeoff_ahsp.py)
cd ../document-intelligence && python -m pytest -q
# harapan: 136 passed, 5 skipped
cd ../../apps/web && pnpm vitest run && pnpm tsc --noEmit
# harapan: 47 passed, tsc exit 0
```

Kalau salah satu angka TIDAK cocok dengan yang diklaim di `STATE.md`: **STOP,
jangan commit, jangan "perbaiki" sendiri** — laporkan persis apa yang beda
(working tree mungkin sudah berubah sejak STATE.md ditulis). Ini bukan
tugasmu untuk didiagnosis dari nol; itu tugas Claude/owner.

### 2.2 Commit terpisah per konsern (Conventional Commits)

Buat **3 commit terpisah** (bukan 1 commit gabungan) karena 3 konsern ini
independen dan reviewer (owner) perlu bisa mundur salah satu tanpa
membatalkan yang lain:

1. `fix(pricing): perbaikan ranking kandidat harga Semarang/Kejaksaan` —
   file di `scripts/harga/` + `report/HARGA_KEJAKSAAN_SEMARANG_2026-07-11.md`
   (Fase S, lihat detail file yang berubah di `docs/ai-map/STATE.md` bagian
   Fase S).
2. `feat(core-engine): AHSP auto-suggest untuk takeoff (Fase T)` — file di
   `app/mapping/takeoff_ahsp.py`, endpoint terkait, `packages/schemas`,
   `apps/web/src/components/drawings/tkg-workspace.tsx` (Zod-only + wiring
   kecil yang SUDAH ditulis Claude, bukan kamu tulis ulang — kamu hanya
   commit apa yang ada), halaman `/rab` StatusPill.
3. `fix(document-intelligence): grid-conflict relatif + filter noise
   administratif + kategori page-type baru (Fase U/U-2)` — file di
   `app/perception/consolidate.py`, `zone_classifier.py`, test terkait.

Untuk isi pesan commit lengkap (badan pesan, angka test, detail teknis),
**gunakan teks yang SUDAH ditulis di `docs/ai-map/STATE.md`** pada masing-
masing bagian fase sebagai sumber — jangan mengarang detail baru, itu sudah
akurat karena ditulis oleh yang mengerjakan langsung.

### 2.3 Push & PR (branch existing, JANGAN branch baru untuk step ini)

```powershell
git push origin fix/semarang-candidate-ranking-claude-direct
gh pr create --base main --head fix/semarang-candidate-ranking-claude-direct --draft `
  --title "Fase S+T+U/U-2: harga ranking, AHSP auto-suggest, noise konsolidasi" `
  --body "Lihat docs/ai-map/STATE.md bagian Fase S/T/U/U-2 untuk detail lengkap tiap commit."
```

Cek dulu apakah ada PR lain yang masih open dari branch ini atau base yang
lebih baru (`gh pr list`) — kalau ada divergensi dengan `main`, JANGAN
force-push, laporkan ke owner.

---

## 3. STEP 1 — Fase V: Normalisasi kode lintas-halaman (deterministik)

### 3.1 Masalah nyata

`consolidate.py` membangun registry elemen dengan `registry.setdefault(kode,
...)` — ini **exact string match**. Gambar kerja nyata menulis kode elemen
yang sama dengan variasi: `K1`, `K-1`, `K 1`, `"KOLOM K1"`. Saat ini variasi
ini dianggap elemen BERBEDA, memecah registry yang seharusnya satu kode utuh.

### 3.2 Yang harus dibangun

- Fungsi normalisasi kode BARU (mis. `_normalize_kode(raw: str) -> str`),
  **regex/rule-based, BUKAN LLM** (konsisten §0.1 big-plan): buang spasi
  berlebih & tanda hubung di antara huruf-prefiks dan angka, uppercase,
  opsional buang kata generik tipe elemen ("KOLOM", "BALOK", "SLOOF", dst —
  ambil daftar dari `kategori_dari_kode()`/`_PREFIKS` di
  `services/core-engine/app/tkg/takeoff.py` supaya konsisten, jangan bikin
  daftar kedua yang bisa divergen).
- Registry key pakai kode HASIL NORMALISASI, tapi **kode ASLI (apa adanya
  dari gambar) tetap disimpan** di setiap `ElementInstanceRef`/entry untuk
  audit — jangan hilangkan data mentah demi normalisasi.
- Kalau normalisasi menyebabkan DUA kode yang owner anggap beda digabung
  tanpa sengaja (false-positive collapse) — itu risiko nyata, harus ada test
  yang sengaja mencoba kasus ambigu (mis. `"K1"` vs `"K11"` TIDAK boleh
  ketabrak jadi sama) untuk membuktikan regex tidak longgar.

### 3.3 Test wajib

- Fixture sintetis independen (§0.1, bukan PLHUT): elemen kode ditulis
  `"K1"`, `"K-1"`, `"K 1"`, `"KOLOM K1"` di sheet berbeda → assert semua
  masuk SATU `ElementRegistryEntry` dengan kode kanonik, kode asli tiap
  instance tetap tersimpan.
- Test negatif: `"K1"` vs `"K11"` vs `"K1A"` → assert TETAP entry terpisah
  (regex tidak boleh terlalu agresif memotong angka).
- Smoke PLHUT existing (fixture repo) → assert tidak ada regresi jumlah
  entry registry dibanding sebelum Fase V (kode PLHUT sudah konsisten, jadi
  angka before/after seharusnya SAMA — kalau berubah, itu tanda regex
  terlalu agresif, investigasi sebelum lapor selesai).

---

## 4. STEP 2 — Fase W: Lapisan Item Pekerjaan (BOQ grouping)

### 4.1 Tujuan

Modul baru yang mengelompokkan `ElementRegistryEntry` (document-intelligence,
hasil Fase V di atas) + `TakeoffItem` (core-engine, dipanggil via API yang
sudah ada — endpoint `/tkg/takeoff` atau `/tkg/takeoff-ahsp-suggest` dari
Fase T) menjadi baris **"item pekerjaan"** berkategori trade, siap jadi
bahan tampilan tabel RAB (dipakai UI-nya nanti oleh Claude di Fase Y — bukan
tugasmu di prompt ini).

### 4.2 Desain yang diminta

- Modul baru: `services/document-intelligence/app/perception/work_items.py`
  (atau lokasi lain yang lebih konsisten kalau kamu temukan pola serupa
  sudah ada — jelaskan alasan di laporan kalau pindah lokasi).
- **WAJIB reuse kategori WBS yang sudah ada** di
  `services/core-engine/app/rab/sections.py` (`WBS_SECTIONS` I-VII +
  `normalize_section()`) — jangan bikin taksonomi trade paralel yang baru.
  Petakan `TakeoffItem.kategori` (kolom/balok/sloof/plat/dst, dari
  `kategori_dari_kode()`) ke seksi WBS yang sesuai (biasanya seksi III
  Struktur untuk semua kategori struktural yang ada sekarang).
- Setiap baris hasil grouping punya field eksplisit `formula_status`:
  - `"dihitung"` — kalau kategori punya rumus takeoff yang SUDAH ada
    (`app/tkg/takeoff.py` dan/atau `app/takeoff/*` per
    `docs/BRAIN_ALIGNMENT.md` §4) dan volume berhasil dihitung.
  - `"belum_didukung"` — kalau kategori BELUM punya rumus (mis. sanitasi,
    drainase, sebagian MEP — cek `BRAIN_ALIGNMENT.md` §4 utk daftar gap
    nyata). **Baris ini TIDAK BOLEH diberi volume/angka apa pun** — cukup
    nama elemen/kode + kategori + status, agar user tahu item ini perlu
    input manual, bukan diabaikan diam-diam.
  - `"perlu_review"` — mapping ke rumus ada tapi input tidak lengkap
    (konsisten status `needs_review` yang sudah ada di `TakeoffItem`).
- Endpoint baru (ikuti konvensi path yang sudah ada, misalnya di bawah
  document-intelligence API atau core-engine `/tkg/*` — putuskan berdasar
  di mana `ElementRegistryEntry` benar-benar hidup, jangan duplikasi state
  antar service).
- Zod mirror di `packages/schemas/src/index.ts` untuk shape response baru,
  1:1 dengan Pydantic (Aturan Emas §1) — build ulang package
  (`pnpm build` di `packages/schemas`) setelah berubah.

### 4.3 Batasan tegas (Aturan Emas, ditegaskan lagi)

- Modul ini **HANYA mengelompokkan & memberi label status** — TIDAK PERNAH
  menghitung volume/HSP/subtotal sendiri. Semua angka volume tetap datang
  dari `TakeoffItem` (core-engine) apa adanya.
- **DILARANG mengarang volume** untuk kategori `"belum_didukung"` — godaan
  paling besar di sini adalah "kasih estimasi kasar biar tabelnya penuh".
  JANGAN. Kejujuran gap lebih penting daripada tabel yang terlihat lengkap
  (prinsip §0.1 & §18 filosofi proyek ini).
- Tidak mengubah `takeoff_tkg`, `search_ahsp`,
  `suggest_ahsp_for_takeoff`/`suggest_ahsp_for_item`, atau rumus apa pun di
  `app/takeoff/*` — modul Fase W hanya MEMAKAI hasilnya via pemanggilan API/
  fungsi yang sudah ada.

### 4.4 Test wajib

- Fixture sintetis: campuran elemen dengan kategori yang PUNYA rumus
  (kolom/balok/plat beton) dan kategori yang TIDAK (mis. kategori
  hipotetis/sanitasi) → assert baris pertama `formula_status: "dihitung"`
  dengan volume dari engine, baris kedua `formula_status: "belum_didukung"`
  TANPA volume.
  test perpanjang `test_perception_consolidate.py` (kalau logic tinggal di
  file itu) atau file test baru `test_perception_work_items.py`.
- Test mapping kategori → seksi WBS: assert kategori struktural yang sudah
  ada (kolom/balok/sloof/plat/ring_balok) semua ter-mapping ke seksi
  `"III"`, dan `normalize_section()` yang sudah ada TIDAK diduplikasi
  logicnya (dipanggil, bukan ditulis ulang).
- Test Zod↔Pydantic selaras (`pnpm run test:schemas` / test skema TS yang
  sudah ada di `packages/schemas`).

---

## 5. Verifikasi & Gerbang Review (WAJIB sebelum lapor selesai)

```powershell
cd services/core-engine && python -m pytest -q
cd ../document-intelligence && python -m pytest -q
cd ../../packages/schemas && pnpm build && pnpm test
cd ../../apps/web && pnpm vitest run && pnpm tsc --noEmit
```

Semua HARUS hijau (kecuali skip yang sudah dikenal, mis. butuh
`PAAX_PLHUT_PDF`). Kalau ada yang merah karena Fase V/W: perbaiki di branch
kerjamu sendiri. Kalau merah karena sesuatu yang TIDAK kamu sentuh: STOP,
laporkan, jangan perbaiki di luar scope.

**Branch untuk Fase V+W**: buat branch baru DARI branch
`fix/semarang-candidate-ranking-claude-direct` **setelah** commit di §2
selesai dan ter-push (supaya Fase V/W tidak tercampur histori commit dengan
backlog lama), misalnya `feat/gambar-rab-fase-v-w-normalisasi-work-items`.
Push branch itu, buka PR **draft** ke `main`, **JANGAN merge sendiri**
(lihat §1 soal batas izin auto-run).

---

## 6. Laporan WAJIB di folder `report/`

Setelah semua step selesai (atau berhenti karena blocker), buat file baru
`report/REPORT_FASE_V_W_CODEX_<tanggal-kamu-jalankan-ini>.md` (format nama
konsisten file report lain di folder ini, mis.
`REPORT_FASE_Q_R_TERAPKAN_HASIL_KEJAKSAAN_SEMARANG_CODEX_2026-07-11.md`).

Isi WAJIB (ikuti struktur laporan lain di `report/` sebagai contoh format):

1. **Ringkasan** — apa yang dikerjakan (Step 0 commit backlog, Fase V, Fase
   W), 2-3 kalimat.
2. **Step 0 — commit backlog**: 3 SHA commit, hasil verifikasi test SEBELUM
   commit (cocok/tidak dengan klaim STATE.md), link PR.
3. **Fase V — apa yang dibangun**: pendekatan normalisasi kode (regex
   persis apa), keputusan teknis (mis. daftar kata generik yang dibuang,
   dari mana sumbernya), hasil test before/after jumlah registry entry pada
   fixture PLHUT (harus sama; kalau beda, jelaskan kenapa).
4. **Fase W — apa yang dibangun**: lokasi modul baru, endpoint baru (path
   persis), daftar kategori yang ter-mapping ke `"dihitung"` vs
   `"belum_didukung"` (SPESIFIK per kategori, bukan cuma "sebagian
   didukung"), keputusan mapping ke seksi WBS.
5. **Hasil test lengkap**: angka pytest core-engine/document-intelligence,
   vitest web, status `pnpm tsc --noEmit`, status build `packages/schemas`.
6. **Yang MASIH pending/belum didukung** (jujur, jangan diklaim selesai
   kalau tidak): kategori trade mana yang belum ada rumus sama sekali (utk
   input Fase X nanti), keputusan arsitektural yang di-skip karena butuh
   owner, keterbatasan regex normalisasi Fase V (kalau ada kasus yang
   sengaja tidak ditangani).
7. **Commit SHA + link PR** untuk Fase V+W (branch baru §5), status
   (draft/ready for review), langkah yang owner perlu lakukan selanjutnya
   (review PR, keputusan yang di-STOP kalau ada).

---

## 7. Yang TIDAK boleh dilakukan (tegas)

- **JANGAN** menyentuh `apps/web/src/components/**` atau
  `apps/web/src/app/**` — domain Claude, bukan kamu, di prompt ini.
- **JANGAN** merge PR ke `main` sendiri, dengan alasan apa pun termasuk
  "biar cepat" — izin auto-run owner mencakup commit, TIDAK mencakup merge.
- **JANGAN** mengarang volume/formula untuk kategori yang belum punya rumus
  (Fase W §4.3).
- **JANGAN** mengganti taksonomi WBS yang sudah ada di `sections.py` dengan
  taksonomi baru — reuse.
- **JANGAN** mengubah rumus takeoff/AHSP-search/engine RAB yang sudah ada
  dan benar — Fase V/W murni lapisan structuring di atasnya.
- **JANGAN** mulai Fase X (ekspansi rumus, terlalu besar, perlu prompt
  terpisah per-trade) atau Fase Y (UI 1-tombol, itu tugas Claude) di sesi
  ini — di luar scope, akan menyebabkan overscope yang melanggar prinsip
  vertical-slice (`CLAUDE.md`/`AGENTS.md` §2).
- **JANGAN** commit kalau test merah tanpa penjelasan (§2.1, §5).
