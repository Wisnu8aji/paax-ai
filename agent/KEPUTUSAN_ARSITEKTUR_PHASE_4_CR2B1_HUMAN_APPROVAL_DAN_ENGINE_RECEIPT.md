# KEPUTUSAN ARSITEKTUR PAAX — PHASE 4 CR2B1
## Human Approval Boundary, Agent Authority, dan Persisted Deterministic Engine Receipt

Dokumen ini menghilangkan ambiguitas arsitektur yang ditemukan Terra. Implementasi dilakukan oleh Terra sebagai wiring mekanis terhadap keputusan berikut. Aturan Emas tetap berlaku: AI/agent tidak menghitung dan tidak menyetujui inputnya sendiri.

## 1. Keputusan otoritas

### Agent/AI boleh

- membaca project/snapshot/sheet/evidence/candidate;
- membuat proposal classification, binding, correction, atau mapping;
- menjalankan deterministic validation;
- menempatkan proposal ke antrean human review;
- setelah approval manusia sudah tersimpan, memicu core-engine menggunakan ID fact/mapping saja;
- membaca dan menjelaskan persisted receipt.

### Agent/AI dilarang

- mengubah correction/proposal/mapping menjadi `accepted` atau `approved`;
- menyuplai angka, dimensi, formula, result, unit final, atau rule buatan sendiri ke engine;
- memakai service identity sebagai human reviewer;
- menulis quantity/RAB/Handoff tanpa receipt;
- mengubah receipt atau MeasurementFact yang immutable.

## 2. State machine review yang diputuskan

State canonical:

`proposed_by_rule_or_agent → deterministic_validated → pending_human_review → human_approved | human_rejected | human_corrected`

Ketentuan:

- `drawing.review_proposal` tidak lagi melakukan resolve/accept/reject.
- Tool agent tersebut menjadi **recommendation/proposal writer** saja. Nama lama boleh dipertahankan sementara untuk compatibility, tetapi input decision hanya disimpan sebagai `agent_recommendation`; status tetap `pending_human_review`.
- Fallback 404 yang mengembalikan objek “reviewed” palsu dihapus. Upstream 404 adalah failure.
- `scoped-tools.ts` tidak boleh memberi default `accepted`, synthetic proposal ID, atau `requiresApproval=false` untuk review.
- Human resolution dilakukan melalui endpoint terpisah dan event audit menyimpan actor manusia, role, timestamp, note, dan revision.
- Correction menghasilkan revision baru; accepted state tidak mengubah immutable source evidence.

## 3. Pemisahan identitas service dan manusia

Shared key dengan scopes global tidak cukup untuk membedakan agent dari user proxy. Terapkan portable identity registry minimal:

- credential acak berbeda untuk `web-user-proxy`, `ai-orchestrator`, `document-intelligence`, `core-engine-client`, dan service lain yang membutuhkan auth;
- registry menyimpan hash credential, service identity, dan allowlisted scopes; file dilindungi ACL user-only;
- setiap child hanya menerima credential miliknya melalui environment memory;
- raw key tidak masuk source, manifest, command line, atau log;
- DB memvalidasi key → identity/scopes dari registry; header caller tidak boleh menaikkan scope;
- `ai-orchestrator` mendapat `agent:propose`, `agent:calculate`, dan read scopes, tetapi **tidak** mendapat `human:approve`;
- `web-user-proxy` dapat membawa actor manusia terverifikasi. Pada portable single-user, actor berasal dari local-owner session yang dibuat startup dan terikat pada web proxy credential; pada production, actor berasal dari user JWT/session;
- endpoint approval mensyaratkan role owner/PM/estimator sesuai domain dan scope `human:approve`, serta menolak agent/service identity walaupun mengetahui ID proposal;
- test wajib membuktikan orchestrator credential mendapat 403 pada semua approval endpoint.

Jangan mengganti ini dengan header `X-Service-Name` yang dapat dipalsukan memakai shared key.

## 4. Persisted calculation receipt

Buat model immutable `CalculationReceipt` melalui migration resmi. Field minimum:

- `receipt_id` UUID;
- `project_id`, `snapshot_id`;
- `mapping_id`, `mapping_revision`, `work_item_node_id`;
- ordered `measurement_fact_ids` beserta fact revisions/supersession state;
- `calculation_type`, `rule_id`, `engine_version`;
- `canonical_request` JSON;
- `input_hash` SHA-256 dari canonical request penuh;
- `engine_calculation_id`;
- `status`: `complete | blocked | needs_input | superseded`;
- `result` decimal nullable dan `unit` nullable;
- `formula_id`/formula name; substituted formula hanya audit, bukan authority UI;
- evidence refs;
- `human_approval_event_id`, `approved_by`;
- `requested_by_service`, `requested_by_actor`;
- `idempotency_key`;
- `parent_receipt_id` nullable;
- `created_at`, `superseded_at`.

Constraints:

- unique `(project_id, idempotency_key)`;
- unique complete receipt untuk input hash + active mapping revision;
- receipt immutable; perubahan input/mapping membuat receipt baru dan receipt lama `superseded` melalui explicit lineage event;
- decimal disimpan tanpa round-trip float loss;
- blocked/needs_input receipt tidak memiliki authoritative result.

## 5. Canonical calculation flow

Satu service function di DB menjadi jalur tunggal untuk agentic calculate dan RAB materialize:

1. authenticate caller dan project scope;
2. resolve active snapshot;
3. load mapping human-approved beserta approval audit/event;
4. load MeasurementFacts human-verified, tidak superseded, project/snapshot sama;
5. validasi exact fact set, evidence, type/unit, dan calculation type allowlist;
6. bentuk canonical request server-side; caller hanya mengirim mapping/fact IDs + idempotency key;
7. jika receipt idempotent sudah ada, return receipt itu;
8. panggil core-engine boundary;
9. validasi engine response;
10. persist immutable receipt dan audit event secara transaction-safe;
11. return receipt schema, bukan transient engine response.

Agent boleh memicu langkah 6–11 hanya karena approval manusia telah lebih dahulu tersimpan. Ini bukan auto-approval.

`materialize_rab_bridge_proposal` wajib memakai function/receipt yang sama; hapus jalur kalkulasi transient duplikat.

## 6. Quantity dan Handoff

- `measurement_verified` menampilkan fakta terukur tetapi bukan hasil perhitungan final.
- `engine_verified` hanya berasal dari receipt `complete` yang aktif.
- Quantities membaca persisted receipts.
- Handoff hanya mengekspor receipt `complete`, human-approved lineage valid, dan tidak superseded.
- Agent hanya menjelaskan receipt; angka tidak disalin dari output LLM.

## 7. Perilaku data PLHUT saat ini

- Jangan memaksa fact 4.5 m menjadi receipt bila calculation rule hanya pass-through atau bukti tidak lengkap.
- Jika mapping/rule/facts tidak cukup, status tetap `measurement_verified` atau `blocked/needs_input` tanpa angka final.
- Untuk membuktikan receipt production, gunakan hanya kombinasi MeasurementFacts PLHUT yang benar-benar memiliki evidence dan approval. Jika belum ada, alur human review harus menghasilkan input terstruktur melalui tindakan manusia/test actor yang sah, bukan seed/dummy.
- Golden synthetic input hanya untuk isolated core-engine test dan tidak masuk portable DB/API/UI.

## 8. Test wajib

- agent recommendation menghasilkan pending review, bukan accepted;
- orchestrator credential ditolak pada approval;
- human portable owner/production JWT dapat approve sesuai RBAC;
- cross-project/fact/mapping/receipt reuse ditolak;
- AI numeric payload ditolak;
- stale/superseded fact ditolak;
- idempotent retry mengembalikan receipt sama;
- changed input membuat revision receipt baru dan supersedes lama;
- recompute verifier cocok;
- agentic calculate dan RAB materialize memakai receipt service yang sama;
- Quantities/Handoff tidak membaca transient result;
- restart mempertahankan review, approval, receipt, Mission run, dan Handoff.

Tidak ada test live yang boleh skip.
