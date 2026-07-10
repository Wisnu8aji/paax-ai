# PROMPT SAYA — Fase T: Nyalakan AHSP Auto-Suggest (akhirnya tidak diblokir lagi)

> Ditulis Saya, 2026-07-12. Ini **tugas besar berikutnya**, bukan
> housekeeping kecil (itu ada di prompt terpisah `PAAX_SAYA_PROMPT_FASE_S_
> CLOSE_SEMARANG_MATCHER_REFINEMENT_2026-07-12.md`). Fase L (AHSP
> auto-suggest) sudah 2x sengaja di-skip Saya sebelumnya (prompt 07-06 &
> 07-07) dengan alasan yang SAH saat itu: katalog AHSP di repo cuma 4 item
> sample. **Alasan itu sudah tidak berlaku** — sejak Fase N (2.542 item
> resmi) + Fase Q (188 unit diperbaiki, 0 kosong), katalog sekarang **2.546
> item lengkap & bersih**. Ini saatnya menyalakan fitur yang tadinya
> memang menunggu data ini siap.

---

## 0. WAJIB BACA DULU

1. `SAYA.md` §1 (Aturan Emas) — **penting utk fase ini**: AHSP mapping
   BOLEH dilakukan algoritma (token-overlap, sudah ada & deterministik),
   TAPI hasil pemetaan adalah USULAN, angka RAB tetap dari engine, dan user
   HARUS bisa melihat/mengubah kode yang diusulkan — tidak pernah otomatis
   final tanpa terlihat.
2. `docs/prompts/PAAX_SAYA_PROMPT_FASE_J_GENERATE_RAB_WIRING_2026-07-06.md`
   §4 — spesifikasi awal Fase L (batasan keras MASIH BERLAKU semua, baca
   ulang penuh), prompt ini hanya memperbarui KONTEKS (katalog sudah siap)
   dan memberi anchor baru dari data nyata sekarang.
3. `services/core-engine/app/mapping/ahsp_search.py` + `models.py` —
   `search_ahsp`/`map_workitem_to_ahsp`, SUDAH ADA, deterministik
   (token-overlap), JANGAN diubah jadi LLM.
4. `services/core-engine/app/tkg/takeoff.py` — `TakeoffItem{kode, kategori,
   work_type, quantity, unit, mutu_beton, ...}`, output takeoff yang akan
   dipetakan.
5. `apps/web/src/components/drawings/tkg-workspace.tsx` `sendToRab` (±baris
   289-320) — tempat `RabDraftLine.ahsp_code` saat ini SENGAJA kosong.
6. `data/ahsp/cipta-karya-2026.json` — 2.546 item NYATA, sudah bersih
   (0 unit kosong, semua field lain apa adanya dari SE DJBK 47/2026).

