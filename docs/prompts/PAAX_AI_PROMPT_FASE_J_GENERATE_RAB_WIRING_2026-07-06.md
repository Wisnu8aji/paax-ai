# PROMPT SAYA — Fase J/K/L: Nyalakan "Generate RAB" dari Hasil Analisis Gambar

> Ditulis Saya, 2026-07-06. **Ini BUKAN prompt commit-saja** seperti prompt
> sebelumnya — Anda (Saya) diminta **mengimplementasikan kode** untuk fase
> ini, bukan cuma commit hasil kerja Saya. Owner (Wisnu) sudah membaca
> laporan Fase 0-H (rencana besar gambar teknik sipil) dan sekarang minta
> lanjutan konkret: tombol **"Generate RAB"** yang selama ini disabled harus
> menjadi hidup, TANPA redesign visual besar (itu ditunda ke sesi terpisah
> dengan Opus 4.8 — jangan disentuh sama sekali di sini).
>
> **Bacaan wajib SEBELUM mulai coding** ada di §0 — jangan lewati, konteks
> tidak akan nyambung kalau langsung loncat ke §2 (tugas).

---

## 0. WAJIB BACA DULU (urutan disarankan)

Baca semua ini dulu supaya paham kenapa keputusan di §1/§2 diambil begitu,
bukan cuma "apa yang harus diketik":

1. **`SAYA.md`** (root repo) — terutama:
   - §1 **Aturan Emas**: AI/frontend TIDAK PERNAH menghitung angka RAB/HSP/
     volume final. Fase ini murni "wiring" — menyambungkan panggilan-panggilan
     engine yang SUDAH ADA dan SUDAH deterministik, TIDAK menambah rumus baru.
   - §9 **Pembagian tugas Saya vs Saya** dan **GERBANG REVIEW** (branch →
     PR, bukan langsung `main`) — lihat catatan penting di §5 prompt ini
     soal ini, karena sesi-sesi sebelumnya sempat kerja langsung di `main`
     atas izin eksplisit owner yang situasional, BUKAN aturan baru permanen.
2. **`docs/ai-map/START_HERE.md`** — peta orientasi, baca dulu supaya tahu
   file mana yang otoritatif untuk apa (hindari nebak-nebak).
3. **`docs/ai-map/STATE.md`** — cari bagian **"RENCANA BESAR GAMBAR KERJA —
   FASE 0-H SELESAI"**: rekap lengkap apa yang sudah dibangun sesi lalu (zone
   classifier, label→grid binding, konsolidasi lintas-halaman, async job,
   PaddleOCR nyata, UI Review Gambar) + angka test/cakupan final.
4. **`docs/plans/PAAX_GAMBAR_TEKNIK_SIPIL_BIG_PLAN_2026-07-05.md`** — living
   roadmap. Baca **§3** (tabel status fase, semua 🟢/🟡) dan **§5 "Setelah
   rencana ini"** — dokumen itu SUDAH menyebut duluan bahwa langkah
   berikutnya adalah "menyambungkan `ConsolidatedExtraction` ke alur Generate
   RAB nyata" — prompt ini adalah eksekusi dari poin itu.
5. **`docs/prompts/PAAX_SAYA_PROMPT_COMMIT_GAMBAR_TEKNIK_SIPIL_2026-07-05.md`**
   — prompt commit sebelumnya (SUDAH dieksekusi, sudah di-commit — cek
   `git log`: `067d711`/`fe6f014`/`5e44b4b` sudah ada di `main`). Baca untuk
   tahu APA yang sudah nyata ada di kode saat ini, jangan bangun ulang.
6. **`docs/pages/gambar-kerja.md`** — deskripsi fitur untuk end-user, biar
   paham istilah "Review Gambar" dipakai konsisten.
7. **`docs/specs/brain-v4.1/PAAX_BRAIN_00_EKSTRAKSI_GAMBAR_KERJA.txt`** §5
   (binding label→grid) dan §6.2 (takeoff dari TKG) — sumber rumus yang
   sudah diimplementasi di `services/core-engine/app/tkg/takeoff.py`
   (jangan diubah rumusnya, cukup paham konteksnya).

**Kode yang HARUS dibaca (bukan cuma docs) sebelum edit:**

