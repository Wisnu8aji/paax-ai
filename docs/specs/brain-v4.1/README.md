# PAAX Brain v4.1 — Spesifikasi Sumber (disalin verbatim)

> File di folder ini disalin **apa adanya, byte-for-byte** dari `G:\brain`
> pada 2026-07-02 (diverifikasi via checksum MD5). **Jangan edit isi file
> TXT/DOCX di folder ini** — kalau perlu revisi, revisi di `G:\brain` dulu lalu
> salin ulang ke sini (dan catat versi baru). Folder ini ada supaya spesifikasi
> ini **version-controlled** bareng kode (sebelumnya hanya hidup di luar repo).

Ringkasan lengkap + analisis gap terhadap dokumen `paax-ai-main` yang sudah
ada: lihat **[docs/BRAIN_ALIGNMENT.md](../../BRAIN_ALIGNMENT.md)**.

## Isi

| File | Topik | Lapis arsitektur terkait | Status pemakaian |
|---|---|---|---|
| `PAAX_BRAIN_00_EKSTRAKSI_GAMBAR_KERJA.txt` | Spek persepsi: TKG (Transkrip Kanonik Gambar), grammar notasi gambar teknik ID, SOP baca per jenis sheet, 10 gerbang validasi (V-01–V-10) | Lapis 2A (`services/document-intelligence`) | **Referensi untuk v1.0** — belum diimplementasi. Jangan mulai bangun sebelum gerbang F0 (data grounding) selesai (lihat `docs/ai-map/STATE.md`). |
| `PAAX_BRAIN_01_PRINSIP_PENALARAN.txt` | Konstitusi reasoning: 13 invariant (INV-01–13), model entitas (Evidence/Assumption/Warning/ReviewTask/Correction), aturan JOIN/precedence, expansion/implied-works, AHSP selection, dependency scheduling, anti-pattern (AP-01–16) | Lapis 1 (orchestrator) + Lapis 2A/2B | Invariant inti (AI tak pernah hitung) **sudah berlaku** via `CLAUDE.md` §1. Model entitas Evidence/Warning/Assumption **sudah ada sebagian** di `packages/schemas`; sisanya (ReviewTask, Correction, ElementInstance, WorkItem) masih draft/belum dipakai. |
| `PAAX_BRAIN_02_RUMUS_LOGIKA_HITUNG.txt` | 92 rumus deterministik (F-A00–K08): geometri, take-off beton/bekisting/besi/tanah/arsitektur/atap/MEP, AHSP→HSP→RAB, bobot/durasi/S-Curve/CPM/EVM, confidence, QA. Plus registry ~62 parameter (§Z). | Lapis 2B (`services/core-engine`) | **Sebagian kecil sudah diimplementasi** (F-H*/F-I* — HSP/RAB/S-Curve/CPM/skenario). Mayoritas (take-off beton/besi/bekisting/tanah/finishing) **belum** — jadi target ekspansi bertahap `app/geometry/`. |
| `PAAX_BRAIN_03_SKILL_API_PIPELINE_DATA.txt` | Katalog 31 skill (SK-01–31), arsitektur layer L0–L3, kebijakan keamanan/ops (P-SEC/P-OPS), testing/eval (T-01–T08), roadmap bergerbang F0–F5 | Semua lapis | Arsitektur L0–L3 **selaras** dengan `CLAUDE.md` §3. Roadmap F0–F5 **menguatkan** urutan yang sudah dikunci di `STATE.md` (ground data dulu, CV/vision ditunda). |
| `PAAX_OTAK_v3_Penjelasan_Sistem_2026-07-01.docx` | Ringkasan sistem versi v3 (lebih lama dari TXT 00-03 yang v4.1) | — | Arsip/referensi sejarah — **superseded** oleh TXT 00-03 v4.1. Simpan untuk konteks, bukan sumber kebenaran aktif. |

## Cara pakai

- Kalau kamu (Claude/Codex) sedang mengerjakan task yang menyentuh rumus
  take-off, model entitas Evidence/TKG, atau desain pipeline baca-gambar —
  baca bagian relevan di sini **sebagai spek rinci**, tapi cek dulu
  `docs/BRAIN_ALIGNMENT.md` untuk tahu bagian mana yang sudah/belum
  diimplementasi supaya tidak duplikasi kerja atau bikin schema drift.
- Nomor rumus (F-A00, dst.), invariant (INV-01, dst.), rule (RULE-EXP-*, dst.)
  dan kode skill (SK-01, dst.) di file-file ini adalah id acuan — kalau
  mengutip di komentar kode/PR, kutip id-nya (mis. `// per F-B01`) supaya
  tetap traceable ke spek aslinya.
