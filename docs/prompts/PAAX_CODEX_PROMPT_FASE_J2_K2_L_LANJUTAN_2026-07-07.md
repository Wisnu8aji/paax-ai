# PROMPT CODEX — Lanjutan: Navigasi RAB, Audit Validator Penuh, AHSP Auto-Suggest

> Ditulis Claude, 2026-07-07. Ini lanjutan dari
> `docs/prompts/PAAX_CODEX_PROMPT_FASE_J_GENERATE_RAB_WIRING_2026-07-06.md`
> (Fase J/K sudah dikerjakan Codex di PR #29, sudah diverifikasi ulang oleh
> Claude — lihat `report/REPORT_FASE_J_GENERATE_RAB_WIRING_CODEX_2026-07-06.md`).
> Prompt ini mengerjakan **sisa gap** yang tersisa dari rencana besar +
> permintaan awal owner yang belum tuntas. Sama seperti sebelumnya: Anda
> (Codex) **mengimplementasikan**, bukan cuma commit.

---

## 0. WAJIB BACA DULU

1. **`CLAUDE.md`** — Aturan Emas §1, pembagian tugas Claude/Codex §9, gerbang
   review (branch → PR, bukan `main` langsung).
2. **`docs/ai-map/STATE.md`** — status terkini, cari bagian Fase 0-H dan J/K.
3. **`docs/plans/PAAX_GAMBAR_TEKNIK_SIPIL_BIG_PLAN_2026-07-05.md`** §3 (tabel
   fase) dan §5 ("Setelah rencana ini") — sumber gap yang dikerjakan di sini.
4. **`docs/prompts/PAAX_CODEX_PROMPT_FASE_J_GENERATE_RAB_WIRING_2026-07-06.md`**
   — prompt sebelumnya. **§4 dokumen itu (spesifikasi Fase L / AHSP
   auto-suggest) WAJIB dibaca penuh** — prompt ini TIDAK mengulang semua
   detailnya, hanya merujuk + menegaskan ulang batasan kerasnya di §4 di bawah.
5. **`report/REPORT_FASE_J_GENERATE_RAB_WIRING_CODEX_2026-07-06.md`** — apa
   yang sudah nyata dikerjakan & diverifikasi (240 core-engine, 45 web, dst).
6. **`docs/pages/gambar-kerja.md`** — deskripsi alur end-user terkini.
7. **`docs/specs/brain-v4.1/PAAX_BRAIN_00_EKSTRAKSI_GAMBAR_KERJA.txt`** §7
   (definisi V-01..V-10) — untuk Fase K-2.

**Kode yang harus dibaca sebelum edit:**

| File | Kenapa |
|---|---|
| `apps/web/src/components/drawings/tkg-workspace.tsx` | `sendToRab` (±baris 290-311), akan ditambah navigasi |
| `apps/web/src/app/(dashboard)/proyek/[projectId]/rab/page.tsx` | Tujuan navigasi; sudah punya dropdown pilih kode AHSP (`ahspList`) |
| `apps/web/src/app/(dashboard)/proyek/page.tsx` atau `dashboard/page.tsx` | Contoh pola `useRouter`/`router.push` yang SUDAH dipakai di codebase — pakai ulang pola ini, jangan improvisasi pola baru |
| `services/core-engine/app/tkg/validate.py` | Semua definisi V-02/V-03/V-04/V-05/V-08 — **baca komentar baris 11-13**: V-01/V-06/V-09/V-10 memang belum dievaluasi di jalur ini, itu bukan bug, itu keterbatasan yang sudah didokumentasikan |
| `services/document-intelligence/app/perception/consolidate.py` | fungsi `_grid_conflicts` — sudah ada mekanisme sendiri utk grid antar-sheet yang beda (ditandai assumption, BUKAN error) — relevan utk Fase K-2 §3 |
| `services/core-engine/tests/test_tkg.py` | Test yang sudah ada, termasuk 2 test baru dari Fase K — pola `buat_tkg()` helper WAJIB dipakai ulang |
| `services/core-engine/app/mapping/ahsp_search.py` + `models.py` | Untuk Fase L (opsional) |
| `data/ahsp/cipta-karya.sample.json` | Katalog AHSP nyata di repo — **masih cuma 4 item**, konteks penting utk Fase L |

---

## 1. Prasyarat — cek dulu status PR #29 sebelum mulai

```
git fetch origin
git log origin/main -3
```

