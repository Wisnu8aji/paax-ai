# Instruksi Manual — Phase 07 Bounded AI Assist

> Phase 07 dalam rangkaian Feedback 1 aktif berarti **Bounded AI Assist, Model
> Router, dan Benchmark**. Ini bukan “RAB Bridge”, “Revision Lineage”, atau
> “Engineering OCR” dari rangkaian phase historis lain.
>
> Jangan mengirim file ini sebelum Phase 06 menghasilkan feedback `STATUS:
> PASS`, commit koreksi, bukti browser 53 halaman, security fail-closed, dan
> review gate yang dapat diperiksa.

## Cara menggunakan instruksi ini

Phase 07 sengaja dibagi menjadi tiga prompt:

- Phase 07A — deterministic abstention, contract, dan audit ledger;
- Phase 07B — provider router dan benchmark maksimal 30 attempt;
- Phase 07C — review UI, dokumentasi batas AI/vision, audit, dan closure.

Kirim hanya satu prompt setiap kali. Tunggu feedback terminal phase kecil
tersebut, kirim feedback kepada Root/CEO untuk diperiksa, baru kirim prompt
berikutnya. Jangan menggabungkan 07A–07C dalam satu eksekusi.

---

# PROMPT PHASE 07A — Deterministic Abstention dan Audit Contract

Gunakan **Claude Sonnet 4.6 (Thinking)** sebagai implementor Phase 07A PAAX.
Kerjakan hanya 07A dan berhenti setelah feedback.

Worktree:

```text
G:\paax-ai-contextual-integration
```

Branch:

```text
codex/contextual-intelligence-integration
```

## Prasyarat keras

1. Baca feedback final Phase 06.
2. Pastikan Phase 06 `PASS`, commit-nya ada, working tree tidak memuat koreksi
   Phase 06 yang belum di-commit, dan security fail-closed sudah lulus.
3. Jika tidak, tulis `BLOCKED_BY_PHASE_06` dan berhenti tanpa coding.
4. Baca dan patuhi:
   - `G:\paax-ai-main\AGENTS.md`;
   - `docs\superpowers\specs\2026-07-26-drawing-intelligence-feedback-remediation-design.md`;
   - `docs\superpowers\plans\2026-07-26-di-ai-assist-router-benchmark.md`.
5. Jalankan `graphify query` sebelum navigasi source.

## Tujuan 07A

Bangun kontrak AI fallback yang hanya aktif setelah deterministic fast-path
memberi hasil `abstain` atau `ambiguous`.

AI hanya boleh menerima:

- teks yang sudah diekstrak;
- bbox/koordinat yang sudah tersedia;
- evidence references;
- allowed vocabulary/allowed fields;
- task kind dan deterministic reason.

AI tidak boleh menerima pixel/gambar mentah pada scope ini, menghitung quantity,
menulis hasil engine, mengubah source evidence, atau auto-commit proposal.

## Implementasi wajib

1. Verifikasi seluruh AI-assist lama dan jalur pemanggilnya menggunakan
   Graphify. Jangan membuat router kedua yang paralel tanpa alasan.
2. Implementasikan kontrak:
   - trigger hanya `abstain|ambiguous`;
   - deterministic reason wajib;
   - allowed fields/vocabulary wajib;
   - evidence refs wajib valid;
   - proposal memiliki confidence, citations, model dan prompt version;
   - validator deterministik menolak sumber/bbox/range/value yang tidak valid;
   - proposal valid tetap `needs_review`;
   - human approval wajib sebelum perubahan state.
3. Buat append-only audit ledger dengan:
   - model;
   - prompt version;
   - case ID;
   - input evidence refs;
   - token fields;
   - cost;
   - latency;
   - proposal;
   - deterministic validation;
   - outcome;
   - approval state.
4. Jangan menyimpan prompt/response yang mengandung secret.
5. Jika kontrak dibagikan lintas TypeScript/Python, ubah Zod dan Pydantic
   bersamaan serta tambahkan parity tests.

## TDD dan test gate 07A

Tulis failing tests terlebih dahulu untuk:

- deterministic success tidak memanggil provider;
- trigger selain abstain/ambiguous ditolak;
- missing/invalid evidence ditolak;
- proposal di luar allowed vocabulary ditolak;
- source text/bbox mismatch ditolak;
- audit append-only;
- provider failure tetap menghasilkan audit outcome yang jujur;
- proposal tidak pernah menjadi final quantity;
- state tidak berubah sebelum human approval;
- outbound network diblok pada normal tests.

Jalankan focused pytest, test existing AI-assist regression, schema parity bila
relevan, serta `git diff --check`. Tidak boleh ada live provider call pada 07A.

Setelah perubahan, jalankan `graphify update .`.

## Penutupan 07A

Commit terfokus:

```text
feat(di): audit bounded AI fallback proposals
```

Push/update draft PR yang sama, jangan merge.

Buat feedback:

```text
G:\paax-ai-contextual-integration\.superpowers\sdd\2026-07-26-di-ai-assist-router-benchmark\phase-07a-final-feedback.md
```

Format:

