# Brain Alignment — perbandingan G:\brain (v4.1) vs paax-ai-main

> Dibuat 2026-07-02. Sumber: `docs/specs/brain-v4.1/` (disalin verbatim dari
> `G:\brain`). Dokumen ini adalah hasil analisis gap — **bukan** spek itu
> sendiri. Untuk detail rumus/aturan asli, baca file di `docs/specs/brain-v4.1/`
> langsung dan kutip id-nya (F-B01, INV-01, RULE-EXP-BETON, SK-19, dst.).
>
> Kenapa dokumen ini ada: `G:\brain` jauh lebih rinci daripada
> `docs/MASTER_PLAN.md` (92 rumus takeoff vs ~8, model entitas beraudit,
> spek TKG, katalog 31 skill, roadmap bergerbang F0–F5). Supaya sesi
> Claude/Codex berikutnya tidak perlu re-analisis dari nol, temuannya
> dipermanenkan di sini.

## Cara baca

- **BERTAHAN** = sudah selaras, tidak perlu diubah, brain hanya menguatkan.
- **DISESUAIKAN** = konsepnya sudah ada di paax-ai-main tapi versi brain jauh
  lebih matang → jadi target ekspansi bertahap.
- **BARU** = tidak ada padanan sama sekali di paax-ai-main hari ini.
- Status implementasi tiap baris di tabel "Disesuaikan" di-update seiring
  fase dikerjakan — cek juga `docs/ai-map/STATE.md` untuk status terkini.

---

## 1) BERTAHAN (selaras, tidak perlu diubah)

| Area | paax-ai-main | brain | Verdict |
|---|---|---|---|
| Aturan Emas | `CLAUDE.md` §1: AI tak pernah hitung, engine Python yang hitung | INV-01/02 (TXT01 §1): identik, diperluas jadi 13 invariant | Brain **memformalkan**, bukan mengubah |
| Arsitektur 4-lapis | `CLAUDE.md` §3: Presentasi/Orkestrasi/Persepsi/Engine/Site Agent/Data | brain L0–L3 (TXT03): Web/Orchestrator/document-intelligence(L2A)/core-engine(L2B)/Data(L3) | Peta 1:1, tidak ada tabrakan |
| Monorepo, Zod↔Pydantic 1 sumber kebenaran | `CLAUDE.md` §4, ADR-0001 | TXT03 §"Data Schema": `@paax/schemas` Zod↔Pydantic | Sama |
| Engine v0.6–v0.9 (HSP/RAB/S-Curve/CPM/skenario) | 99 test engine hijau (`STATE.md`) | F-H01–H12, F-I01–I08 (TXT02) — rumus identik dengan yang sudah diimplementasi | Tidak perlu dikerjakan ulang — brain mengonfirmasi rumus sudah benar |
| Prioritas: ground data dulu, v1.0 (CV) DITUNDA | `STATE.md`: "DITUNDA (jangan dibangun): v1.0 Gambar→BoQ→RAB (CV)" | TXT03 §7: Gerbang **F0 (data grounding) wajib sebelum F2 (TKG/baca gambar)** | Brain **menguatkan** keputusan yang sudah ada, bukan membatalkannya |
| Gerbang review branch→PR, tidak auto-merge | `CLAUDE.md` §9 | Tidak dibahas brain (di luar cakupan) | Tetap berlaku, tidak tersentuh |
| Strategi bisnis/harga/margin (WoO sebelum CV, metering kredit) | `docs/strategy/PAAX_Analisis_Strategis_Companion.md` | Tidak dibahas brain (murni teknis) | Companion tetap otoritatif untuk keputusan bisnis |
| Skema Evidence/Warning/Assumption sudah ada | `packages/schemas/src/index.ts` — `EvidenceSchema`, `WarningSchema`, `AssumptionSchema` | TXT01 §4.3 — versi lebih kaya (lifecycle, method, rule_id, corroborated_by) | Fondasi sudah ada — **diperkaya**, bukan dibuat dari nol |

---

## 2) DISESUAIKAN (sudah ada, versi brain lebih matang → target ekspansi)