| File | Kenapa penting |
|---|---|
| `apps/web/src/components/drawings/tkg-workspace.tsx` | File utama yang diedit — baca SELURUH file, jangan cuma bagian yang disebut di §2 |
| `apps/web/src/components/drawings/tkg-workspace.test.tsx` | Pola mock yang sudah ada (`@/lib/engine`, `rab-repository`, `tkg-repository`) — WAJIB dipakai ulang, jangan bikin pola mock baru |
| `apps/web/src/lib/ai/document-intelligence-tkg.ts` | `analyzeDrawingFileInBackground`, bentuk `DrawingIntakeResult` |
| `apps/web/src/lib/engine.ts` | Wrapper `validateTkg`/`renderTkg`/`takeoffTkg` — panggilan ke core-engine |
| `apps/web/src/lib/projects/rab-repository.ts` | `ProjectRabDraft`, `RabDraftLine`, `emptyRabLine`, `rabRepository.get/save` |
| `apps/web/src/lib/projects/tkg-repository.ts` | `ProjectTkgRecord`, `tkgRepository.get/save` |
| `apps/web/src/components/review/triage-panel.tsx` | Komponen yang sudah menampilkan item `needs_review` |
| `apps/web/src/app/(dashboard)/proyek/[projectId]/rab/page.tsx` | Halaman tujuan setelah "Generate RAB" — sudah ADA dropdown pemilihan kode AHSP (`ahspList`, baris ±359-366) |
| `services/core-engine/app/tkg/takeoff.py` | `takeoff_tkg()` — MESIN yang sudah menghasilkan `TakeoffItem[]` dari `TkgDocument`. **JANGAN diubah rumusnya di fase ini.** |
| `services/core-engine/app/mapping/ahsp_search.py` + `models.py` | `search_ahsp`/`map_workitem_to_ahsp` — HANYA relevan kalau Anda sampai ke Fase L (opsional, lihat §4) |
| `services/core-engine/app/main.py` | Daftar endpoint yang SUDAH ADA (`/tkg/takeoff`, `/ahsp/search`, `/ahsp/map`, `/rab/build`, dst.) — jangan bikin endpoint baru sebelum cek ini dulu, kemungkinan besar sudah ada. |
| `data/ahsp/cipta-karya.sample.json` | Katalog AHSP nyata di repo **HANYA 4 item** (bukan 2.542 item lengkap — itu ada di luar repo, `G:\paax-data`, belum diimpor). Penting untuk ekspektasi realistis di Fase L. |

---

## 1. Diagnosis — apa sebenarnya yang "belum selesai" (jangan asumsi, ini hasil investigasi nyata)

Investigasi kode (bukan tebakan) menemukan bahwa **infrastruktur takeoff→RAB
SUDAH ADA dan SUDAH JALAN** untuk alur lama (paste teks manual → "Proses
dengan AI" → `runAiExtract`). Yang BELUM tersambung adalah alur BARU (upload
PDF → "Analisa Gambar Kerja" → "Review Gambar"):

- `runAiExtract()` (tkg-workspace.tsx baris ±173-209) memanggil
  `runPipeline(next)` setelah menyimpan TKG hasil AI-dari-teks. `runPipeline`
  menjalankan **validate → render → takeoff** (baris ±150-171), mengisi
  state `takeoff`. Begitu `takeoff` terisi, `TriagePanel` DAN tombol
  **"Kirim Volume ke Draft RAB"** (baris ±654-663, handler `sendToRab`
  baris ±289-311) **otomatis muncul dan SUDAH BEKERJA**: filter item
  `!needs_review && quantity != null`, bikin `RabDraftLine[]` dengan
  `volume` terisi dan `ahsp_code: ''` (SENGAJA kosong — sudah ada komentar
  di kode: "mapping AHSP adalah keputusan user/AI terpisah"), simpan ke
  `rabRepository`.
- `usePerceptionAsTranscript()` (baris ±243-266) — dipanggil oleh tombol
  **"Simpan hasil analisis"** setelah upload PDF — **TIDAK memanggil
  `runPipeline`**. Ia hanya `tkgRepository.save({..., lastTakeoff: null})`
  lalu berhenti. Akibatnya state `takeoff` tetap `null`, `TriagePanel` dan
  tombol "Kirim Volume ke Draft RAB" TIDAK PERNAH muncul untuk alur PDF.
