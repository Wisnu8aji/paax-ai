# PAAX — Roadmap "Gambar Kerja → RAB Benar" (analisis mendalam brain, 2026-07-03)

> Sumber kebenaran: `G:\brain` (4 berkas: TXT00 scan→TKG · TXT01 aturan berpikir ·
> TXT02 rumus · TXT03 skill/pipeline/roadmap). Dokumen ini = pemetaan keadaan
> NYATA repo hari ini ke gerbang brain (F0–F5) + rencana bertahap sampai satu
> gambar kerja nyata benar-benar menghasilkan RAB yang BENAR (bukan sekadar
> "menghasilkan sesuatu"). Ditulis Claude untuk review owner.

> ## ✅ STATUS TERKINI (2026-07-03, sesi lanjutan) — GERBANG-0a TUTUP + harga Surakarta nyata
> Owner setuju Fase 0 dulu, mengizinkan pakai harga ALFA.xlsx sbg HSD Surakarta
> sistem. Sudah **dikerjakan & terverifikasi lewat engine asli** (238 test hijau):
> engine `compute_hsp`/`compute_rab` reproduksi RAB manual PLHUT — HSP 32/32 eksak,
> RAB total dev **+0,0009%** (harga fixture) dan **+1,37%** (harga
> `data/harga-satuan/surakarta.json`, 112 resource NYATA, dev 100% dijelaskan oleh
> inkonsistensi internal ALFA sendiri). Detail: `docs/plans/PAAX_FASE0B_GAP_HARGA_2026-07-03.md`,
> prompt commit `docs/prompts/PAAX_CODEX_PROMPT_FASE0A_HSP_GOLDEN.md` (belum
> di-commit — Codex yang commit). Tabel "Headline" §0 di bawah adalah snapshot
> ANALISIS AWAL (sebelum kerja hari ini) — angka "Data grounding ~40%" & "GERBANG-0
> BELUM lolos" sudah membaik untuk lingkup Surakarta/PLHUT (lihat status di atas);
> sisa gap = pemetaan ke katalog AHSP RESMI penuh (2.542 item), bukan lagi harga kosong.

---

## 0. Headline jujur (baca ini saja kalau buru-buru)

Tiga "setengah" sistem, tingkat kematangannya sangat berbeda:

| Bagian | Peran brain | Status nyata | Nilai |
|---|---|---|---|
| **ENGINE hitung** (F3/F4 compute) | "ENGINE MENGHITUNG" | **~70% jadi & terverifikasi** — beton→besi→bekisting, tanah, finishing, atap, kusen, MEP, CPM, RAB, export. Semua jalan **kalau TKG-nya benar**. | tinggi |
| **DATA grounding** (F0) | prasyarat mutlak | **~40%** — katalog AHSP asli 2.542 item ADA tapi di luar repo; harga cuma ~4% (Surakarta 109/2.456); belum ada 1 RAB utuh berharga yang dibandingkan ke kunci manual. | **GERBANG-0 BELUM lolos** |
| **PERSEPSI baca gambar** (F2) | "AI MENGEKSTRAK" | **~20%** — PyMuPDF baca PDF nyata JALAN, tapi grammar-nya baru kenal notasi terstruktur sederhana. PDF gambar kerja NYATA → hampir semua masuk `unclassified`. | **GERBANG-2 BELUM lolos** |

**Temuan kunci** (dari audit hari ini): golden anchor yang sudah ada
(`test_plhut_golden.py`) dibangun dari TKG PLHUT yang **DITRANSKRIP TANGAN** —
manusia yang melakukan persepsi, lalu engine menghitung kuantitas dengan benar.
Ini membuktikan: **separuh "engine + rumus" sudah benar; yang belum ada adalah
(a) data harga/AHSP asli tersambung, dan (b) mesin persepsi yang bisa
menghasilkan sendiri TKG itu dari PDF.**

**Jalan tercepat yang JUJUR menuju "RAB benar dari gambar" BUKAN bikin CV makin
canggih dulu.** Brain (TXT03 §7, AP-09) tegas: **"data dulu, baru mata"**. RAB
dari CV sempurna di atas harga kosong = tetap SALAH. Maka urutan wajib:
**tutup GERBANG-0 di PLHUT dulu** (data + engine, manusia yang transkrip) →
baru **matangkan persepsi** (biar PDF asli otomatis jadi TKG yang tadi
ditranskrip tangan) → baru **sambung + triangulasi + review** jadi RAB
auditable penuh.

