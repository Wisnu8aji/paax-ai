# Laporan C9b — Aktivasi Tab Review & Kesiapan Quantity

Tanggal: 2026-07-16
Branch: `feat/pckm-phase3-synthesis`
Scope acuan: `report/report_drawing_intelligence/LUNA_REPORT_WAVE_C78_2026-07-16.md` (endpoint backend baru) +
`report/report_drawing_intelligence/SONNET_REPORT_WAVE_C9_2026-07-16.md` (UI C9 sebelumnya).

## Orientasi (graphify-first)

`graphify query "review queue quantity readiness endpoint schemas"` dijalankan lebih dulu dari root.
Temuan kunci yang diikuti:

- Endpoint baru: `GET /projects/{id}/project-graph/review-queue` dan
  `GET /projects/{id}/project-graph/quantity-readiness` di `services/db/src/paax_db/main.py:725-746`,
  didukung `build_review_queue()`/`build_quantity_readiness()` di
  `services/db/src/paax_db/project_graph_review.py`.
- Skema Pydantic persis di `services/db/src/paax_db/schemas.py:431-491`
  (`ReviewReason`, `ReviewQueueItem`, `ReviewQueueSummary`, `ProjectGraphReviewQueueResponse`,
  `QuantityReadinessItem`, `QuantityReadinessSummary`, `QuantityReadinessResponse`).
- Zod setara sudah ada di `packages/schemas/src/index.ts:1859-1918`, tapi `dist/` belum di-rebuild
  sejak ditambahkan — sama seperti temuan C9 sebelumnya.

## Temuan penting yang mengubah rencana aksi Setujui/Tolak

Instruksi awal meminta aksi Setujui/Tolak per item queue memanggil
`POST .../corrections/{id}/resolve` **bila item berupa correction**. Setelah membaca
`build_review_queue()` (`project_graph_review.py:104-126, 197`), ditemukan bahwa:

- `ReviewQueueItem.id` adalah **kunci sintetis** `f"{category}:{target_type}:{target_id}"` —
  bukan pernah `ProjectGraphCorrection.id`.
- Tidak ada field `correction_id` pada `ReviewQueueItem`.
- Backend tidak punya endpoint list/GET untuk `ProjectGraphCorrection` (hanya
  `POST .../corrections` untuk create dan `POST .../corrections/{id}/resolve` untuk resolve) —
  jadi tidak ada cara memverifikasi di frontend id correction pending mana yang cocok dengan
  item queue mana.

Karena queue items (`conflict`/`missing_dimension`/`ambiguous_level`/`possibly_same`/`needs_review`)
dibangun murni dari state graph (bukan dari tabel `ProjectGraphCorrection`), tidak ada tautan aman
untuk memanggil resolve tanpa menebak id — risiko 404 atau (lebih buruk) salah target. Keputusan:
**seluruh tab Review dibuat read-only** untuk gelombang ini, menampilkan priority/reason/target/evidence
apa adanya, dengan catatan eksplisit di UI bahwa aksi menunggu backend menyediakan tautan correction
eksplisit per item. Klien API (`resolveCorrection()`) tetap disiapkan untuk pemanggil yang sudah
punya `correction_id` valid (mis. dari alur create-correction terpisah di masa depan), tapi tidak
dipanggil dari tombol manapun di tab ini — tidak ada fabrikasi id.

## Implementasi

Komponen baru (`apps/web/src/components/drawing-intelligence/`):
- `review-tab-panel.tsx` — daftar antrean dari `GET .../review-queue`: badge kategori
  (konflik/dimensi hilang/level ambigu/kemungkinan sama/perlu review), prioritas, reasons,
  occurrence_count, evidence refs. Read-only, dengan catatan penjelasan di atas.
- `quantity-readiness-panel.tsx` — daftar dari `GET .../quantity-readiness`: banner ringkasan
  (X ready/Y needs_review/Z blocked dari `summary`), badge readiness per element_type, drill-down
  expand/collapse menampilkan 5 flag boolean (`has_canonical_type`, dst.) dan `reasons`. Tidak ada
  tombol hitung apa pun.

Diubah:
- `drawing-intelligence-api.ts` — tambah `fetchReviewQueue()`, `fetchQuantityReadiness()`,
  `resolveCorrection()` (disiapkan, tidak dipanggil dari UI tab ini). Semua lewat proxy existing
  `/api/drawing-intelligence/*` — proxy route.ts TIDAK diubah (sudah generik `[...path]`, path baru
  otomatis diteruskan).
- `insights-panel.tsx` — tab "Review" dan "Kesiapan Quantity" diaktifkan (tidak lagi `disabled`),
  merender `ReviewTabPanel`/`QuantityReadinessPanel` dengan data/loading/error dari props baru.