- Sebagai gantinya, ada tombol **disabled** terpisah "Generate RAB" (baris
  ±606-608) di dalam kartu "Review Gambar", sengaja dinonaktifkan sesi lalu
  dengan tooltip "Segera hadir — setelah hasil ekstraksi dikonfirmasi
  benar" — ini PLACEHOLDER yang dijanjikan ke owner, dan **inilah yang
  harus dinyalakan sekarang**.

**Kesimpulan penting**: ini BUKAN "bangun fitur RAB dari nol". ini adalah
**satu potongan pemanggilan yang hilang** (`usePerceptionAsTranscript` tidak
memicu `runPipeline`) plus konsolidasi UI (dua tombol "Generate RAB" yang
berbeda maksud harus jadi satu alur yang koheren). Jangan over-engineer.

---

## 2. FASE J (WAJIB) — Sambungkan alur PDF ke pipeline takeoff yang sudah ada

### 2.1 Perubahan inti

1. Ubah `usePerceptionAsTranscript` supaya, setelah `tkgRepository.save(...)`
   berhasil, ia **memanggil `runPipeline(next)`** — persis pola yang sudah
   dipakai `runAiExtract` (baris ±203: `await runPipeline(next)`). Update
   pesan `setInfo(...)` supaya menjelaskan proses lanjutan berjalan
   (mis. "Hasil analisis gambar tersimpan. Menjalankan validasi & hitung
   volume...").
2. **Putuskan nasib tombol disabled "Generate RAB" (baris ±606-608)** —
   pilih salah satu (dokumentasikan alasan singkat di commit message):
   - **Opsi A (disarankan, lebih sederhana)**: HAPUS tombol placeholder
     itu sepenuhnya. Begitu `usePerceptionAsTranscript` memicu takeoff,
     `TriagePanel` + tombol asli "Kirim Volume ke Draft RAB" (baris
     ±654-663) otomatis muncul di bawah kartu "Review Gambar" — itu SUDAH
     menjadi CTA "Generate RAB" yang diminta owner, tidak perlu duplikat.
   - **Opsi B**: ubah tombol itu jadi non-disabled, `onClick` memanggil
     `usePerceptionAsTranscript` lalu scroll halus (`scrollIntoView`) ke
     bagian hasil takeoff/RAB di bawah — kalau owner nanti minta 1-klik
     langsung dari kartu "Review Gambar" tanpa harus klik "Simpan hasil
     analisis" dulu.
   Pilih Opsi A kecuali Anda punya alasan kuat memilih B — Opsi A lebih
   sedikit state/kompleksitas UI, konsisten dgn instruksi "tanpa redesign
   visual besar" (mengubah teks tombol jadi lebih sederhana daripada
   menambah logic baru).
3. **JANGAN ubah** `sendToRab`, `TriagePanel`, atau format `RabDraftLine`
   yang sudah ada — itu SUDAH benar dan sudah dites. Fase ini murni
   memastikan alur PDF memicu hal yang sama seperti alur teks.
4. Cek `statusText` (baris ±368-374) — pastikan copy-nya tetap masuk akal
   untuk kondisi baru (mis. saat `perceptionReview` masih ada TAPI takeoff
   sudah selesai jalan di background setelah tombol simpan diklik).

### 2.2 Test (WAJIB, ikuti pola yang sudah ada di `tkg-workspace.test.tsx`)

File test sudah mock `@/lib/engine` (`renderTkg`/`takeoffTkg`/`validateTkg`),
`@/lib/projects/rab-repository`, `@/lib/projects/tkg-repository`,
`@/lib/ai/document-intelligence-tkg`. **Pakai ulang pola ini**, jangan bikin
setup mock baru. Tambahkan minimal:

1. Test: setelah upload PDF (mock `analyzeDrawingFileInBackgroundMock`
   resolve dengan `DrawingIntakeResult` yang valid) → klik "Simpan hasil
   analisis" → assert `validateTkg`/`renderTkg`/`takeoffTkg` (mock) TERPANGGIL
   dengan `tkg` yang benar.