Kita **beruntung**: owner sudah punya materi anchor sempurna — gambar PLHUT
(`GAMBAR KERJA PLHUT SURAKARTA.pdf`) **dan** RAB manual aslinya
(`rab gedung plhut surakarta ALFA.xlsx` + `MC 00.xlsx`). Ini kunci jawaban
(golden key) untuk memvalidasi seluruh pipa.

---

## 0.1 PRINSIP WAJIB — PLHUT = KUNCI UJI, BUKAN TEMPLATE (ditegaskan owner 2026-07-03)

> "PLHUT itu hanya contoh untuk dipelajari dalam build ini. **Jangan jadikan
> template di dalamnya**, sehingga gambar kerja APA PUN bisa terdeteksi." — owner.

Ini mengikat seluruh rencana. Selaras brain **AP-07** (jangan ubah rumus/
koefisien/harga diam-diam) & **AP-15** (jangan hardcode parameter) & **INV-05**
(determinisme dari aturan UMUM, bukan template proyek).

**Aturan pemisahan (tidak boleh dilanggar):**
- Yang dibangun ke SISTEM = **kemampuan UMUM** yang berlaku untuk gambar kerja
  mana pun: katalog AHSP resmi, price book regional, rumus take-off F-*, grammar
  notasi brain-00 §2, pencarian AHSP semantik. **Tidak boleh** ada logika yang
  mengenali "ini PLHUT" atau bergantung pada kode/dimensi/urutan khas PLHUT.
- Yang khas PLHUT (TKG transkrip-tangan, total DKH Rp 1,86 M, pemetaan 224 item,
  koefisien AHS ALFA) hidup **HANYA sebagai fixture uji** di
  `services/core-engine/tests/fixtures/plhut/` — dipakai golden anchor (T-04) &
  golden TKG (T-08) untuk MENGUKUR apakah mesin umum benar. **Dilarang** menaruhnya
  di `data/ahsp/` atau `data/harga-satuan/` sebagai grounding default sistem.
- **Harga = pengecualian yang sah**: nilai HARGA BAHAN `ALFA.xlsx` adalah harga
  **regional Surakarta 2024** (bukan milik PLHUT) → boleh jadi price book
  `surakarta` umum SETELAH nama resource direkonsiliasi ke kode resmi. Yang
  general = harga regional; yang fixture = kaitannya ke item PLHUT tertentu.
- **Grammar/parser harus UMUM** (Fase 2): diuji KE golden TKG PLHUT, tapi dilarang
  di-over-fit ke fragmen persis PLHUT. Ukur juga ke ≥1 pola sintetis lain (T-08)
  supaya generalisasi terbukti, bukan hanya lulus di PLHUT.

**Uji lakmus tiap PR Fase 0–4:** "Kalau besok owner memberi gambar proyek LAIN
(bukan PLHUT), apakah kode ini tetap relevan?" Jika ada baris yang hanya masuk
akal untuk PLHUT di luar folder `tests/` → itu pelanggaran prinsip ini.

---

## 1. Keadaan sekarang vs gerbang brain (peta rinci)

### F1 — Workspace frontend: **~90% ✓ (GERBANG-1 praktis lolos)**
Gantt/CPM, simulator skenario, Engineering Chat ter-grounding, dashboard,
export Excel/PDF — hidup di data nyata. Sisa: poles, bukan pembangunan.

### F0 — Data grounding: **~40% ⚠️ (GERBANG-0 BELUM lolos) — PRASYARAT SEMUA**
- **AHSP**: katalog asli **2.542 item** ada di `G:\paax-data\ahsp\cipta-karya-2026.json`.
  Repo default = **4 item DEMO** (`data/ahsp/cipta-karya.sample.json`). Belum
  tersambung sebagai grounding sistem (loader baca `data/` repo atau `PAAX_DATA_DIR`).
- **Harga (HSD)**: Surakarta **109/2.456** (~4%), Semarang 23/2.456 (~1%),
  katalog resource 2.456 (`_resources_catalog.json`). Jauh dari "1 wilayah cukup
  utk 1 RAB utuh".
