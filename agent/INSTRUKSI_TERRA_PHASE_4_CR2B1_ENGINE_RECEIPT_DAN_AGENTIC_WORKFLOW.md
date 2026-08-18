# INSTRUKSI TERRA — PHASE 4 CR2B1
## Persisted Engine Receipt dan Mission→Review→Engine→Handoff Workflow

Lanjutkan di `G:\paax-ai-contextual-integration`, branch `codex/phase4-truth-remediation`, dari commit CR2A `9ff9adbc`. Enam server CR2A sedang sehat. Jangan reset/rebase/amend/merge.

Fokus hanya backend/workflow CR2B1. UI visual dan browser final dikerjakan setelah backend truth chain ini hijau.

## 1. Audit dan desain receipt berdasarkan arsitektur existing

- Graphify query/path alur MeasurementFact, RAB materialization mapping, core-engine calculation request/result, Review correction, agent runs, dan Handoff.
- Jangan membuat engine kedua di DB/TypeScript.
- MeasurementFact bukan hasil engine.
- Mapping approval bukan receipt.
- AI proposal bukan human approval.
- Tentukan schema persisted calculation receipt yang menyimpan request canonical, input hash, engine/rule version nyata, result, unit, timestamp, evidence/fact IDs, approval lineage, project/run scope, status, dan idempotency key.
- Gunakan migration resmi berikutnya dan selaraskan ORM, Pydantic, Zod, serta frontend API types.

## 2. Implementasikan deterministic engine receipt nyata

Alur wajib:

1. load MeasurementFact human-approved dan mapping approved;
2. validasi project scope, evidence, unit, completeness, dan rule applicability;
3. bentuk canonical calculation request;
4. panggil `services/core-engine` melalui boundary existing;
5. validasi response contract;
6. hitung canonical input hash dari request yang benar-benar dikirim;
7. persist immutable receipt dan links;
8. replay idempotency mengembalikan receipt sama tanpa duplikasi;
9. perubahan input/fact menghasilkan receipt revision baru dan supersede lineage, bukan overwrite;
10. recompute verifier menghasilkan output yang sama.

Jangan memakai pass-through MeasurementFact sebagai “perhitungan” jika rule engine tidak benar-benar menghitung. Audit fact PLHUT 4.5 m yang tersedia: bila tidak cukup untuk rule tertentu, pertahankan `measurement_verified` dan beri blocked reason. Jangan mengarang dimensi/count/rule. Receipt produksi hanya boleh dibuat dari bukti PLHUT yang cukup dan approval sah.

Test golden synthetic/manual anchor boleh dipakai untuk membuktikan engine secara terisolasi, tetapi tidak boleh masuk endpoint/data produksi atau dilaporkan sebagai quantity PLHUT.

## 3. Sambungkan candidate ledger ke receipt secara jujur

- `engine_verified` hanya jika persisted receipt status valid tersedia.
- Response harus menyertakan receipt ID, rule/version, fact/evidence links, input hash, result/unit, approval status, dan audit URL/endpoint.
- `measurement_verified` tetap terpisah.
- Blocked/review items tidak memiliki result.
- Reconciliation totals harus tetap seimbang setelah receipt ditambahkan.

## 4. Mission/agentic workflow nyata

Implementasikan dan buktikan alur project-scoped:

- create Mission/agent run;
- agent membaca active project/sheet context dan candidate/evidence;
- agent hanya membuat proposal classification/binding/input mapping;
- deterministic validation;
- proposal masuk Review queue;
- actor ber-RBAC approve/reject/correct;
- hanya human-approved structured input yang dapat memicu engine;
- engine menghasilkan persisted receipt;
- Quantities membaca receipt;
- Handoff hanya membaca receipt valid;
- run/event/review/receipt tetap ada setelah service restart.

Tool allowlist, timeout, cancellation, retry, idempotency, audit event, RBAC allow/deny, dan provider failure/manual fallback wajib diuji. Agent/LLM tidak boleh menghasilkan angka atau auto-approve.

Tidak perlu live AI untuk membuktikan state machine: gunakan deterministic/offline provider atau manual proposal test yang jelas. Live AI tetap terkunci sampai CR2B2 final gate dan maksimum 5 panggilan per fitur.

## 5. API dan security tests

Semua valid request melalui port 3000 wajib tepat 200:

- Mission create/read/step/cancel/retry;
- review list/approve/reject/correct;
- engine materialize/recompute receipt;
- quantity ledger read;
- Handoff read/export of verified-only data.

Test terpisah harus membuktikan unauthorized actor, cross-project receipt/fact reuse, stale revision, duplicate idempotency, invalid unit, incomplete evidence, dan AI-authored number ditolak.

Tidak boleh skip. Service mati atau endpoint tidak tersedia adalah FAIL.

## 6. Migration dan restart proof

- Uji migration pada salinan portable lalu aktif, non-destruktif dan idempotent.
- Buat backup/checksum evidence.
- Commit CR2B1.
- Clean stop/start agar enam service melaporkan commit baru dan dirty=false.
- Jalankan full offline + live API suite zero skipped.
- Restart sekali lagi dan buktikan Mission/review/receipt/handoff persistence.
- Jalankan schema typecheck, web build, security/no-dummy, engine tests, dan Graphify update.

## Gate CR2B1

PASS hanya jika:

- receipt nyata immutable/persistent/recomputable tersedia untuk setiap item berstatus engine_verified;
- tidak ada receipt produksi palsu;
- Mission→Review→Engine→Quantities→Handoff berjalan via API dan persisten;
- RBAC/idempotency/project isolation/fail-closed lulus;
- enam service sehat pada commit CR2B1;
- zero skipped live tests;
- semua test/build/schema/migration/security/Graphify hijau;
- commit dibuat, belum perlu push/PR.

Append laporan Phase 4 dengan `CORRECTION ROUND 2B1` dan akhiri:

- `PHASE 4 CR2B1 PASS — READY FOR CR2B2 UI/REAL BROWSER`
- `PHASE 4 CR2B1 FAIL/BLOCKED — DO NOT CONTINUE`

Kirim ringkasan final ke root lalu berhenti. Jangan merge.