2. Test: setelah takeoff mock resolve dengan `TakeoffResult` berisi item
   valid (`needs_review: false, quantity: <angka>`) → assert tombol "Kirim
   Volume ke Draft RAB" muncul → klik → assert `rabRepository.save`
   terpanggil dengan `lines` yang punya `volume` sesuai & `ahsp_code: ''`.
3. Test regresi: alur teks lama (`runAiExtract`/"Proses dengan AI") masih
   berfungsi PERSIS seperti sebelumnya — tidak boleh ada perubahan perilaku
   di jalur itu.
4. Kalau memilih Opsi A (hapus tombol placeholder): pastikan tidak ada test
   lama yang masih mencari teks "Segera hadir" (`grep` dulu sebelum hapus).

### 2.3 Verifikasi live browser (WAJIB — ini perubahan UI-observable)

Gunakan `preview_start`/`preview_eval`/`preview_snapshot`/`preview_network`
(bukan cuma vitest): upload PDF sintetis (boleh reuse fixture generator dari
sesi lalu atau bikin PDF sederhana baru via PyMuPDF/fitz) → klik "Analisa
Gambar Kerja" → tunggu job selesai → klik "Simpan hasil analisis" → **cek
tanpa reload**: `TriagePanel`/tombol "Kirim Volume ke Draft RAB" muncul →
klik tombol itu → buka halaman `/proyek/{projectId}/rab` → cek baris baru
muncul dengan volume benar & kolom kode AHSP kosong siap dipilih manual.
Screenshot/`preview_snapshot` sebagai bukti, bukan klaim.

---

## 3. FASE K (disarankan, jalan setelah Fase J hijau) — Validator selaras pipeline baru

`docs/plans/PAAX_GAMBAR_TEKNIK_SIPIL_BIG_PLAN_2026-07-05.md` §5 mencatat
gap ini sebagai arah berikutnya: validator `services/core-engine/app/
tkg/validate.py` (V-02..V-08, brain TXT00 §7) belum diuji ulang secara
eksplisit terhadap `TkgDocument` yang punya field BARU dari Fase B/C/E sesi
lalu (`SheetMeta.zone`, `ElementInstance.alamat_list`/`alamat_needs_review`).

- Baca `validate.py` + `docs/specs/brain-v4.1/PAAX_BRAIN_00_EKSTRAKSI_GAMBAR_KERJA.txt`
  §7 untuk definisi tiap kode validator.
- Tulis test yang membuktikan validator TIDAK false-negative (tidak
  melewatkan masalah nyata) ATAU false-positive (tidak menandai error pada
  data yang sebetulnya valid) ketika diberi `TkgDocument` yang mengandung
  `alamat` hasil binding baru (mis. notasi `"B-offset_sebelum_1"`) — cek
  apakah validator manapun mem-parsing field `alamat` dengan asumsi format
  lama yang sekarang sudah berubah bentuknya.
- Kalau ditemukan validator yang perlu logika baru (bukan cuma test) untuk
  memahami notasi offset baru: itu MASIH boleh dikerjakan (murni
  klasifikasi/validasi, bukan angka RAB — tidak melanggar Aturan Emas) TAPI
  kalau perubahan itu menyentuh cara suatu ANGKA (volume/HSP) dihitung,
  **STOP, laporkan ke owner dulu** sebelum lanjut (lihat SAYA.md §9).

---

## 4. FASE L (OPSIONAL, hanya jika J+K sudah hijau semua & waktu masih ada) —
Usulan kode AHSP otomatis (auto-suggest, BUKAN auto-final)

Ini **stretch goal**, tidak wajib. `RabDraftLine.ahsp_code` sengaja kosong
di Fase J (keputusan desain yang sudah ada di kode) supaya user memilih
manual dari dropdown yang sudah ada di halaman `/rab`. Fase L ini
menambahkan **usulan** kode AHSP (bukan keputusan final) memakai endpoint
yang **SUDAH ADA** di core-engine: `POST /ahsp/search` dan `POST /ahsp/map`
(`app/mapping/ahsp_search.py` — token-overlap, 100% deterministik, BUKAN
LLM, JANGAN diubah jadi LLM).