**Bukti katalog sekarang genuinely berguna** (saya cek langsung, ada 20
item beton per mutu f'c dgn metode manual/semi-mekanis, mis. `2.2.1.4.5
"1 m3 beton mutu sedang f'c 20 MPa, Slump (100 ± 25) mm, agregat maks 19 mm
secara manual"`, `2.2.1.5.4` versi semi-mekanis) — ini PERSIS jenis item
yang harus dipetakan dari `TakeoffItem{kategori:"kolom", work_type:"beton",
mutu_beton:"fc20"}`. Sebelumnya (katalog 4-item) tidak ada satu pun item
sekonkret ini.

---

## 1. FASE T — Desain & implementasi (ikuti prinsip §4 prompt lama + tambahan berikut)

### 1.1 Modul baru: pemetaan TakeoffItem → usulan AHSP

Buat `services/core-engine/app/mapping/takeoff_ahsp.py` (atau nama serupa,
konsisten pola folder `mapping/` yang sudah ada):

1. **Kamus kategori→frasa query kanonik** (deterministik, tabel eksplisit,
   BUKAN tebakan bebas) — mis.:
   - `("kolom"/"kolom_praktis"/"sloof"/"balok"/"ring_balok"/"latei"/"plat"/
     "pondasi_telapak"/"dinding_beton"/"tangga", work_type="beton")` →
     query dibangun dari `mutu_beton` kalau ada (mis. "fc25" → cari
     "beton mutu f'c 25" atau "beton mutu sedang f'c 25 MPa") + metode
     default (manual/semi mekanis — ambil dari `TakeoffParams` kalau ada
     field relevan, atau default "manual" dgn dicatat sbg assumption).
   - `work_type="bekisting"` → query per kategori (mis. "bekisting kolom",
     "bekisting sloof") — cek dulu apakah katalog CK 2026 punya item
     bekisting per kategori spesifik atau cuma umum; laporkan apa adanya.
   - `work_type="besi"` → query "pembesian" / "besi beton" sesuai satuan
     kg — cek pola penamaan nyata di katalog (`grep` nama yang mengandung
     "besi"/"pembesian"/"tulangan" dgn unit kg) sebelum menulis kamusnya,
     JANGAN menebak nama tanpa cek dulu ke `data/ahsp/cipta-karya-2026.json`.
2. **Keputusan auto-suggest** (ambang & margin — Anda tentukan angka
   presisnya, WAJIB diverifikasi manual dgn print/debug ke data nyata
   sebelum jadi konstanta final, ikuti metodologi §0.1 "verifikasi dulu,
   baru assert" yang dipakai sepanjang sesi ini):
   - Hitung skor kandidat #1 dan #2 dari `search_ahsp`.
   - Auto-suggest HANYA kalau skor #1 jauh di atas #2 (margin jelas) DAN
     `unit_ok=true`. Kalau tidak, `ahsp_code` TETAP kosong + field baru
     `ahsp_candidates: [...]` (kode+nama+skor, maks 3) supaya user bisa
     pilih manual dari daftar pendek, BUKAN dari 2.546 item mentah.
   - Item yang di-auto-suggest WAJIB ditandai (field baru `ahsp_suggested:
     bool`), TIDAK PERNAH disamakan dgn pilihan manual pengguna.
3. Fungsi utama mis. `suggest_ahsp_for_takeoff(takeoff: TakeoffResult, ahsp_index) -> List[TakeoffAhspSuggestion]`
   — satu baris per `TakeoffItem` yang `quantity is not None` (item
   needs_review TETAP dilewati, tidak diberi usulan, konsisten dgn
   `sendToRab` yang sudah ada).

### 1.2 Endpoint baru

`POST /tkg/takeoff-ahsp-suggest` (atau perluas response `/tkg/takeoff`
dengan field opsional — PILIH salah satu, yang lebih konsisten dgn pola
endpoint lain di `main.py`, jangan dua-duanya) yang menerima `TkgDocument`
(+params opsional), memanggil `takeoff_tkg` lalu `suggest_ahsp_for_takeoff`,
mengembalikan hasil gabungan.

### 1.3 Wiring frontend (TIDAK ADA REDESIGN VISUAL)

Di `tkg-workspace.tsx`, `sendToRab`: kalau usulan AHSP tersedia utk suatu
item DAN `ahsp_suggested=true`, isi `ahsp_code` dgn usulan itu (bukan
string kosong) — TAPI beri tanda visual kecil yang SUDAH ADA polanya
(`StatusPill` — reuse, jangan bikin komponen baru) di baris terkait,
mis. label "disarankan" dekat kode itu, supaya user tahu ini usulan bukan
keputusan final, dan tetap bisa mengubahnya di halaman `/rab` (dropdown yang
sudah ada, `ahspList`). Item yang TIDAK confident tetap `ahsp_code: ''`
seperti sekarang.

### 1.4 Test WAJIB (anchor dihitung manual dari data nyata, bukan tebakan)

1. Ambil 2-3 `TakeoffItem` REAL (dari test fixture yang sudah ada di
   `test_tkg.py`, mis. K1/SL1 dari `buat_tkg()`) dgn `mutu_beton` yang
   cocok salah satu item katalog nyata (mis. cocokkan ke salah satu dari
   20 item "beton mutu f'c X MPa" yang saya temukan) → hitung skor manual
   pakai rumus `search_ahsp` yang sudah ada (`overlap/union + 0.25 jika
   unit_ok`), VERIFIKASI ulang sendiri sebelum jadi assert.
2. Test kasus TIDAK confident (mis. kategori "tangga" atau kategori yang
   TIDAK ada padanan jelas di katalog CK 2026 — cek dulu apa benar tidak
   ada) → assert `ahsp_code=''`, `ahsp_suggested=false`,
   `ahsp_candidates` berisi beberapa opsi (bukan kosong, bukan dipaksakan).
3. Test fixture AHSP SINTETIS (bukan cuma katalog real 2.546 item) dgn
   ~10-15 item buatan sendiri mencakup kolom/sloof/balok/pelat/pondasi/
   bekisting/besi — buktikan pipeline general, bukan kebetulan cuma benar
   di katalog CK 2026 (pola §0.1 "fixture bukan template" yang sama
   diterapkan ke data AHSP, seperti diminta di prompt Fase L sebelumnya).
4. Test frontend: `sendToRab` mengisi `ahsp_code` HANYA utk item
   `ahsp_suggested=true`, badge "disarankan" muncul, item lain tetap
   kosong seperti sebelumnya (regresi: alur lama tanpa usulan AHSP harus
   tetap berfungsi persis sama).

---

## 2. Batasan tegas (SAMA seperti prompt Fase L sebelumnya, ditegaskan lagi)

- **TIDAK ADA LLM** — 100% token-overlap deterministik yang sudah ada.
- **TIDAK ADA auto-finalisasi** — semua usulan harus terlihat & bisa diubah
  user, tidak pernah disamakan dgn keputusan manual.
- **TIDAK ADA redesign visual** — reuse `StatusPill`/`Button`/pola yang
  sudah ada.
- **TIDAK mengubah** `takeoff_tkg`, `search_ahsp`, `map_workitem_to_ahsp`
  yang sudah ada & benar — hanya MEMAKAI, tidak mengubah rumus/logicnya.
- Kalau kamus kategori→query ternyata sulit dibuat akurat utk sebagian
  kategori (mis. bekisting/besi tidak ada padanan jelas di katalog CK
  2026) — itu SAH dilaporkan sbg "belum bisa disarankan utk kategori X,
  butuh katalog lain", JANGAN dipaksakan mapping yang salah demi terlihat
  lengkap.

---

## 3. Verifikasi & Gerbang Review

```powershell
cd services/core-engine && python -m pytest -q
cd ../../apps/web && pnpm vitest run && pnpm tsc --noEmit
cd ../services/document-intelligence && python -m pytest -q  # harapan: tidak berubah
```
Cek status merge PR #29-#34 dulu, branch dari base paling mutakhir, PR baru,
**jangan merge sendiri**.

## 4. Laporkan

Branch/PR, kategori mana yang berhasil dipetakan otomatis vs yang tidak
(dengan alasan), hasil test + anchor manual yang diverifikasi, hasil
verifikasi browser (upload PDF → takeoff → kirim ke RAB → cek badge
"disarankan" muncul benar).