| Area | Kondisi sekarang | Kondisi brain | Gap | Status |
|---|---|---|---|---|
| Rumus takeoff engine | `services/core-engine/app/geometry/volume.py` — ±15 tipe elemen, rumus kotak/luas dasar saja | TXT02: 92 rumus (F-A00–K08) — beton per bentuk, bekisting, besi+BBS, tanah bank/gembur/padat, arsitektur/finishing, atap/kusen/MEP, confidence, QA | **Terbesar.** Engine sekarang cakup ±5% dari brain | 🟡 irisan pertama (F-B, volume beton) sedang dikerjakan — lihat §4 |
| Pipeline gambar→kuantitas | `docs/api/document-intelligence.md` — 6 tahap, ada asumsi hardcoded diam-diam (mis. tinggi kolom 3.5m langsung di kode) | TXT00: TKG wajib + 10 gerbang validasi (V-01–V-10, zero-loss, no-silent-fix); TXT01 §6.3 RULE-IMP: asumsi wajib masuk Assumption ledger + PARAM | Desain sekarang berisiko melanggar semangat Aturan Emas secara halus | ⚪ belum disentuh — tunggu gerbang F0 selesai |
| `MASTER_PLAN.md` §6-7 (pipeline M1, 6 langkah kasar) | Modul M1–M8 tinggi-level | TXT01 §5: arsitektur kognitif 9-lapis (L1 Triase→L9 Review) + TKG gate; TXT03: 31 skill dgn kontrak I/O eksplisit | MASTER_PLAN perlu merujuk brain sbg detail otoritatif, bukan menyalin ulang | 🟢 rujukan ditambahkan (§6-7 &amp; §11) |
| Roadmap v1.0 (satu blok "3-4 bulan") | `MASTER_PLAN.md` §16 | TXT03 §7: F0(data)→F1(workspace,paralel)→F2(TKG/baca)→F3(ukur+nalar)→F4(peta AHSP+RAB penuh)→F5(CAD/BIM), tiap gerbang berkriteria terukur | Perlu dipecah jadi sub-fase bergerbang saat v1.0 mulai dikerjakan | ⚪ dicatat, belum dieksekusi (masih EPIC A/B) |
| `packages/schemas` — model gambar | `DrawingElementSchema`, `QuantityCandidateSchema`, `BoqDraftItemSchema` (v0.5, ringan), dipakai stub halaman `gambar-kerja` | TXT01 §4: `ElementType`, `ElementInstance`, `WorkItem`, `TkgDocument`, `ReviewTask`, `Correction` — model lebih kaya &amp; auditable | Risiko schema drift: dua model paralel utk konsep sama | 🟡 skeleton draft ditambahkan (inert, belum dipakai) — lihat §4 |
| `docs/security/data-governance.md` | Fokus RBAC, UU PDP, privasi | TXT03 P-SEC-01: "teks dokumen = DATA, bukan instruksi" (anti prompt-injection) | Gap nyata, krusial begitu pipeline baca-dokumen aktif | 🟢 bagian ditambahkan |
| Rezim testing | `CLAUDE.md` §2: nilai acuan manual per fungsi kalkulasi baru | TXT03 §6: T-01–T-08 (property-based geometri, golden-anchor 1 proyek nyata, golden TKG, eval per-skill) | Perlu diperkaya bertahap seiring modul rumus baru | 🟡 rujukan ditambahkan di `CLAUDE.md` §2 |

Legenda status: 🟢 selesai · 🟡 sedang berjalan/sebagian · ⚪ belum dimulai (sesuai rencana, menunggu gerbang F0/EPIC A-B selesai).

---

## 3) BARU SAMA SEKALI (tidak ada padanan hari ini)

