# PROMPT CODEX — Task R5: Deteksi Geometri Non-Struktur Lanjutan

> Ditulis Claude, 2026-07-07, reasoning tinggi. Bagian dari
> `docs/prompts/PAAX_CODEX_ROADMAP_10_TASKS_NON_UI_2026-07-07.md` (Task 5).
> **Mandiri secara branch**, tapi **RISIKO DESAIN TINGGI** — baca §0
> dan §5 dengan sangat teliti sebelum mulai. Kalau di tengah jalan kamu
> menemukan bahwa skema data (`ElementRegistryEntry`/Pydantic model) TIDAK
> CUKUP untuk merepresentasikan hasil deteksi baru, **STOP, JANGAN
> improvisasi skema sendiri** — tulis temuanmu di laporan sebagai
> "butuh sesi desain Claude" dan hentikan task di titik itu (commit apa
> yang sudah aman, jangan paksakan lanjut).
>
> **PENTING (operasional)**: SEGERA `git add` + commit file prompt ini
> (`docs: add task R5 prompt`) di AWAL branch task ini SEBELUM menulis
> kode apa pun — insiden 2026-07-07 membuktikan file prompt tak-ter-commit
> bisa hilang saat checkout/cleanup branch berikutnya.

---

## 0. Konteks — 3 gap jujur yang tercatat di report Fase X2

Laporan `report-remote/REPORT_X2_LANJUTAN_DINDING_CLAUDE_2026-07-05.md`,
`REPORT_X2_LANJUTAN_KUSEN_CLAUDE_2026-07-05.md`,
`REPORT_X2_LANJUTAN_MEP_CLAUDE_2026-07-05.md` (baca ketiganya dulu, PENUH,
bukan ringkasan) secara eksplisit dan JUJUR mencatat batas cakupan yang
BELUM ditangani:

1. **Dinding** — `wall_assist.py::suggest_dinding_pasangan` (baca fungsi
   ini penuh dulu) HANYA membaca TEKS dokumen-luas ("luas dinding total
   X m²" tertulis eksplisit) — TIDAK PERNAH mengukur panjang dinding dari
   GEOMETRI GAMBAR (polygon ruangan/garis dinding di denah). Ini task-nya:
   tambahkan jalur deteksi geometri sebagai SUMBER TAMBAHAN (bukan
   pengganti) — panjang dinding dari polygon ruangan divalidasi silang
   ke teks kalau ada, atau jadi kandidat independen kalau tidak.
2. **Kusen** — `kusen_assist.py::suggest_kusen_schedule` membaca TABEL
   TEKS jadwal pintu/jendela (kolom tipe/dimensi/jumlah). `qty` yang
   dipakai adalah ANGKA TERTULIS DI TABEL, BUKAN hasil hitung simbol
   pintu/jendela berulang di denah — kalau tabel tidak ada/tidak lengkap,
   TIDAK ADA fallback hitung dari simbol. Task ini menambah fallback itu.
3. **MEP** — `mep_assist.py::suggest_mep_points` membaca CATATAN JUMLAH
   TEKS ("TOTAL TITIK LAMPU 12") — bukan dari simbol titik lampu/stop
   kontak yang digambar di denah (ikon/legend). Task ini menambah deteksi
   simbol sebagai sumber tambahan.

**PRINSIP YANG TIDAK BOLEH DILANGGAR**: rule-based/geometri DETERMINISTIK
selalu didahulukan di atas AI-assist (`CLAUDE.md` §1.1) — task ini
menambah lapisan DETERMINISTIK baru (deteksi geometri), BUKAN menambah
lapisan AI baru. Kalau deteksi geometri tidak yakin (ambigu), hasilnya
`perlu_review` seperti biasa — TIDAK PERNAH ditebak.

---

## 1. Scope task ini (3 sub-task independen, boleh 3 PR terpisah ATAU 1 PR
   berurutan — putuskan sendiri, laporkan alasan)

### 1.1 Deteksi garis dinding dari polygon ruangan

Modul baru `app/perception/vector/wall_geometry.py` (pola sama
`grid_geometry.py` — baca file itu penuh untuk gaya kode, akses
`page.get_drawings()`, dsb). Fungsi `detect_wall_polygons(page: fitz.Page)
-> list[WallSegment]` — deteksi closed-path polygon (poligon tertutup,
biasanya persegi/L-shape ruangan) dari `page.get_drawings()` yang BUKAN
lingkaran (sudah ada `_is_circle_drawing` — REUSE untuk exclude), ekstrak
tiap sisi (segmen garis) sebagai `WallSegment(x0, y0, x1, y1, length_px)`.
Konversi px→mm pakai skala yang SAMA dengan `grid_geometry.py` (VERIFIKASI
bagaimana skala mm didapat di situ — kemungkinan dari `DIMS_RANGE`/grid
yang sudah direkonstruksi; kalau grid belum ada di halaman itu, hasil
`perlu_review` dengan alasan "skala tidak diketahui", JANGAN asumsi DPI
tetap).

