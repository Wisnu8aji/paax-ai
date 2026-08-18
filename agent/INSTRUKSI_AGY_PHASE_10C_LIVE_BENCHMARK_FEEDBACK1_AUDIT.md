# Instruksi AGY — Phase 10C Controlled Live Benchmark and Feedback 1 Audit

Gunakan **Gemini 3.6 Flash High Thinking** sebagai executor pada percakapan AGY
yang sama. Kerjakan hanya **Phase 10C / Task 3: Controlled live benchmark and
Feedback 1 audit**. Phase 11 masih terkunci dan dilarang berjalan.

## Titik kerja

- Worktree: `G:\paax-ai-contextual-integration`
- Branch: `codex/contextual-intelligence-integration`
- Base commit:
  `7257d823fe4592982de00418cc7d202484300f04`
- Remote sebelum fase sama dengan base.
- Feedback utama: `G:\REVISI\feedback 1.docx`
- Matrix:
  `scripts/quality/feedback1_matrix.json`
- Plan:
  `G:\paax-ai-main\docs\superpowers\plans\2026-07-26-di-feedback-audit-e2e-pr-handoff.md`

Phase 10A dan 10B sudah selesai. Jangan mengubah bukti menjadi PASS bila live
benchmark atau report-schema gate gagal.

## Aturan wajib

1. Baca penuh `AGENTS.md`, aturan Root–AGY, aturan khusus Phase 11, plan Phase
   10, feedback Phase 10A, dan feedback Phase 10B.
2. Gunakan Graphify untuk menginventarisasi entrypoint AI-assist Drawing
   Intelligence yang benar-benar berada dalam scope Phase 10C.
3. Aturan Emas tetap mutlak:
   - AI hanya mengusulkan klasifikasi/binding/penjelasan;
   - deterministic validator memutuskan kelayakan kandidat;
   - manusia menyetujui perubahan input;
   - Core Engine menghitung angka final;
   - AI tidak pernah menghitung atau menulis quantity/RAB/BOQ final.
4. Jangan menjalankan raw drawing-to-JSON extraction/transcription 88 halaman.
5. Jangan merge ke `main`, membuka PR final, atau memulai Phase 11.

## Secret dan provider

Pemilik memberi otorisasi terbatas hanya untuk benchmark ini:

- gunakan key Drawing Intelligence yang sudah tersedia pada `.env.local`;
- muat key melalui environment proses lokal tanpa mencetak nilainya;
- jangan menyalin key ke source, command argument, report, ledger, screenshot,
  log, fixture, atau commit;
- pastikan `.env.local` tidak terlacak Git;
- gunakan **DeepSeek V4 Flash**;
- verifikasi model ID/alias terhadap konfigurasi provider yang aktual sebelum
  panggilan pertama;
- jika DeepSeek V4 Flash tidak tersedia, jangan mengganti diam-diam ke model
  lain: hentikan live portion sebagai `BLOCKED`;
- provider executor AGY tetap Gemini; DeepSeek V4 Flash hanya model aplikasi
  yang diuji.

## Budget live yang tidak dapat ditawar

- Maksimal **15 live provider calls per fitur AI**.
- Setiap fitur mempunyai counter terpisah.
- Retry, timeout, malformed response, dan provider error tetap dihitung.
- Panggilan ke-16 harus ditolak sebelum network request.
- Hentikan lebih awal bila acceptance sudah terbukti atau pola gagal sudah
  jelas.
- Jangan membuat call hanya untuk menghabiskan kuota.
- Ledger harus menyimpan jumlah aktual `0..15` per fitur.

## Inventaris dan kasus benchmark

Gunakan Graphify dan implementasi aktual untuk membuat inventaris dinamis
fitur AI-assist dalam scope, minimal:

- sheet/title-block classification/binding fallback;
- level, view, discipline atau drawing-axis ambiguity resolution bila entrypoint
  aktual tersedia;
- evidence/reference binding suggestion;
- review suggestion/explanation yang benar-benar memakai router AI-assist;
- deterministic rejection/manual fallback.

Jangan mengarang fitur yang tidak ada. Untuk setiap fitur aktual, gunakan kasus
yang proporsional:

- valid/high-confidence;
- ambiguous;
- invalid/out-of-range;
- malformed/provider error bila dapat diuji tanpa mengarang response live;
- manual/rule-based fallback.

Rule-based harus tetap fast-path. LLM hanya membaca teks+koordinat terstruktur
yang sudah diekstrak, bukan piksel mentah.

## Ledger

Create:

`report/report_drawing_intelligence/FEEDBACK1_AI_BENCHMARK_2026-07-26.json`

Ledger harus non-secret, satu counter per fitur, dan setiap record minimal:

- model dan model alias terverifikasi;
- feature;
- case;
- attempt;
- prompt_version;
- input provenance tanpa secret;
- token fields dan cost bila provider benar-benar mengembalikan;
- latency;
- proposal;
- deterministic_validation;
- outcome;
- reason;
- manual_fallback;
- call count.