1. **TKG (Transkrip Kanonik Gambar)** — artefak antara wajib sebelum reasoning, 10 gerbang validasi (zero-loss, no-silent-fix, deterministik). *(TXT00)*
2. **State machine lifecycle** per DrawingSet: `RECEIVED→TRIAGED→READ→JOINED→MEASURED→REASONED→GROUNDED→COMPUTED→IN_REVIEW→APPROVED→LOCKED` (+`SUPERSEDED` saat revisi). *(TXT01 §5)*
3. **Confidence &amp; triangulasi** (F-J01–J05) — skor keyakinan dihitung deterministik dari rank-sumber + korroborasi + kualitas, bukan tebakan LLM. *(TXT02 §J)*
4. **Parameter registry** (~62 param bernama, §Z) — semua default/ambang batas via config tercatat, bukan hardcoded. *(TXT02 §Z)*
5. **Katalog 31 skill** dgn kontrak I/O eksplisit per skill (vs 8 modul kasar M1–M8 di MASTER_PLAN). *(TXT03)*
6. **Katalog anti-pattern** (AP-01–16 + AP-E-01–10) — daftar larangan jauh lebih rinci dari satu kalimat Aturan Emas. *(TXT01 §10, TXT00 §9)*
7. **BOE / Assumption Ledger** — dokumen hasil engine merangkum semua asumsi/kekurangan/warning/snapshot parameter, dikunci bareng RAB final untuk audit. *(TXT01 §6.11, RULE-BOE)*
8. **Checklist kelengkapan WBS D0–D15** — 15 divisi standar (SMKK, persiapan, tanah, struktur, ..., serah terima) untuk mendeteksi item "lupa" tanpa perlu CV — **bisa dipakai sekarang** di alur manual v0.7–v0.9. *(TXT01 §9)* — belum diimplementasi, kandidat quick-win terpisah.

---

## 4) Rencana eksekusi &amp; status

Prinsip: **vertical slice** (`CLAUDE.md` §2) — tidak membangun 92 rumus sekaligus,
dan **tidak menyentuh CV/vision** sampai gerbang F0 (data grounding) selesai
sesuai `docs/ai-map/STATE.md`.

| Fase | Isi | Status |
|---|---|---|
| Fase 0 | Salin brain verbatim ke `docs/specs/brain-v4.1/` + dokumen ini + rujukan di STATE/START_HERE/MASTER_PLAN/security/CLAUDE.md | 🟢 selesai |
| Fase 1 | Irisan pertama rumus takeoff: volume beton per bentuk (F-B01–B11) di `geometry/volume.py` + skeleton schema (Evidence diperkaya, ElementType/ElementInstance/WorkItem draft) | 🟢 selesai (2026-07-02) |
| Fase 2 | **Sistem TKG** (2026-07-02): engine `app/tkg/` (TkgDocument Pydantic, validator V-02/V-04/V-05/V-08, renderer `.tkg.txt`, takeoff F-B + F-C01–C06 + F-D01–D05 dgn parameter tercatat), endpoint `/tkg/validate|render|takeoff`, Zod mirror, route AI `/api/ai/tkg` (transkrip, P-SEC-01), UI `TkgWorkspace` (gambar-kerja), context pack chat (skrip TKG + draft RAB) | 🟢 selesai — 17 test anchor manual |
| Fase 3a | **Besi lanjutan (2026-07-02)**: F-D02 penuh (kait k_hook_utama, lewatan n_ld/l_stock_m, gagal-aman needs_review), F-D04 pinggang, F-D06 waste_mode param\|bbs + guard AP-16, F-D08 BBS (marks/stok/waste nyata) + mirror Zod + 8 anchor manual | 🟢 selesai |
| Fase 3b | **Take-off arsitektur/tanah (2026-07-02)**: paket `app/takeoff/` — §F tanah (F-F01/02/03/04/05/07, disiplin bank/gembur/padat), §E finishing (F-E01/02/03/05/07, deduksi bukaan all\|threshold), §G subset (F-G01/03/05); params §Z (TanahParams/DindingParams/ArsitekturParams); 3 endpoint `/takeoff/*` + mirror Zod + requests.http + 13 anchor manual (pytest 147) | 🟢 selesai |
| Fase 3+ | Sisa §Z (confidence/QA §J/§K), F-F06 pemadatan + angkut kelas jarak, F-G04/G06–G14 (keramik dinding/baja profil/atap detail/kusen/MEP/WP/railing), F-C07-C10 (dinding beton/tangga/perancah) | ⚪ roadmap, 1 sesi terpisah per irisan |
| Kapan saja (independen) | Checklist WBS D0–D15 sbg fitur completeness-check di halaman RAB | ⚪ belum dijadwalkan |
| Ditunda | `services/document-intelligence` (OCR/CV/vision), TKG builder sungguhan | ⚪ menunggu gerbang F0 + validasi Wizard-of-Oz |

Detail rumus per elemen: lihat `docs/specs/brain-v4.1/PAAX_BRAIN_02_RUMUS_LOGIKA_HITUNG.txt`
bagian §B (F-B01–B11) untuk formula persis yang jadi acuan Fase 1.