- **Kalau PR #29 SUDAH di-merge ke `main`**: branch dari `main` seperti biasa.
- **Kalau BELUM di-merge**: branch dari `origin/feat/gambar-generate-rab-wiring`
  (bukan `main`) — pekerjaan ini butuh perubahan Fase J (auto-run pipeline
  setelah "Simpan hasil analisis") sudah ada di working tree, kalau tidak
  Anda akan bekerja di atas kode yang sudah usang. **Jangan menebak** —
  cek nyata dengan `git log --oneline --all | grep -i "wire drawing takeoff"`
  atau lihat apakah `usePerceptionAsTranscript` sudah memanggil `runPipeline`.

```
git checkout -b feat/rab-nav-validator-audit-ahsp-suggest <base-yang-benar>
```

---

## 2. Konteks — apa yang SUDAH selesai vs yang masih bolong

Dari permintaan awal owner (drag-drop, sembunyikan istilah teknis, grid
addressing, konsolidasi lintas-halaman, proses di latar belakang, animasi
thinking, tombol Generate RAB di bawah preview) — **semua sudah selesai**
KECUALI pengalaman "satu alur mulus" dari klik "Kirim Volume ke Draft RAB"
sampai user benar-benar melihat draft RAB-nya: saat ini user harus pindah
halaman SENDIRI secara manual ke `/proyek/{id}/rab`. Itu Fase J-2 di bawah.

Dari `docs/plans/.../BIG_PLAN_2026-07-05.md` §5 ("setelah rencana ini"),
2 item masih terbuka:
1. Validator V-02/V-03/V-04/V-05/V-08 **belum diaudit penuh** terhadap
   bentuk `TkgDocument` nyata dari pipeline gambar baru (Fase K sesi lalu
   hanya membuktikan field baru TIDAK mengganggu — bukan audit menyeluruh
   apakah validator lama masih masuk akal untuk kasus multi-sheet nyata).
   Ini Fase K-2 di bawah.
2. AHSP auto-suggest (Fase L) — sudah dispek lengkap di prompt sebelumnya
   §4, sengaja di-skip kemarin. Masih opsional/stretch di sini juga.

**Yang TIDAK termasuk di prompt ini** (jangan dikerjakan, tetap di luar
cakupan seperti sebelumnya): deteksi simbol grafis (Fase D), vision-LLM
fallback untuk sheet raster, impor katalog AHSP 2.542-item penuh (itu kerja
DATA yang jadi tanggung jawab Claude per CLAUDE.md §9, bukan Codex — kalau
Anda merasa AHSP auto-suggest tidak berguna karena katalog kecil, itu
BENAR dan sudah diketahui, laporkan saja, jangan mencoba mengimpor data
AHSP baru sendiri), dan redesign visual (masih ditunda ke sesi terpisah).

---

## 3. FASE J-2 (WAJIB, kecil) — navigasi ke halaman RAB setelah kirim volume

Setelah `sendToRab` (`tkg-workspace.tsx` ±baris 289-311) berhasil menyimpan
draft, user saat ini hanya melihat teks info "N baris volume terkirim..."
lalu harus mencari sendiri menu ke halaman RAB proyek. Tambahkan navigasi:

1. Import `useRouter` dari `next/navigation` (pola SUDAH dipakai di
   `app/(dashboard)/proyek/page.tsx` — pakai ulang persis).
2. Setelah `rabRepository.save(...)` sukses di `sendToRab`, panggil
   `router.push(`/proyek/${projectId}/rab`)` — **TAPI** beri jeda supaya
   user sempat baca pesan info dulu (mis. `setInfo(...)` render dulu, baru
   navigasi setelah user klik tombol kedua "Lihat Draft RAB", BUKAN auto-
   redirect instan tanpa peringatan — auto-redirect instan setelah async
   action bisa terasa mengagetkan/kehilangan konteks bagi user). **Pilihan
   desain yang disarankan**: ubah tombol jadi dua-tahap sederhana — setelah
   `sendToRab` sukses, tampilkan tombol baru "Lihat Draft RAB" (memakai
   komponen `Button` yang sudah ada, TIDAK perlu style baru) di sebelah
   info sukses, `onClick` memanggil `router.push(...)`. Ini konsisten dgn
   instruksi "tanpa redesign visual besar" (nambah 1 button pakai komponen
   yang sudah ada, bukan bikin modal/toast baru).