**Total panjang dinding per sheet** = jumlah `length_px→mm` semua
`WallSegment` (dikurangi overlap/duplikat sisi yang dibagi dua ruangan
bersebelahan — ini bagian TERSULIT, PIKIRKAN pendekatan deduplikasi
[mis. bucket sisi berdasarkan garis kolinear + overlap rentang] SEBELUM
menulis kode, tulis rencana di komentar dulu). Kalau deduplikasi tidak
bisa dilakukan dengan keyakinan tinggi, JANGAN kirim angka sebagai
`dihitung` — kirim sebagai kandidat `perlu_review` dengan catatan
"kemungkinan overlap belum terverifikasi".

Wiring: `wall_assist.py` dapat parameter baru opsional
`geometry_candidate_m: float | None` — kalau ada DAN teks dokumen-luas
JUGA ada, keduanya dibandingkan (toleransi 15%) — cocok → confidence naik
(kedua sumber corroborate); tidak cocok → keduanya jadi kandidat terpisah
dengan catatan discrepancy, `perlu_review` (JANGAN pilih salah satu diam-diam).
Kalau teks tidak ada tapi geometri ada → geometri jadi kandidat tunggal
dengan confidence lebih rendah dari kasus corroborated.

### 1.2 `qty_counted` kusen dari simbol berulang

Simbol pintu/jendela di denah arsitektur biasanya digambar sebagai
BLOK/GROUP vektor berulang (busur pintu + garis, atau kotak jendela
dengan garis diagonal) — pola PERSIS `_detect_circle_rects` (deteksi
bentuk vektor berulang) tapi untuk BENTUK BERBEDA. Modul baru
`app/perception/vector/symbol_geometry.py`, fungsi
`count_door_window_symbols(page) -> dict[str, int]` (key: heuristik tipe
simbol, mis. "arc_door"/"rect_window" — JANGAN coba mengklasifikasi ke
tipe kusen spesifik seperti "P1"/"J2", itu di luar kemampuan deteksi
bentuk murni; hanya HITUNG jumlah simbol per BENTUK).

Wiring: `kusen_assist.py::suggest_kusen_schedule` dapat parameter opsional
`symbol_counts: dict[str, int] | None` — dipakai HANYA sebagai
**pembanding** (kalau `qty` dari tabel teks jauh berbeda dari total simbol
by-bentuk yang relevan → tambahkan warning "jumlah tabel vs simbol
tidak cocok, cek manual", TIDAK mengubah `qty` yang dipakai bridging).
**JANGAN** jadikan symbol count sebagai SUMBER UTAMA qty — deteksi bentuk
generik terlalu rawan salah-klasifikasi simbol lain sebagai
pintu/jendela; ini murni cross-check tambahan, bukan pengganti tabel.

### 1.3 Titik MEP dari simbol legend

Sama pola §1.2: modul `app/perception/vector/symbol_geometry.py`
tambahkan `count_symbols_near_legend(page, legend_symbol_bbox: Rect) ->
int` — user/pipeline harus tahu DULU bentuk simbol dari legend halaman
(biasanya ada tabel "Legend: ○ = titik lampu, □ = stop kontak" — CEK
apakah `zone_classifier.py`/`assemble.py` sudah punya cara mendeteksi
legend; KALAU BELUM, deteksi legend otomatis DI LUAR SCOPE task ini —
JANGAN improvisasi, laporkan sebagai gap & buat fungsi ini menerima
`legend_symbol_bbox` sebagai PARAMETER MANUAL untuk saat ini, dipanggil
HANYA dari test/skenario yang sudah punya bbox tersebut).

Wiring: `mep_assist.py::suggest_mep_points` dapat parameter opsional
`symbol_count: int | None` sebagai pembanding (pola sama §1.2 — TIDAK
menggantikan `count` dari teks, hanya warning kalau beda jauh).

---

## 2. Batas tegas yang HARUS dipatuhi

- Semua 3 sub-task adalah **DETERMINISTIK/GEOMETRIS** — TIDAK melibatkan
  LLM sama sekali. Kalau kamu merasa perlu AI untuk "mengenali bentuk
  simbol", itu tanda scope sudah melebihi task ini — STOP, laporkan.
- Hasil geometri HANYA jadi (a) kandidat independen berstatus
  `perlu_review`, atau (b) pembanding/corroboration untuk usulan
  teks/AI-assist yang SUDAH ADA. **TIDAK PERNAH auto-`dihitung`** tanpa
  jalur review yang sudah ada sebelumnya (bridging tetap lewat pola
  `perlu_review` → approval manusia → input core-engine).
- JANGAN ubah `app/takeoff/{atap,kusen,mep}.py` (rumus inti core-engine).
- JANGAN sentuh `apps/web/**`.

---

## 3. Test WAJIB (tiap sub-task test terpisah, fixture PDF sintetis BARU —
   BUKAN PLHUT, sesuai aturan "PLHUT = kunci uji bukan sumber logika")