```text
PHASE: 07A
STATUS:
COMMIT:
FAST-PATH NO-CALL EVIDENCE:
VALIDATION EVIDENCE:
HUMAN APPROVAL EVIDENCE:
AUDIT LEDGER EVIDENCE:
SCHEMA PARITY:
OFFLINE TEST EVIDENCE:
NETWORK-GUARD EVIDENCE:
SECURITY CHECK:
REMAINING CONCERNS:
NEXT RECOMMENDED ACTION:
QUOTA STATUS:
```

Berhenti. Jangan memulai 07B.

---

# PROMPT PHASE 07B — Provider Router dan Benchmark 15+15

Gunakan **Claude Sonnet 4.6 (Thinking)**. Kerjakan hanya Phase 07B setelah
feedback 07A berstatus `PASS`.

## Prasyarat

1. Baca feedback 07A dan verifikasi commit/test-nya.
2. Jika 07A belum `PASS`, tulis `BLOCKED_BY_PHASE_07A` dan berhenti.
3. Baca `AGENTS.md` dan plan
   `docs\superpowers\plans\2026-07-26-di-ai-assist-router-benchmark.md`.
4. Gunakan Graphify terlebih dahulu.

## Kontrak provider

Bangun provider-neutral router khusus Drawing Intelligence:

- DeepSeek V4 Pro: maksimal 15 attempt;
- Qwen 3.7 Plus: maksimal 15 attempt;
- total immutable maksimal 30 attempt;
- attempt gagal/timeout/provider error tetap dihitung dan dicatat;
- attempt ke-31 harus ditolak sebelum network call;
- resume tidak boleh mengulang attempt yang sudah tercatat;
- model tidak boleh diganti/fallback otomatis;
- satu-satunya secret adalah runtime
  `DRAWING_INTELLIGENCE_API_KEY`;
- jangan membaca `GEMINI_API_KEY`, NVIDIA key, OpenAI key, Anthropic key,
  DeepSeek/Qwen Command Room key, atau provider key lain;
- jangan mengubah routing Command Room atau file terlindungnya.

Nilai API key tidak boleh tampil di source, fixture, `.env.example`, log,
exception, report, screenshot, Git diff, atau terminal. `.env.example` hanya
memuat nama variabel tanpa nilai.

## Benchmark cases harus nyata tetapi bounded

1. Jangan menggunakan data dummy untuk benchmark live.
2. Bentuk locked case set dari teks+bbox yang sudah benar-benar diekstrak dari
   sumber yang diizinkan dan catat provenance/hash-nya.
3. Jangan mengirim PDF, image, pixel, atau path file ke provider.
4. Jangan menjalankan ulang AI/transcription/extraction terhadap PLHUT 88
   halaman.
5. Setiap case harus memang melewati deterministic `abstain/ambiguous`, memiliki
   expected validation outcome, allowed fields, dan evidence refs.
6. Test unit boleh memakai fake client yang jelas berada di test scope; production
   tidak boleh mengimpor test fixture/client.

## Urutan kerja dan gate

### Gate 1 — Offline

Tulis failing tests dan buktikan:

- alokasi 15+15;
- cap per model dan global;
- attempt ke-31 ditolak;
- exception/timeout dicatat dan dihitung;
- ledger resume idempotent;
- PLHUT/image/PDF path ditolak;
- key isolation;
- redaction secret;
- normal test menghasilkan nol HTTP traffic.

Implementasikan minimal hingga seluruh offline gate hijau.

### Gate 2 — Controlled live run

Live benchmark hanya boleh berjalan bila:

- semua offline tests hijau;
- runtime `DRAWING_INTELLIGENCE_API_KEY` tersedia;
- case provenance tervalidasi;
- ledger kosong atau resume state-nya valid;
- user authorization 30-call pada instruksi ini dicatat.

Jalankan paling banyak satu benchmark terkontrol dengan total maksimal 30
attempt. Jangan retry di luar ledger. Bila key tidak tersedia, model tidak
tersedia, quota habis, atau provider menolak, tulis exact blocker dan berhenti;
jangan menggunakan key/model lain.

Scorecard harus memuat per attempt:

- model;
- case ID;
- prompt version;
- tokens;
- cost;
- latency;
- proposal;
- deterministic validation;
- outcome;
- error class ter-redaksi bila gagal.

Benchmark hanya advisory. Hasilnya tidak boleh mengubah routing production
secara otomatis.

## Verifikasi dan penutupan 07B

Jalankan focused pytest, key-isolation test, network guard, cap test,
secret scan, `git diff --check`, dan `graphify update .`.

Commit hanya code, test, locked non-secret case definitions dan dokumentasi
kontrak. Jangan commit runtime ledger mentah yang dilarang plan atau mengandung
data sensitif.

Commit:

```text
feat(di): add capped Drawing Intelligence model benchmark
```

Push/update draft PR yang sama, jangan merge.

Buat:

```text
G:\paax-ai-contextual-integration\.superpowers\sdd\2026-07-26-di-ai-assist-router-benchmark\phase-07b-final-feedback.md
```

Format:

```text
PHASE: 07B
STATUS:
COMMIT:
OFFLINE TEST EVIDENCE:
KEY ISOLATION:
NETWORK GUARD:
CASE PROVENANCE:
DEEPSEEK ATTEMPTS:
QWEN ATTEMPTS:
TOTAL ATTEMPTS:
CAP-31 REJECTION:
LEDGER/RESUME EVIDENCE:
SECRET SCAN:
BENCHMARK ARTIFACT:
BENCHMARK LIMITATION:
REMAINING CONCERNS:
NEXT RECOMMENDED ACTION:
QUOTA STATUS:
```

Berhenti. Jangan memulai 07C.

---

# PROMPT PHASE 07C — Human Review UI, Vision Boundary, dan Closure

Gunakan **Claude Sonnet 4.6 (Thinking)**. Kerjakan hanya Phase 07C setelah
feedback 07B berstatus `PASS` atau `PASS_WITH_BENCHMARK_BLOCKED` yang secara
eksplisit menyatakan implementation/offline gate hijau dan live benchmark
terhalang oleh external quota/key.

## Tujuan

Membuat proposal AI terlihat sebagai usulan yang dapat diaudit dan diputuskan
manusia, bukan sebagai fakta atau quantity final.

## Perilaku UI wajib

Review panel menampilkan:

- mengapa deterministic path abstain/ambiguous;
- model dan prompt version;
- evidence page/bbox references;
- allowed field/category;
- confidence;
- deterministic validation result;
- approval state;
- approve/reject/manual-correction actions sesuai RBAC;
- error/retry state yang jujur.

Proposal:

- tidak terlihat sebelum trigger valid;
- tidak boleh ditampilkan sebagai engine result;
- tidak boleh memiliki `sourceAuthority: core_engine`;
- tidak boleh masuk input engine sebelum approval;
- approval tidak menghitung angka;
- rejected/edited decisions tersimpan dalam audit trail.

## Dokumentasi wajib

Buat/perbarui dokumentasi yang menjelaskan untuk pemilik produk:

1. OCR adalah pembacaan teks dari raster; native PDF text tetap fast-path.
2. Bbox adalah koordinat lokasi evidence, bukan quantity.
3. Annotation baru dibutuhkan untuk supervised object detector ketika gap
   terukur sudah ada.
4. YOLO cocok untuk object detection cepat; DETR adalah transformer detector;
   keduanya ditunda karena Phase 07 ini hanya text+bbox fallback dan belum ada
   labelled object-level gap yang membenarkan training.
5. AI membantu klasifikasi/binding ambigu, tetapi Core Engine tetap satu-satunya
   otoritas angka final.
6. Human approval dan audit trail adalah boundary wajib.

## Test dan browser gate

Gunakan TDD untuk:

- hidden-before-abstention;
- invalid proposal;
- approve/reject/manual correction;
- RBAC denial;
- provider/backend error recovery;
- no numeric authority;
- evidence link menuju page/bbox yang benar;
- no auto-commit;
- no production dummy import.

Jalankan Vitest, relevant pytest, schema/typecheck, serta browser inspection
terhadap UI review menggunakan backend/test provider yang terkontrol tanpa live
provider call. Browser test harus memeriksa network response dan state, bukan
snapshot saja.

Jalankan `graphify update .`, secret scan, production-dummy scan, dan
`git diff --check`.

## Exit gate Phase 07

Phase 07 hanya `PASS` bila:

- 07A contract/ledger hijau;
- 07B cap/key isolation/offline router hijau;
- total live attempt tidak pernah melebihi 30;
- review UI dan manual fallback bekerja;
- tidak ada AI auto-commit atau final number;
- documentation boundary lengkap;
- tidak ada secret/dummy production;
- seluruh relevant test/typecheck/browser gate hijau;
- commit dan draft PR dapat direview.

Jika live benchmark tidak dapat berjalan karena external key/quota tetapi semua
implementation gate hijau, gunakan `PASS_WITH_BENCHMARK_BLOCKED`, bukan
memalsukan hasil benchmark.

Commit:

```text
feat(di): expose validated AI proposals for human review
```

Push/update draft PR yang sama dan jangan merge.

Buat feedback:

```text
G:\paax-ai-contextual-integration\.superpowers\sdd\2026-07-26-di-ai-assist-router-benchmark\phase-07-final-feedback.md
```

Format:

```text
PHASE: 07
STATUS:
COMMIT(S):
07A CONTRACT EVIDENCE:
07B ROUTER/CAP EVIDENCE:
LIVE BENCHMARK STATUS:
07C REVIEW UI EVIDENCE:
HUMAN FALLBACK:
RBAC EVIDENCE:
NO-AUTO-COMMIT EVIDENCE:
NO-NUMERIC-AUTHORITY EVIDENCE:
TYPECHECK/TEST EVIDENCE:
BROWSER EVIDENCE:
SECRET/DUMMY SCAN:
DOCUMENTATION:
GRAPHIFY UPDATE:
PR/PUSH STATUS:
REMAINING CONCERNS:
NEXT RECOMMENDED ACTION:
QUOTA STATUS:
```

Terminal response harus mengulang seluruh feedback. Berhenti dan jangan
memulai Phase 08.