- `drawing-intelligence-workspace.tsx` — dua `useEffect` baru memanggil `fetchReviewQueue()` dan
  `fetchQuantityReadiness()` saat proyek aktif berubah, state loading/error per panel, diteruskan ke
  `InsightsPanel`.
- `level-tree-panel.test.tsx` — fixture `makeSummaryView()` diperbarui menambah `corrections: []` dan
  `notes: []` pada objek summary/response — field ini sudah wajib di tipe Zod hasil rebuild dist tapi
  belum ada di fixture test C9 lama; tanpa ini `tsc --noEmit` merah (bukan terkait fitur C9b, murni
  drift skema dari gelombang lain yang perlu diselaraskan supaya verifikasi lulus).

Tidak ada perubahan pada `apps/web/src/app/api/drawing-intelligence/[...path]/route.ts` (proxy generik
sudah mencakup path baru tanpa modifikasi) maupun `packages/schemas/src/index.ts` (source tidak
disentuh, hanya `dist/` di-rebuild — sama seperti precedent C9).

## Kepatuhan Aturan Emas & batas scope

- UI 100% tampilan: badge readiness, flag boolean, reasons, priority — semua disalin apa adanya dari
  payload backend. Tidak ada operasi hitung/agregasi numerik baru (banner ringkasan Kesiapan Quantity
  memakai `summary.ready/needs_review/blocked` langsung dari response, bukan dihitung ulang).
- Tidak ada tombol hitung di tab Kesiapan Quantity, sesuai instruksi eksplisit.
- Aksi Setujui/Tolak TIDAK diimplementasikan sebagai tombol berfungsi karena tidak ada tautan
  correction_id yang valid dari backend saat ini (lihat bagian "Temuan penting" di atas) — ini
  keputusan sengaja menghindari fabrikasi data/aksi, bukan kelalaian.
- Empty-state jujur: kedua panel membedakan "belum ada snapshot" (snapshot_id kosong dari backend)
  vs "snapshot ada tapi antrean/kesiapan kosong".
- Tidak menyentuh Command Room, `services/*`, atau `packages/schemas/src/index.ts`.
- Tidak ada commit/push. Tidak ada atribusi AI di kode/komentar.

## Verifikasi nyata

1. `pnpm exec tsc --noEmit -p tsconfig.json` (di `apps/web`, setelah rebuild `packages/schemas` dist
   dan perbaikan fixture test) → **0 error**.
2. `pnpm exec vitest run` (seluruh suite web) → **17 file test, 71 test, semua lulus** — termasuk
   `command-room-ui.test.ts` (dilindungi CLAUDE.md §6) dan `level-tree-panel.test.tsx` (fixture C9
   yang diperbaiki).
3. `graphify update .` dijalankan setelah selesai → 6166 nodes, 12163 edges, 410 communities.

## Keterbatasan yang diketahui

- Tab Review sepenuhnya read-only untuk gelombang ini — aksi Setujui/Tolak menunggu backend
  menyediakan `correction_id` eksplisit per item queue (atau endpoint list-corrections untuk
  cross-reference aman). `resolveCorrection()` sudah tersedia di klien API untuk dipakai saat tautan
  itu ada.
- Item exception non-correction (`possibly_same`/`conflict`/`missing_dimension`/`ambiguous_level`/
  `needs_review`) tampil read-only sesuai instruksi — konsisten karena SEMUA kategori queue saat ini
  memang non-correction dari sudut pandang response backend.
- Belum ada uji end-to-end melawan DB API nyata dengan snapshot Project Graph aktif berisi item queue
  sungguhan — verifikasi dibatasi pada tsc + test unit/render komponen existing, sesuai scope yang
  diminta (tidak ada test baru ditambahkan khusus untuk 2 panel baru karena instruksi menyebut
  verifikasi lewat tsc + suite web yang sudah ada, bukan menuntut test unit baru per komponen).

## Path relevan

- `apps/web/src/components/drawing-intelligence/review-tab-panel.tsx` (baru)
- `apps/web/src/components/drawing-intelligence/quantity-readiness-panel.tsx` (baru)
- `apps/web/src/components/drawing-intelligence/drawing-intelligence-api.ts`
- `apps/web/src/components/drawing-intelligence/insights-panel.tsx`
- `apps/web/src/components/drawing-intelligence/drawing-intelligence-workspace.tsx`
- `apps/web/src/components/drawing-intelligence/level-tree-panel.test.tsx`
- `packages/schemas/dist/*` (rebuild artifact saja, source tidak berubah)