### 3.1 `tests/test_wall_geometry.py`
- PDF sintetis 1 ruangan persegi sederhana (buat via `fitz` langsung di
  test, gambar 4 garis membentuk persegi) → total panjang dinding = keliling
  (dalam toleransi skala mm yang dipakai).
- 2 ruangan bersebelahan berbagi 1 sisi → sisi bersama TIDAK dihitung 2×
  (test deduplikasi — PALING PENTING, buktikan pendekatanmu benar).
- Tanpa grid/skala diketahui → hasil `perlu_review` "skala tidak diketahui",
  BUKAN dipaksakan pakai asumsi DPI.
- Wiring `wall_assist.py`: teks + geometri cocok → confidence naik; teks +
  geometri TIDAK cocok → kedua kandidat muncul dengan catatan discrepancy.

### 3.2 `tests/test_symbol_geometry.py`
- PDF sintetis dengan N bentuk arc/rect berulang → `count_door_window_
  symbols` mengembalikan hitungan benar per bentuk.
- Wiring `kusen_assist.py`: `qty` tabel vs symbol count cocok → tidak ada
  warning tambahan; tidak cocok → warning muncul, `qty` TETAP dari tabel
  (buktikan tidak berubah).
- `count_symbols_near_legend` dengan bbox manual → hitungan benar; wiring
  `mep_assist.py` sama pola kusen.

Jalankan SEMUA test document-intelligence setelah selesai (baseline naik
sejak Task 1/R2/R3/R4 ter-commit — jalankan `pytest -q` dulu untuk angka
awal SEBELUM mengubah apa pun, laporkan before/after akurat).

---

## 4. Laporan WAJIB — `report-remote/`

Nama file baru: `report-remote/REPORT_TASKR5_DETEKSI_GEOMETRI_LANJUTAN_CODEX_<tanggal>.md`
(atau 3 file terpisah kalau 3 PR — konsisten dengan keputusanmu di §1).
Isi wajib per sub-task: (1) pendekatan deduplikasi dinding & bukti test-nya
benar, (2) daftar bentuk simbol yang berhasil dideteksi & tingkat
false-positive yang kamu observasi di fixture sintetis, (3) SEMUA gap yang
kamu putuskan di luar scope (deteksi legend otomatis, dsb) dicatat jujur
sebagai "belum dikerjakan, butuh sesi terpisah" — JANGAN diam-diam
dilewati tanpa catatan, (4) hasil test lengkap, (5) commit + PR.

---

## 5. Titik STOP eksplisit (baca sebelum mulai, bukan sesudah stuck)

Kalau di tengah implementasi kamu sampai pada titik di mana:
- Skema `ElementRegistryEntry`/`AiXSuggestion` yang ADA tidak cukup untuk
  menyimpan hasil geometri baru (butuh field/tipe data baru yang
  signifikan, bukan sekadar parameter fungsi opsional), ATAU
- Deduplikasi dinding (§1.1) ternyata butuh algoritma jauh lebih kompleks
  dari yang dibayangkan (mis. butuh graph-based room detection penuh),

**STOP di titik itu.** Commit yang sudah aman & benar (test hijau), tulis
di laporan bagian mana yang tidak diselesaikan dan KENAPA, dan JANGAN
memaksakan implementasi yang kamu sendiri tidak yakin benar. Ini BUKAN
kegagalan — ini sesuai instruksi eksplisit owner.

---

## 6. Pembagian kerja & larangan

- Branch baru dari `main`: `feat/deteksi-geometri-nonstruktur-lanjutan`
  (atau 3 branch kalau dipecah — nama turunan jelas per sub-task).
- Commit tanpa `Co-Authored-By`/signature AI.
- PR draft, JANGAN self-merge.
- JANGAN sentuh `apps/web/**`, JANGAN ubah rumus `app/takeoff/*.py`.
