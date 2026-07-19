# PHASE 7 COMPLETION REPORT
## Mandat: Revision Lineage dan Incremental Synthesis

**Branch:** `feat/drawing-intelligence-truth-rebuild`  
**Status:** Fondasi persistence dan effective truth selesai; producer incremental penuh dan remediasi seluruh stable ID dicatat sebagai residual.

## 1. Status sub-item 13.1--13.5

### 13.1 Revision model — selesai

Model SQLAlchemy baru `DocumentRevision` dan `SheetRevision` menyimpan:

- issue date dan issue purpose;
- status, effective date, serta `is_active`;
- hubungan `supersedes_revision_id` dan `superseded_by_revision_id`;
- revision cloud regions per sheet;
- project, document, document-revision, dan sheet lineage.

Migration `0016_revision_lineage.py` menambahkan kedua tabel tersebut dan `effective_sheet_revision_ids` pada snapshot. Upgrade bersifat additive; downgrade menghapus tabel/index baru lalu kolom snapshot tersebut.

### 13.2 Effective truth — selesai

`get_active_snapshot()` sekarang hanya mengembalikan snapshot aktif yang mendeklarasikan tepat seluruh `SheetRevision` efektif proyek. Setelah revision sheet baru diaktifkan, snapshot lama tidak dapat dipakai retrieval sampai snapshot dengan scope revision baru tersedia. Snapshot lama dan evidence-nya tetap disimpan sebagai audit trail.

`build_and_activate_snapshot()` fail-closed untuk proyek yang sudah memiliki revision aktif: snapshot wajib menyatakan scope revision efektif dan seluruh evidence-nya wajib memiliki `revision_id` dari scope tersebut. Request Pydantic untuk build snapshot meneruskan field ini; belum ada consumer frontend untuk kontrak revision internal ini, sehingga tidak ada schema Zod yang relevan untuk diubah.

### 13.3 Dependency graph — tercakup secara implisit

Rantai Artifact → Evidence → Observation/Entity Candidate → Node/Edge sudah dicatat lewat evidence v2, `ProjectGraphNodeEvidence`, dan `ProjectGraphEdgeEvidence`. Hilirnya tercakup oleh `ProjectGraphSummaryView`, `ProjectGraphRetrievalCache`, `RabBridgeProposal`, serta `ProjectGraphCorrection`. Fase ini tidak menambahkan graph kedua yang redundan; `IncrementalResynthesisPlan` memakai relasi evidence tersebut untuk menghitung closure dampak halaman.

### 13.4 Incremental invalidation — selesai untuk persistence orchestration

`plan_incremental_resynthesis()` adalah jalur opsional per halaman. Ia:

1. memilih evidence berdasarkan project, document, sheet, page, dan revision;
2. menemukan node dan edge yang didukung evidence tersebut, termasuk edge yang terhubung ke node terdampak;
3. menentukan level summary yang perlu dibangun ulang;
4. mengidentifikasi accepted correction terdampak untuk evaluasi saat snapshot baru dibangun;
5. menghapus retrieval cache hanya milik snapshot terdampak.

Evidence/snapshot lama tidak dimutasi karena immutable. Producer harus membangun ulang observasi dan fragment graph dari plan tersebut lalu memanggil `build_and_activate_snapshot()` untuk snapshot revision baru. Carry-forward atau status `stale` correction target sudah ditangani oleh activation snapshot yang ada dan tetap dilindungi test review workflow.

**Residual:** integrasi producer yang otomatis memanggil plan ini dan menyusun fragment observasi/entity candidate baru belum ditambahkan. Itu berada pada pipeline `services/document-intelligence` dan sengaja tidak diubah agar tidak berkonflik dengan pekerjaan resolver Fase 6 paralel.

### 13.5 Stable IDs — audit selesai, remediasi menyeluruh residual

Synthesis, conflict resolver, dan cross-sheet resolver memakai hash deterministik dari semantic input; persistence tidak menghasilkan ID baru. Namun audit menemukan `services/document-intelligence/app/project_graph/page_patch.py` masih memasukkan `position` dari list observasi dalam ID node/fact tertentu. Ini tidak memenuhi sepenuhnya requirement lintas-rebuild bila urutan producer berubah.

Tidak ada perubahan pada jalur tersebut dalam fase ini: scope eksekusi dibatasi ke model revision/lineage dan persistence, sementara resolver sedang diubah oleh agen paralel. Residual berikutnya adalah mengganti `position` dengan fingerprint semantic berbasis canonical content, bbox/evidence identity, dan revision lineage; duplicate yang tidak dapat dibedakan harus fail closed, bukan dianggap quantity fisik.

## 2. Bukti test nyata

Perintah yang dijalankan dari `services/db`:

```text
python -m pytest tests/test_project_graph_persistence.py -q
8 passed, 2 warnings in 3.27s

python -m pytest tests/test_project_graph_persistence.py tests/test_project_graph_review_workflow.py -q
14 passed, 2 warnings in 5.55s
```

Test baru membuktikan sheet revision baru mensupersede revision lama, snapshot lama menjadi tidak retrievable saat scope revision tidak lagi efektif, retrieval default hanya mengembalikan node/evidence revision baru, dan plan incremental hanya mencakup evidence/node/edge/level halaman berubah serta cache snapshotnya. Test review workflow yang tetap hijau mencakup carry atau stale accepted correction ketika target tidak ada pada snapshot baru.

Tidak ada pemanggilan API AI live.

## 3. File yang diubah Fase 7

- `services/db/src/paax_db/models.py`
- `services/db/src/paax_db/project_graph_repository.py`
- `services/db/src/paax_db/main.py`
- `services/db/src/paax_db/schemas.py`
- `services/db/alembic/versions/0016_revision_lineage.py`
- `services/db/tests/test_project_graph_persistence.py`
- `docs/plans/drawing intelligence/Versi 1.1/PHASE_7_COMPLETION_REPORT.md`

## 4. Commit dari akhir Fase 5 sampai HEAD saat laporan dibuat

```text
53d3c03 docs(di): add Phase 5 completion report
14bb9df feat(di): add constraint resolver module for Phase 6
24e8c37 feat(di): extend VerificationStatus, EdgeResolver and ProjectGraphEdge models for Phase 6
403d6cb feat(schemas): extend VerificationStatus, EdgeResolver, and ProjectGraphEdge Zod schemas for Phase 6
c5fd593 test(di): add constraint resolver unit and integration tests
0b89fb9 feat(di): add revision lineage and effective snapshot scope
```

Perubahan `cross_sheet_resolver.py` yang masih tidak tercommit adalah pekerjaan agen Fase 6 paralel dan tidak termasuk perubahan Fase 7.

## 5. Graphify

Graphify query digunakan sebelum inspeksi source untuk persistence, retrieval, evidence revision, migration, tests, dan stable IDs. Setelah perubahan, `graphify update .` selesai dengan 7,080 nodes dan 13,639 edges; HTML graph dilewati otomatis karena graph melampaui batas 5,000 nodes.