3. Test: setelah klik "Kirim Volume ke Draft RAB" sukses, assert tombol
   "Lihat Draft RAB" muncul; klik itu → assert `router.push` (mock
   `next/navigation`, pola sudah ada di test file lain di repo — cek
   `apps/web/src/app/(dashboard)/proyek/page.tsx` punya test-nya atau tidak
   utk pola mock yang konsisten) terpanggil dengan path yang benar.
4. Verifikasi live browser: ulangi alur upload PDF → analisa → simpan →
   kirim volume → klik "Lihat Draft RAB" → confirm benar-benar pindah ke
   `/proyek/{id}/rab` dan baris volume ada di sana (regresi-check dari
   Fase J kemarin, sekaligus verifikasi navigasi barunya).

---

## 4. FASE K-2 (disarankan) — audit V-02/V-03/V-04 vs realita multi-sheet

**Kekhawatiran konkret yang harus Anda buktikan benar/salah** (bukan
tebakan, ini pertanyaan investigatif nyata): `validate_tkg` V-03
(`_grid_fingerprint`, `validate.py` baris 54-60 & 96-102) menandai **ERROR**
kalau sidik jari grid berbeda antar sheet berjenis "denah". Tapi
`services/document-intelligence/app/perception/consolidate.py` fungsi
`_grid_conflicts` justru menganggap grid antar-sheet yang beda sebagai
**assumption/needs_review** (bukan error keras) — karena kenyataannya sheet
denah pondasi vs denah atap pada gambar kerja NYATA sering menampilkan
subset grid yang berbeda (mis. sheet atap tidak menggambar ulang semua as
yang ada di sheet pondasi). **Pertanyaan yang harus Anda jawab dengan
test nyata**: kalau `TkgDocument` hasil pipeline gambar (bukan hasil tempel
teks manual) dari 2+ sheet dengan grid yang SAH tapi berbeda subset-nya
dikirim ke `/tkg/validate`, apakah V-03 salah-tandai jadi `E-GRID` padahal
seharusnya bukan error (false positive)?

- Bangun fixture sintetis 2 sheet "denah" dengan grid yang **valid tapi
  beda cakupan** (mis. sheet 1 as A-D, sheet 2 cuma as B-C — subset sah,
  bukan salah baca) — gunakan pola `buat_tkg()` di `test_tkg.py` sebagai
  basis, JANGAN bikin helper baru yang duplikat.
- Kalau ternyata V-03 SALAH menandai kasus ini sebagai error (false
  positive): ini temuan penting, JANGAN diam-diam "diperbaiki" dengan
  mengubah rumus/logic V-03 tanpa lapor dulu — ini menyentuh
  `gate_passed` yang memengaruhi apakah user bisa lanjut ke takeoff, jadi
  termasuk kategori CLAUDE.md §9 (perlu spek Claude dulu kalau memang mau
  diubah). **Tulis temuan ini di laporan akhir, tandai perlu keputusan
  Claude/owner, JANGAN diubah sendiri.**
- Kalau ternyata V-03 SUDAH benar (tidak false positive, karena ternyata
  scope-nya memang hanya membandingkan bentang yang sama-sama ada, bukan
  seluruh grid) — cukup tambahkan test yang MEMBUKTIKAN itu (assert
  `gate_passed is True` untuk kasus subset-grid-berbeda-tapi-sah), sebagai
  dokumentasi hidup bahwa ini sudah aman.
- Test serupa untuk V-02 (Σ bentang = total, per sheet) dan V-04 (orphan
  type/instance lintas sheet) memakai bentuk data yang REALISTIS dari
  pipeline gambar (elemen dengan `alamat` notasi offset, `zone` terisi,
  bukan cuma data lama polos) — pastikan tidak ada asumsi diam-diam yang
  ternyata salah saat field baru ada.
- Semua test baru masuk `services/core-engine/tests/test_tkg.py`,
  reuse `buat_tkg()`.

---

## 5. FASE L (OPSIONAL, hanya jika J-2 & K-2 sudah hijau & masih ada waktu)

**Baca `docs/prompts/PAAX_CODEX_PROMPT_FASE_J_GENERATE_RAB_WIRING_2026-07-06.md`
§4 secara PENUH sebelum mengerjakan ini** — semua batasan di sana tetap
berlaku, tidak diulang detail di sini. Ringkasan batasan keras (WAJIB
dipatuhi, bukan opsional):