Jangan mengarang token/cost; gunakan `null` dan limitation bila tidak tersedia.
Ledger/report validator harus fail-closed pada secret-like value, call >15,
missing field, final numeric authority dari AI, atau outcome PASS tanpa
deterministic validation.

## Feedback 1 acceptance audit

Create:

`report/report_drawing_intelligence/FEEDBACK1_ACCEPTANCE_AUDIT_2026-07-26.md`

Modify:

- `docs/ai-map/STATE_CURRENT.md`
- `README.md`

Report wajib:

1. satu row per P2-P62;
2. requirement asli/ringkasannya;
3. implemented behaviour;
4. automated evidence;
5. visual/browser evidence;
6. AI benchmark evidence bila relevan;
7. status aktual;
8. limitation dan blocked reason.

Validasi report terhadap matrix. Fail bila requirement hilang, evidence path
tidak ada, test gagal tetapi status selesai, atau unsupported formula/domain
diklaim universal. Bedakan `supported`, `ready`, `needs_review`, dan `blocked`.

Baca kembali seluruh `G:\REVISI\feedback 1.docx`, termasuk tabel, pada akhir
Phase 10C untuk memastikan audit P2-P62 tidak kehilangan requirement. Ini belum
menggantikan audit ulang terminal Phase 11.

## Test dan gate

1. Buat test validator report/ledger merah terlebih dahulu.
2. Pastikan offline Phase 10A dan browser Phase 10B gate masih hijau sebelum
   live call.
3. Jalankan benchmark live dengan counter/budget fail-closed.
4. Jalankan validator matrix, report, dan ledger.
5. Jalankan seluruh focused pytest/Vitest/AI-assist tests yang relevan.
6. Jalankan schema parity/typecheck bila kontrak berubah.
7. Jalankan Next build bila README/state-only bukan satu-satunya perubahan web;
   jangan mengurangi gate karena ingin PASS.
8. Jalankan `graphify update .`.
9. Jalankan `git diff --check`.
10. Scan source, staged files, ledger, dan report untuk secret, `.env`, runtime
    DB, raw prompts yang sensitif, PID/log/cache, dan generated artifact yang
    tidak boleh di-commit.
11. Bersihkan setiap proses/service yang dibuat fase ini dan pastikan port
    3000/8000/8001/8002 bebas.

## Acceptance criteria

Phase 10C hanya boleh `DONE` jika:

- model DeepSeek V4 Flash benar-benar terverifikasi dan digunakan, atau live
  portion dilaporkan `BLOCKED` secara jujur tanpa fallback diam-diam;
- tidak satu pun fitur melewati 15 live calls;
- deterministic validation dan manual fallback terbukti;
- AI tidak memiliki numeric authority;
- audit P2-P62 lengkap dan konsisten dengan test/bukti;
- unsupported/blocked capability tidak disamarkan;
- key tidak terekspos atau ter-commit;
- local HEAD dan remote direkonsiliasi.

Jika key/model/provider tidak tersedia, jangan membuat fake benchmark. Gunakan
`BLOCKED` atau `CHANGES_REQUIRED` sesuai dampak dan laporkan jumlah call aktual.

## Commit dan feedback

Jika gate terpenuhi:

1. commit scoped implementation/report dengan pesan
   `docs(di): audit Feedback 1 and bounded AI benchmark`;
2. push branch remote yang sama;
3. tulis
   `G:\paax-ai-contextual-integration\PHASE_10C_LIVE_BENCHMARK_FEEDBACK1_AUDIT_FEEDBACK.md`;
4. commit feedback bila diperlukan;
5. rekonsiliasi local HEAD/remote dan hindari self-reference SHA.

Feedback final wajib memuat:

```text
PHASE:
STATUS:
MODEL:
WORKTREE:
BRANCH:
BASE COMMIT:
IMPLEMENTATION COMMIT:
FEEDBACK COMMIT:
POST-FEEDBACK HEAD/REMOTE:
AI FEATURE INVENTORY:
DEEPSEEK MODEL VERIFICATION:
LIVE CALL COUNTS PER FEATURE:
BUDGET ENFORCEMENT EVIDENCE:
DETERMINISTIC VALIDATION EVIDENCE:
MANUAL FALLBACK EVIDENCE:
NO-NUMERIC-AUTHORITY EVIDENCE:
P2-P62 AUDIT COVERAGE:
WORD RE-AUDIT EVIDENCE:
RED TEST EVIDENCE:
GREEN TEST EVIDENCE:
TYPECHECK/BUILD EVIDENCE:
SECURITY/SECRET SCAN:
PROCESS CLEANUP:
REMAINING CONCERNS:
NEXT RECOMMENDED ACTION:
QUOTA STATUS:
```

Setelah feedback final, berhenti. Jangan menjalankan Phase 11 sendiri.
