# PROMPT CODEX — Batch Brain v4.1: 10+ Irisan Engine (kerjakan semua, Claude review nanti)

> Owner mengizinkan Codex mengerjakan SEMUA task di bawah tanpa spek rinci per
> rumus — kamu baca sendiri rumus persisnya dari
> `docs/specs/brain-v4.1/PAAX_BRAIN_02_RUMUS_LOGIKA_HITUNG.txt` (bagian §
> yang disebutkan tiap task), ikuti konvensi kode yang SUDAH ADA di
> `services/core-engine/app/takeoff/` (params.py + models.py + 1 file per
> domain + test dengan anchor MANUAL dihitung tangan di docstring — lihat
> `tanah.py`/`dinding.py`/`arsitektur.py`/`tests/test_takeoff.py` sbg pola)
> dan `app/tkg/takeoff.py` untuk pola besi. Claude akan REVIEW & PERBAIKI
> semua hasil nanti — jangan tunda karena ragu, ambil keputusan wajar &
> catat sebagai assumption/needs_review sesuai pola Aturan Emas: TIDAK ADA
> angka ditebak, data kurang -> needs_review.

## Aturan wajib tiap task
- Baca dulu section brain yang relevan + kode pola yang sudah ada.
- Setiap fungsi hitung baru WAJIB test dengan anchor dihitung MANUAL (bukan
  disalin dari kode yang diuji) di docstring, mirip test_takeoff.py.
- Parameter baru masuk `params.py` terkait, bernama, tercatat di params_used.
- Guardrail sebelum tiap commit: `pytest -q` (core-engine), `pnpm run
  test:schemas`, `pnpm --filter "@paax/schemas" build`, `apps/web`: `tsc
  --noEmit` + `pnpm test`. Merah -> perbaiki dulu, jangan commit rusak.
- Branch baru per task atau per kelompok task terkait (nama bebas relevan),
  cabang dari `feat/engine-takeoff-arsitektur` bila sudah ada di remote,
  kalau belum ada cabang dari `feat/engine-rebar-bbs`. `git add` file
  eksplisit (JANGAN `-A`/`.`), JANGAN stage `.claude/`/`skills-lock.json`.
  PR **draft**, **JANGAN merge**, jangan push ke main/branch docs utama.
- Tulis 1 report ringkas per task/kelompok di `report/`.

## Task (kerjakan berurutan, boleh gabung yang berdekatan jadi 1 PR)

1. **§F-F06 Pemadatan + angkut per kelas jarak**: lengkapi `tanah.py` —
   pemadatan (Q=A atau V_padat sesuai satuan AHSP), angkutan buangan dgn
   pilihan kelas jarak (tambah param jarak/kelas di TanahParams).

2. **§G-02 Aanstamping**: tambah ke `arsitektur.py` (V = a_bwh × t_aanstamping × L).

3. **§G-04 Keramik dinding area basah**: A = K_basah × h_pasang − bukaan;
   h_pasang jadi param di ArsitekturParams (default + assumption).

4. **§G-06/07 Rangka baja profil + gording/trekstang/ikatan angin**: modul
   baru `app/takeoff/baja.py`. Butuh tabel berat profil (w_profil per
   designasi) — buat sbg data/param lookup kecil (mis. dict profil umum
   IWF/CNP/siku dgn sumber SNI/katalog dicatat di komentar), bukan hardcode
   diam-diam. Built-up pelat: w = gamma_s × t × lebar.

5. **§G-08 Nok/lisplank/talang/pipa hujan**: tambah ke `app/takeoff/atap.py`
   modul baru (nok Σ garis, lisplank Σ tepi, talang Σ jalur, pipa hujan
   n=ceil(A_atap/A_per_downpipe) bila tak tergambar + assumption).

6. **§G-09 Plafon + list**: tambah ke modul arsitektur atau file baru
   `plafon.py` (A=A_neto, rangka=A, list=Σ keliling tepi).

7. **§G-10 Waterproofing**: A = A_bidang + K_upstand×h_upstand (param
   h_upstand + assumption).

8. **§G-11 Kusen/pintu/jendela per schedule**: modul baru `kusen.py` — kusen
   L=Σkeliling atau unit, daun/kaca A=Σluas, aksesoris n=per unit×jumlah;
   model request berbasis daftar item schedule (kode, tipe, dimensi, jumlah).

9. **§G-12/13 Railing + MEP dasar**: railing L=Σtepi; MEP titik (lampu/
   stopkontak/saklar) = count sederhana dari daftar titik pengguna (bukan
   ekstraksi gambar — hanya rekap input eksplisit jadi WorkItem).

10. **§G-14 Pengecatan besi/baja**: A = Σ(keliling_penampang_profil × L) —
    pakai tabel profil dari task 4.

11. **§C07-C10 Bekisting lanjutan** (`app/tkg/takeoff.py`): dinding beton,
    tangga (butuh detail: tebal pelat, optrede, antrede — F-B11 saat ini
    needs_review di `_beton()` kategori "tangga", lengkapi jadi hitungan
    nyata bila param detail disetor), perancah (kategori tinggi + AHSP
    "termasuk perancah" jangan dobel — cek anti-pattern AP terkait).

12. **Checklist kelengkapan WBS D0–D15** (brain TXT01 §9): fitur baru,
    bebas taruh di `app/rab/` — deteksi divisi WBS standar yang "lupa"
    (tidak ada item) di RAB, murni pembanding daftar vs data ada,
    deterministik, tanpa AI.

13. **Endpoint + Zod mirror**: setiap modul baru di atas dapat endpoint
    `/takeoff/<nama>` di `main.py` (pola sama seperti tanah/dinding/
    arsitektur) + mirror schema Zod di `packages/schemas/src/index.ts` +
    contoh di `requests.http`.

14. **UI tabel BBS di TkgWorkspace** (`apps/web`): halaman gambar-kerja
    tab Takeoff — render tabel `bbs.marks` + `bbs.per_diameter` +
    `total_waste_kg` dari hasil `/tkg/takeoff` (hanya MENAMPILKAN, jangan
    hitung ulang di frontend — Aturan Emas).

Setelah semua/sebagian selesai: tulis 1 report ringkasan gabungan di
`report/REPORT_BRAIN_BATCH_CODEX_2026-07-02.md` berisi task mana selesai/
terlewat, daftar branch+PR yang dibuka, dan hasil guardrail terakhir per PR.