- Auto-select HANYA kalau margin skor kandidat teratas jelas jauh di atas
  kandidat kedua DAN `unit_ok=true` — kalau ambigu, biarkan `ahsp_code`
  kosong (fallback manual tetap wajib ada).
- Kode yang terisi otomatis WAJIB ditandai sebagai **usulan**, tidak pernah
  disamakan dengan pilihan manual user.
- Katalog AHSP nyata di repo cuma 4 item — WAJIB uji juga dengan fixture
  AHSP sintetis ~10-15 item (bukan cuma katalog sample), supaya pipeline
  terbukti general bukan kebetulan.
- Anchor manual WAJIB dihitung ulang sendiri sebelum jadi assert (jangan
  copy angka dari prompt lama tanpa verifikasi ulang) — metodologi §0.1
  "fixture bukan template" berlaku juga untuk data AHSP.
- Logic pemilihan/skoring kandidat TETAP di Python (core-engine), TIDAK
  pernah di frontend TypeScript.
- 100% deterministik, TIDAK ADA LLM di jalur ini.

Kalau setelah membaca ulang §4 prompt lama Anda merasa risiko "menyesatkan
user dengan sugesti kosong/salah karena katalog terlalu kecil" > manfaatnya
untuk saat ini — **boleh skip lagi dengan alasan yang sama seperti kemarin**,
itu keputusan yang sah, bukan kegagalan. Jangan dipaksakan demi checklist.

---

## 6. GERBANG REVIEW — branch & PR (tetap berlaku)

Sama seperti prompt sebelumnya: kerjakan di branch baru (lihat §1), buka PR
ke `main`, JANGAN merge sendiri. PR menunggu review owner + Claude.

---

## 7. Verifikasi WAJIB sebelum membuka PR

```powershell
cd apps/web
pnpm vitest run
pnpm tsc --noEmit

cd ../../services/core-engine
python -m pytest -q
# harapan: >= 240 passed (naik kalau Fase K-2/L menambah test)

cd ../document-intelligence
python -m pytest -q
# harapan: TIDAK berubah dari baseline sesi lalu (126 passed + 5 skipped,
# atau 131 kalau env var PAAX_PLHUT_PDF diisi) — service ini semestinya
# TIDAK disentuh fase ini kecuali Fase K-2 butuh cross-check consolidate.py
# (baca saja, jangan ubah logic-nya tanpa alasan kuat).
```

Kalau ada yang merah dan bukan dari perubahan Anda sendiri: **STOP, laporkan**.

---

## 8. Batasan tegas (rangkuman)

- **TIDAK ADA redesign visual** — pakai ulang komponen (`Button`/`Card`/
  `StatusPill`) dan pola (`useRouter`) yang sudah ada di codebase.
- **TIDAK ADA LLM** di jalur mapping/takeoff/validator.
- **TIDAK mengubah rumus takeoff** (F-B/F-C/F-D) atau logic V-02/V-03 tanpa
  lapor dulu kalau ternyata perlu diubah (lihat §4) — laporkan, jangan
  perbaiki sendiri diam-diam.
- **TIDAK mengerjakan** Fase D (simbol grafis), vision-LLM fallback, atau
  impor katalog AHSP baru — semua di luar cakupan prompt ini.
- **TIDAK mengarang skor/coverage AHSP** kalau mengerjakan Fase L.
- Boleh jalan berurutan J-2 → K-2 → (L kalau sempat) tanpa berhenti minta
  izin di antaranya, TAPI wajib berhenti & lapor kalau menemukan masalah
  arsitektural nyata (terutama temuan V-03 false-positive di §4 — itu
  butuh keputusan, bukan perbaikan sepihak).

---

## 9. Setelah selesai — laporkan ke owner

1. Nama branch + link PR (dan base branch yang dipakai — `main` atau PR #29).
2. Fase mana saja selesai (J-2 wajib; K-2 & L kalau sempat) + yang di-skip
   & kenapa.
3. **Temuan V-03** (§4) secara eksplisit — false positive atau tidak,
   dengan bukti test, dan apakah perlu keputusan lebih lanjut dari Claude/owner.
4. Hasil test (angka pass/fail tiap service) + hasil verifikasi browser.
5. Kalau Fase L dikerjakan: laporkan realita coverage-nya apa adanya
   (kemungkinan besar rendah karena katalog kecil) — jangan dipoles.