### 4.1 Batasan keras kalau Anda mengerjakan ini

- **Auto-select HANYA kalau confidence tinggi** (mis. skor kandidat teratas
  jauh di atas kandidat kedua DAN `unit_ok=true`) — kalau ambigu, JANGAN
  menebak, biarkan `ahsp_code` kosong seperti sekarang (fallback manual
  tetap harus ada — SAYA.md §2: "Setiap fitur AI baru WAJIB punya
  fallback manual").
- Kode yang terisi otomatis **HARUS ditandai sebagai usulan**, tidak pernah
  disamakan dengan pilihan manual pengguna — mis. tambah field
  `suggested?: boolean` di baris draft (kalau menambah field baru di
  `RabDraftLine`, cek dulu apakah perlu mirror ke `packages/schemas` Zod;
  saat ini `RabDraftLine` di `rab-repository.ts` adalah TS biasa bukan Zod,
  jadi tidak wajib, tapi tetap jaga konsisten dengan pola `AssumptionSchema`
  TERBACA/PERLU-REVIEW yang sudah dipakai di seluruh pipeline ini).
- **Ekspektasi realistis**: katalog AHSP nyata di repo (`data/ahsp/
  cipta-karya.sample.json`) HANYA punya 4 item (dinding, plesteran, beton
  K-175, keramik). Katalog resmi 2.542 item (per catatan sebelumnya) ADA
  di luar repo (`G:\paax-data`) dan **belum diimpor** — itu gap terpisah,
  BUKAN bagian tugas ini. Artinya di lingkungan sekarang, hampir semua item
  takeoff (kolom/sloof/balok/besi) TIDAK akan menemukan AHSP yang cocok —
  ini **BENAR dan DIHARAPKAN**, bukan bug. Jangan mengarang skor tinggi
  demi terlihat "berhasil".
- **Anchor manual yang WAJIB diverifikasi** (contoh nyata, hitung tangan
  memakai rumus `score = overlap/union + (0.25 kalau unit cocok)` dari
  `ahsp_search.py`): query `"beton kolom"` (tokens `{beton, kolom}`) vs
  item `AHSP.CK.003 "Beton mutu f'c = 14.5 MPa (setara K-175)"` (tokens
  `{beton, mutu, f, c, 14, 5, mpa, setara, k, 175}`, 10 token) → overlap=1
  (`beton`), union=11 → skor token = 1/11 ≈ 0.0909; kalau unit query "m3"
  = unit item "m3" → +0.25 → **skor akhir ≈ 0.3409**. Item lain di katalog
  sample (dinding/plesteran/keramik, semua unit "m2") akan dapat overlap=0
  DAN `unit_ok=false` → skor 0. Jadi kandidat teratas akan `AHSP.CK.003`
  dengan margin besar (0.34 vs 0.0) — kasus ini SEHARUSNYA auto-select
  kalau threshold Anda masuk akal. Pakai contoh ini sebagai salah satu test
  wajib, HITUNG ULANG SENDIRI angkanya sebelum menulis assert (jangan
  copy-paste angka di atas tanpa verifikasi — itu aturan §0.1/metodologi
  sesi-sesi sebelumnya: verifikasi manual dulu, baru jadi assert).
- **Wajib juga fixture sintetis lebih kaya** (bukan cuma katalog sample 4
  item) — buat katalog AHSP uji lokal (dict Python biasa di test, TIDAK
  perlu file baru di `data/ahsp/`) berisi ~10-15 item yang mencakup kolom,
  sloof, balok, pelat, pondasi telapak, bekisting (per kategori), besi
  beton — supaya pipeline mapping terbukti general, bukan cuma kebetulan
  benar di katalog sample yang sangat kecil (pola §0.1 "fixture bukan
  template" yang sama, diterapkan ke data AHSP).
- Endpoint BARU (kalau perlu) sebaiknya di `services/core-engine` (compose
  `takeoff_tkg` + `map_workitem_to_ahsp`, tetap 100% Python deterministik)
  — JANGAN taruh logic pemilihan kandidat di frontend TypeScript (itu
  pelanggaran Aturan Emas kalau logic keputusan/skoring ada di client).

---

## 5. GERBANG REVIEW — branch & PR (default kembali berlaku, BUKAN main langsung)

Working tree sekarang bersih di `main` (sudah termasuk commit `067d711`/
`fe6f014`/`5e44b4b` dari sesi lalu). **Izin kerja-langsung-di-`main` sesi
sebelumnya adalah keputusan situasional/eksplisit owner untuk pekerjaan itu
saja** — BUKAN perubahan permanen ke aturan gerbang review SAYA.md §9.
Untuk pekerjaan Fase J/K/L ini:

```
git checkout -b feat/gambar-generate-rab-wiring
```

Kerjakan semua fase di branch ini, commit dengan conventional commits
(`feat:`/`test:`/`fix:`), lalu **buka PR ke `main`** (`gh pr create`),
JANGAN merge sendiri — PR menunggu review owner + Saya dulu, sesuai
gerbang review yang berlaku baku di repo ini. Kalau owner secara eksplisit
minta kerja langsung di `main` lagi untuk tugas ini, itu instruksi baru
yang harus diminta ulang — jangan diasumsikan otomatis berlaku dari sesi
sebelumnya.

---

## 6. Verifikasi WAJIB sebelum membuka PR

```powershell
cd apps/web
pnpm vitest run
pnpm tsc --noEmit

cd ../../services/core-engine
python -m pytest -q
# harapan: tetap 238 passed kalau Fase J/K tidak mengubah core-engine,
# atau lebih banyak (hijau semua) kalau Fase K/L menambah test baru.

cd ../document-intelligence
python -m pytest -q
# harapan: tetap 131 passed (130+1 skip) — service ini semestinya TIDAK
# disentuh fase ini (Fase J/K/L semuanya di apps/web + core-engine).
```

Kalau ada yang merah dan Anda tidak yakin penyebabnya bukan dari perubahan
Anda: **STOP, laporkan ke owner**, jangan menebak perbaikan pada kode yang
bukan bagian tugas ini.

---

## 7. Batasan tegas (rangkuman, jangan dilanggar)

- **TIDAK ADA redesign visual** — pakai ulang `Button`/`Card`/`StatusPill`/
  style inline yang SUDAH ada di `tkg-workspace.tsx`. Jangan ubah warna,
  jangan ubah layout besar, jangan tambah library UI baru.
- **TIDAK ADA LLM** di jalur mapping/takeoff — `/ahsp/search`, `/ahsp/map`,
  `takeoff_tkg` semuanya tetap deterministik/rule-based seperti sekarang.
- **TIDAK mengubah rumus** di `services/core-engine/app/tkg/takeoff.py`
  (F-B/F-C/F-D) — kalau menemukan bug rumus, STOP dan laporkan (SAYA.md
  §9: perubahan yang menyentuh angka RAB perlu spek Saya dulu).
- **TIDAK mengarang skor/coverage AHSP** — sudah dijelaskan panjang di §4,
  katalog sample cuma 4 item, itu batas jujur, jangan ditutup-tutupi.
- **Fase D (deteksi simbol grafis) dan Vision-LLM fallback TETAP di luar
  cakupan** — itu arah masa depan terpisah, jangan dikerjakan di prompt ini.
- **Boleh jalan berurutan J → K → (L kalau sempat) tanpa berhenti minta
  izin di antaranya**, tapi WAJIB berhenti & lapor kalau menemukan
  ambiguitas arsitektural sungguhan atau kegagalan test yang tidak bisa
  dijelaskan dari perubahan sendiri.

---

## 8. Setelah selesai — laporkan ke owner

1. Nama branch + link PR.
2. Fase mana saja yang selesai (J wajib; K/L kalau sempat) + fase mana yang
   di-skip dan kenapa.
3. Hasil test (angka pass/fail tiap service) + hasil verifikasi browser
   (ringkas, bukan dump log penuh).
4. Kalau Opsi A/B (§2.1 poin 2) dipilih — sebutkan mana yang dipilih & alasannya.
5. Temuan jujur apa pun (mis. validator yang ternyata perlu perbaikan lebih
   dalam, atau AHSP mapping yang hasilnya rendah karena katalog kecil) —
   catat sebagai temuan, jangan disembunyikan demi laporan terlihat mulus.