- **Golden anchor**: `test_plhut_golden.py` ADA tapi baru menutup **KUANTITAS**
  (beton/besi/bekisting kolom), **belum RAB berharga penuh** yang dibanding ke
  `ALFA.xlsx`.
- **Belum lolos GERBANG-0** brain: "1 proyek contoh → RAB penuh tanpa harga
  kosong; deviasi vs kunci ≤ ambang; BOE terbit."

### F2 — Baca gambar (SK-01..13): **~20% ⚠️ (GERBANG-2 BELUM lolos) — BOTTLENECK**
| Skill | Status |
|---|---|
| SK-01 triase/split (PyMuPDF) | ✓ nyata |
| SK-02 klasifikasi sheet | ✓ heuristik teks dasar |
| SK-10 normalisasi angka/OCR-fix | ✓ |
| SK-04 schedule→TypeDict | ✗ regex naif; belum pdfplumber/camelot; gagal di tabel PDF nyata |
| SK-05 grid & jarak | ✗ regex "GRID X: A-B=3000"; PDF nyata = angka & bubble tersebar |
| SK-06 dimensi/level/title-block | ⚠️ sebagian |
| SK-08 deteksi/hitung simbol | ✗ belum |
| SK-11 JOIN instance↔tipe | ✗ belum |
| SK-12 resolusi konflik · SK-13 diff revisi | ✗ belum |
| Validator V-01..V-10 | ⚠️ V-02/03/04/05/08/09 ada; V-01/06/07/10 belum (butuh data persepsi) |
- **Terbukti sesi lalu**: PDF PLHUT nyata → teks PyMuPDF = fragmen ("DENAH
  FOOTPLAT", "5000", "A", "PC1" satu-satu per baris) → grammar sekarang tak
  cocok → semua `unclassified`. Golden TKG harus ditranskrip tangan.

### F3 — Ukur + penalaran (SK-14..18, 25): **~70% ✓ (jalan di atas TKG benar)**
- SK-16 ekspansi (RULE-EXP beton→besi→bekisting): ✓
- SK-17 tersirat (SMKK dll): ✓ sebagian
- SK-18 turunan (tanah/finishing F-E/F/G): ✓
- SK-25 confidence (F-J): ✓ endpoint `/brain/confidence`
- SK-14 ukur vektor (poligon dari koordinat CAD): ✗ (baru baca angka tertulis)
- Triangulasi (RULE-CONF-02) sbg gerbang "hijau": ⚠️ sebagian

### F4 — Map + RAB penuh (SK-19..24, 26..28, 30): **~60%**
- SK-19 pencarian AHSP: **token-overlap** (Jaccard) + anchor satuan — **bukan
  embedding**; jalan di demo, rawan di 2.542 item bersinonim.
- SK-20 harga: ✓ mekanik, coverage tipis.
- SK-23 BOE ✓ · SK-24 triage ✓ · SK-26 RAB ✓ · SK-28 export ✓ · SK-30 flywheel ✓
- **Belum lolos GERBANG-4**: belum ada gambar→RAB auditable ujung-ke-ujung.

### F5 — CAD/BIM: **0% (jauh, sesuai rencana).**

---

## 2. Keputusan kunci (yang kontra-intuitif — mohon owner sadari)

**Godaan alami**: "perbaiki saja AI baca gambarnya biar langsung jadi RAB."
**Kenapa itu salah menurut brain**:
1. RAB dari persepsi sempurna di atas AHSP demo (4 item) + harga ~4% = **angka
   final SALAH** tapi terlihat meyakinkan → pelanggaran ATURAN EMAS versi halus.
2. Tanpa kunci jawaban (RAB manual nyata), kita **tak bisa tahu** persepsi benar
   atau salah — tak ada yang dibandingkan.
3. AP-09 brain: "DILARANG membangun UKUR sebelum BACA stabil; membangun apa pun
   di atas data AHSP/harga yang belum tervalidasi."

**Maka urutan yang benar** = **Fase 0 (data + engine di PLHUT, manusia
transkrip) → Fase 2 (persepsi otomatis, diukur ke kunci Fase 0) → Fase 3/4
(sambung penuh)**. Brain bahkan menyarankan: **jual dulu workspace deterministik
+ validasi "gambar→RAB" via Wizard-of-Oz berbayar SEBELUM investasi CV besar.**
Fase 0 di bawah ini **adalah** Wizard-of-Oz yang diformalkan.

---

## 3. RENCANA BERTAHAP (dengan gerbang terukur)

### ▶ FASE 0 — Tutup GERBANG-0 di PLHUT ("RAB benar pada 1 proyek nyata, persepsi oleh manusia")
> Tujuan: buktikan separuh **data + engine** benar ujung-ke-ujung pada proyek
> NYATA, tanpa perlu CV sempurna. Hasil: workspace yang bisa dijual + golden key
> untuk menguji CV nanti. **Ini langkah paling bernilai & paling rendah risiko.**

**TEMUAN (ekstraksi `ALFA.xlsx` 2026-07-03) — kunci jawaban jauh lebih lengkap
dari dugaan.** File itu RAB profesional lengkap 4 sheet berantai:
- **DKH** (Daftar Kuantitas & Harga) = **224 item pekerjaan** di ~20 divisi;
  **total ≈ Rp 1.860.078.607** ← INI kunci jawaban GERBANG-0.
- **HARGA BAHAN** = **112 resource berharga** (upah+bahan) ← price book Surakarta,
  **lengkap untuk proyek ini** → masalah "harga kosong" 0B praktis SUDAH beres.
- **AHS** (Analisa Harga Satuan) = **32 analisa** dgn kode resource (L.xx upah,
  M.xxx bahan, E.xx alat) + koefisien ← AHSP siap pakai/banding.
- **HSP** = 29 harga satuan per item.
- Divisi DKH (SMKK, Persiapan, Tanah, Pondasi&Beton, Pembesian, Bekisting,
  Dinding, Atap, Plafon, Lantai, Kusen, Sanitary, Cat, Elektrikal, Halaman)
  **memetakan ~1:1 ke WBS brain D0–D15** → sekaligus anchor kelengkapan (SK-21).

**Nuansa penting (dicek):** kode **upah L.xx COCOK** katalog resmi (L.01=Pekerja
di dua-duanya), tapi kode **bahan M.xxx TIDAK cocok** `_resources_catalog.json`
(M.504 = 0 hit) — `ALFA.xlsx` pakai penomoran bahan lokal-proyek. Ini menentukan
strategi: Fase 0 dipecah dua sub-gerbang.

- **0A — Sambungkan katalog AHSP asli (2.542 item) sebagai grounding sistem.**
  Registrasikan `cipta-karya-2026.json` ke jalur data resmi (ber-edisi di
  `ProjectContext.ahsp_edisi`); demo 4-item tetap untuk test unit. *(F0,
  RULE-AHSP-06, AHSP_ITEM TXT03 §4)*
- **0B — Muat price book Surakarta dari `ALFA.xlsx` HARGA BAHAN (112 resource).**
  Target: **0 harga kosong** pada item PLHUT (sudah tercapai by-construction dari
  file ini). *(F0, RULE-HRG-02)*
- **0C — Peta 224 item DKH → kode AHSP + resource (dikonfirmasi manusia).** Claude
  ekstrak & ajukan pemetaan; owner konfirmasi. Termasuk jembatan kode bahan
  lokal M.xxx ↔ resource resmi. *(SK-19 manual-confirmed, RULE-AHSP-02/03)*
- **0D — Bangun golden anchor RAB PENUH** dari TKG PLHUT transkrip-tangan
  (diperluas dari "hanya kolom" → bangunan utuh) → engine take-off → map (0C) →
  harga (0B) → **RAB penuh** → **banding ke DKH `ALFA.xlsx`** per divisi & total.
  *(T-04 golden anchor, SK-26, SK-23 BOE)*

**Dua sub-gerbang** (agar ada quick-win + grounding resmi):
- **GERBANG-0a (cepat, self-consistent):** AHS + HARGA BAHAN `ALFA.xlsx` dimuat
  sebagai **fixture uji** (`tests/fixtures/plhut/`, BUKAN data default sistem —
  §0.1) → **engine UMUM yang sama** (dipakai proyek apa pun) reproduksi **total
  DKH ≈ Rp 1,86 M dalam toleransi KETAT (±1–2%)**. Membuktikan **matematika
  engine HSP→RAB benar** vs RAB profesional nyata, tanpa celah harga. Bukti
  terkuat & tercepat separuh keras benar. (Yang diuji = engine umum; PLHUT =
  angka jawaban, bukan template.)
- **GERBANG-0b (brain-compliant, resmi):** grounding UMUM sistem = **katalog AHSP
  resmi 2.542** + price book **Surakarta regional** (nilai dari HARGA BAHAN,
  kode direkonsiliasi ke resmi). Peta 224 item PLHUT → kode AHSP resmi lewat
  pencarian semantik UMUM (SK-19) → reproduksi total dalam toleransi lebih
  longgar (**usul ±10%**); tiap deviasi = temuan audit (kontraktor pakai analisa
  custom vs resmi). Inilah F0 "sebenarnya" brain (RULE-AHSP-06). **BOE terbit.**
  (Yang diuji = katalog & pencarian UMUM; PLHUT = kunci jawaban.)

**Estimasi:** 0a = 2–3 sesi (paling cepat, dampak tertinggi). 0b = 3–5 sesi
(0C mapping butuh judgment + owner). **Sudah diputuskan owner:** Fase 0 dulu;
Claude ekstrak `ALFA.xlsx` & ajukan pemetaan (0C). **Ambang deviasi:** 0a ±1–2%,
0b ±10% (usul, minta konfirmasi).

---

### ▶ FASE 2 — Tutup GERBANG-2 ("Persepsi otomatis menghasilkan TKG yang tadi ditranskrip tangan")
> Tujuan: PDF PLHUT nyata → TKG yang **cocok** dengan golden TKG transkrip-tangan
> Fase 0 (dalam toleransi). Diukur ke kunci yang sudah ada → objektif, bukan
> "kelihatannya jalan". **Baru dikerjakan setelah GERBANG-0 lolos.**

- **2A — Leksikon & grammar notasi (brain-00 §2).** Kamus prefiks (P/PC/F/SL/K/
  KP/G/B/RB/S/TG…), notasi tulangan `nD-d` & `D-d-s`, dimensi `bxh`, mutu
  `fc'/K-`, level `SFL±`, inferensi satuan mm/cm (§2.7). String tak cocok →
  `unclassified` + W (bukan tebak; AP-E-04). *(SK-04/05/06/10)*
- **2B — Merge-run fragmen (brain-00 §1 RULE-EXT-03).** Satukan span PDF yang
  terpecah ("5","0","0","0"→"5000"; kode terpotong) via baseline + kedekatan +
  arah rotasi, SEBELUM parsing. Simpan raw per-span + hasil gabung. Inilah yang
  menjembatani "fragmen tersebar" → notasi terbaca. *(SK-06)*
- **2C — Rekonstruksi terstruktur:** grid dari bubble+garis as+dimensi (SK-05),
  tabel schedule dari rangka garis via **pdfplumber/camelot** (SK-04), pengikatan
  simbol↔label↔alamat-grid (SK-08/11 JOIN). *(brain-00 §3.1/§3.2/§5)*
- **2D — Lengkapi validator V-01 (cakupan teks 100%), V-07 (satuan konsisten),
  V-10 (kelengkapan kop)** + metrik cakupan (zero-loss INV-TKG-02). *(brain-00 §7)*

**GERBANG-2 (kriteria lolos):** PDF PLHUT nyata → TKG **cocok golden TKG
transkrip-tangan** dalam toleransi (grid, tipe, count ganda-metode); **V-01..V-10
lolos**; eval **T-08 (golden TKG) & T-05 (per skill) ≥ ambang**; tiap angka di UI
bisa diklik → sumber (locator). *(brain TXT03 §7 GERBANG-2)*

**Estimasi:** paket besar, 6–10 sesi (grammar + table extraction + JOIN = inti
CV "ringan" tanpa vision-LLM ukur). **Risiko tertinggi ada di sini** — makanya
digerbang di belakang Fase 0.

---

### ▶ FASE 3–4 — Tutup GERBANG-4 ("Sambung persepsi matang ke engine terbukti; triangulasi + confidence + review → RAB auditable")
> Setelah persepsi (Fase 2) & data+engine (Fase 0) sama-sama terbukti, sisanya
> menyambung + mengeraskan mutu.

- **3A — SK-14 ukur vektor** (luas poligon dari koordinat CAD; F-A03..) untuk
  kuantitas yang tak tertulis angkanya; raster tetap dibantu manusia (SK-15).
- **3B — Triangulasi (RULE-CONF-02) sebagai gerbang "hijau"** + confidence F-J
  menggerakkan antrian review (SK-24/25). "Hijau" hanya bila ≥2 sumber setuju.
- **4A — SK-19 naik kelas ke embedding search** (FAISS/pgvector lokal) di
  katalog 2.542 asli + rerank + cek satuan/kandungan (anti double-count
  RULE-AHSP-05).
- **4B — Kelengkapan WBS D0–D15 (SK-21)** sebagai checklist; divisi kurang →
  needs_review, bukan hilang.
- **4C — BOE penuh + antrian ReviewTask + flywheel** (SK-23/24/30) matang di UI.

**GERBANG-4 (kriteria lolos):** dari **gambar PLHUT nyata** (tanpa transkrip
tangan) → **RAB auditable** yang deviasinya ke `ALFA.xlsx` ≤ ambang; QA numerik
(§K) lulus; antrian review berfungsi; tiap angka ber-audit-trail. *(brain
TXT03 §7 GERBANG-4)*

---

## 4. Ringkasan urutan & alasan (satu layar)

```
SEKARANG:  Engine ~70% (jalan di TKG benar) · Data ~40% · Persepsi ~20%
           Workspace F1 ~90%. Owner punya PLHUT PDF + RAB manual (ALFA.xlsx).

FASE 0  → GERBANG-0: PLHUT → RAB penuh berharga, deviasi ≤ ambang vs ALFA.xlsx, BOE.
(data+engine, manusia transkrip)   ← WIZARD-OF-OZ; bukti separuh keras benar; bisa dijual.

FASE 2  → GERBANG-2: PDF PLHUT nyata → TKG = golden transkrip-tangan (toleransi); V-01..V-10.
(persepsi otomatis)                ← diukur ke kunci Fase 0; risiko tertinggi, digerbang di sini.

FASE 3-4 → GERBANG-4: gambar nyata → RAB auditable, deviasi ≤ ambang, review jalan.
(sambung + triangulasi + AHSP embedding + BOE penuh)

DITUNDA:  F5 CAD/BIM (DWG/RVT/IFC) sampai ada permintaan nyata.
```

Kenapa urutan ini: brain "data dulu, baru mata" (TXT03 §7, AP-09). Fase 0
menjadikan RAB *benar* (bukan cuma *jadi*), memberi produk terjual + kunci uji,
dan menurunkan risiko Fase 2 (kita punya target objektif). Melompat ke persepsi
dulu = membangun mata untuk membaca ke dalam wadah yang isinya belum benar.

---

## 5. Yang saya butuhkan dari owner untuk MULAI Fase 0

1. **Persetujuan urutan ini** (Fase 0 dulu, bukan langsung poles CV). Kalau owner
   ingin urutan lain, itu override sadar terhadap brain — mari dibahas.
2. **Ambang deviasi GERBANG-0** (`eval.dev_cost_max`) — usul awal **±10% total
   RAB**, diperketat tiap iterasi. Setuju/ubah?
3. **Bantuan baca `ALFA.xlsx`**: struktur divisi & arti item (untuk 0C mapping &
   0D perbandingan). Saya bisa ekstrak & ajukan pemetaan, owner konfirmasi.
4. Konfirmasi PLHUT sebagai **proyek golden resmi** (materi lengkap sudah ada).

Setelah 4 hal ini, saya pecah Fase 0 jadi prompt Codex konkret (0A–0D), Claude
review tiap hasil sebelum lanjut — pola `spec→implement→review` yang sudah jalan.

---

## 6. Rujukan brain (untuk penelusuran)
- Urutan berfase + gerbang: **TXT03 §7** · testing/eval: **TXT03 §6** (T-04 golden
  anchor, T-05 per skill, T-08 golden TKG).
- Aturan berpikir: **TXT01** — ATURAN EMAS §1, ekspansi §6.2 (RULE-EXP), tersirat
  §6.3 (RULE-IMP), AHSP §6.5, harga §6.6, triangulasi §7, WBS §9, anti-pola §10.
- Scan→TKG: **TXT00** — grammar §2, SOP sheet §3, binding §5, validator V-01..V-10 §7.
- Rumus: **TXT02** (F-A..F-K) + registry parameter §Z.
- Selaras & status: `docs/BRAIN_ALIGNMENT.md`, `docs/ai-map/STATE.md`.
