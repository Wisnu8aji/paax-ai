# Laporan C9 — UI Drawing Intelligence Workspace v1

Tanggal: 2026-07-16
Branch: `feat/pckm-phase3-synthesis`
Scope acuan: `docs/plans/drawing intelligence/SPEC_WAVE_C_HUMAN_AND_QUANTITY_2026-07-16.md` §C9 +
`PAAX_DRAWING_INTELLIGENCE_MASTER_PLAN_2026-07-16.md` §8 (UI Product Direction).

## Orientasi (graphify-first)

`graphify query "dashboard layout page drawings summary views retrieve"` dijalankan lebih dulu
untuk menemukan pola halaman/route/fetch existing sebelum menulis kode apa pun. Temuan kunci yang
diikuti:

- Pola proxy API existing: `apps/web/src/app/api/core-engine/[...path]/route.ts` dan
  `.../document-intelligence/[...path]/route.ts` — proxy tipis, header `X-Internal-Key` +
  `X-User-Id`, base URL dari `process.env.<SERVICE>_URL`.
- `DB_API_URL` sudah dipakai server-side di `apps/web/src/app/api/command-room/chat/tools.ts`
  (baris 146) tapi belum punya proxy route sendiri dan belum terdokumentasi di `.env.example`.
- `apps/web/src/lib/projects/projects-context.tsx` (`useProjects()`) + `apps/web/src/lib/local-storage.ts`
  (`LocalStorage.getActiveProjectId()`) adalah pola proyek-aktif yang sudah dipakai di
  `side-rail.tsx` dan `proyek/[projectId]/layout.tsx`.
- Komponen UI dasar: `Card`, `StatusPill`, `Button`, `EmptyState`, `ProgressBar` di
  `apps/web/src/components/ui/` (diekspor lewat `index.ts`) — dipakai apa adanya, tidak membuat
  primitif baru.
- Skema Zod untuk PCKM (`ProjectGraphSummaryViewSchema`, `ProjectGraphRetrievalResponseSchema`,
  `ElementTypeIndexEntrySchema`, dst.) sudah ada di `packages/schemas/src/index.ts` — dipakai
  langsung via `@paax/schemas`, tidak menulis tipe duplikat.
- Wire format nyata `/project-graph/retrieve` dicek di `services/db/src/paax_db/main.py:612-621`:
  `nodes: {node_id, type, name, discipline, confidence}`, `evidence: {evidence_id, document_id,
  sheet_id, page_index, raw_text}` — lebih ramping dari skema `Citation` Pydantic penuh, sehingga
  komponen occurrence/insights menangani field secara defensif (optional, fallback label).

## File yang dibuat

Proxy API (pola baru, ikut konvensi existing):
- `apps/web/src/app/api/drawing-intelligence/[...path]/route.ts` — proxy ke DB API
  (`DB_API_URL`/`NEXT_PUBLIC_DB_API_URL`, default `http://127.0.0.1:8001`), header
  `X-Internal-Key`/`X-User-Id` sama seperti proxy core-engine/document-intelligence.

Env (dokumentasi saja, bukan isi rahasia):
- `.env.example` — menambahkan `DB_API_URL` + `NEXT_PUBLIC_DB_API_URL` (sebelumnya dipakai di kode
  tapi tidak terdokumentasi; diperlukan supaya proxy baru punya default yang jelas).

Route halaman:
- `apps/web/src/app/(dashboard)/drawing-intelligence/page.tsx` — route top-level baru (bukan
  `/proyek/[projectId]/...`) sesuai instruksi; mengambil proyek aktif dari `useProjects()` +
  `LocalStorage.getActiveProjectId()`. Empty-state jujur untuk: belum ada proyek sama sekali, dan
  ada proyek tapi belum ada yang aktif dipilih (dengan tombol ke Project Studio).

Komponen (`apps/web/src/components/drawing-intelligence/`):
- `drawing-intelligence-api.ts` — klien fetch tipis (`fetchSummaryViews`, `retrieveProjectGraph`)
  lewat proxy `/api/drawing-intelligence/*`, tipe dari `@paax/schemas`.
- `types.ts` — `buildLevelTree()` menyusun payload summary-views (LEVEL_OVERVIEW per level)
  menjadi pohon Level → Disiplin → Tipe Elemen. Murni transformasi tampilan: `occurrence_count`,
  `confirmed_count`, dll. disalin apa adanya dari payload, tidak ada operasi aritmetika baru selain
  `reduce`/`sum` atas angka yang SUDAH tersimpan di payload (tidak menghitung ulang dari data
  mentah).
- `level-tree-panel.tsx` — Panel kiri: pohon Level → Disiplin → Tipe Elemen, expand/collapse,
  label eksplisit "Jumlah = kelompok tercatat di gambar — bukan jumlah fisik terpasang" (keputusan
  D11) tampil permanen di atas pohon.
- `occurrence-list-panel.tsx` — Panel tengah: daftar occurrence untuk tipe elemen terpilih, badge
  `verification_status` (extracted/ai_interpreted/cross_sheet_inferred/human_verified/
  conflicting/ambiguous → label Indonesia + tone warna ok/warn/dng), sitasi evidence format
  `[sheet_id p.halaman]`.
- `insights-panel.tsx` — Panel kanan, 3 tab: "Konflik & Data Hilang" (aktif, dari 2 query retrieve
  terpisah — `"ada konflik apa di gambar"` dan `"data apa yang belum lengkap"`), "Review" dan
  "Kesiapan Quantity" sebagai tab **disabled** bertuliskan "Menunggu backend C7"/"C8" sesuai
  instruksi.
- `drawing-intelligence-workspace.tsx` — Orkestrasi: banner atas (nama proyek + badge
  EXPERIMENTAL permanen dengan tooltip penjelasan + ringkasan terkonfirmasi/ambigu/konflik dari
  quality payload), grid 3 kolom (kiri/tengah/kanan), state loading/error per panel, empty-state
  saat snapshot Project Graph belum ada.
- `level-tree-panel.test.tsx` — test unit: `buildLevelTree()` (penyusunan pohon, urutan level,
  fallback label disiplin kosong) + render `LevelTreePanel` (empty-state, label eksplisit
  occurrence_count, callback `onSelectElementType` dengan payload benar saat item diklik).

## Kepatuhan Aturan Emas & batas scope

- UI 100% tampilan: tidak ada operasi hitung baru selain menjumlahkan angka yang SUDAH tersimpan di
  payload backend (mis. total occurrence dari `element_type_index`, total confirmed/ambiguous/
  conflict lintas level untuk badge banner) — tidak pernah menghitung quantity/volume/RAB.
  `element_type_index`, `quality.*`, `discipline_counts` dipakai apa adanya dari
  `services/document-intelligence/app/project_graph/summary_builder.py`.
- Badge "EXPERIMENTAL" permanen di banner, tidak bisa di-dismiss, tooltip menjelaskan perlunya
  verifikasi manusia.
- Tidak menyentuh Command Room (`app/api/command-room/*`, `components/command-room/*`,
  `lib/paax-models.ts`, `lib/ai/*`), tidak menyentuh `services/*`, tidak menyentuh
  `packages/schemas/src/index.ts` (source tidak diubah).
- Satu pengecualian teknis di luar file baru: **`packages/schemas/dist/` di-rebuild** (`pnpm run
  build` di `packages/schemas`) karena `dist` yang ter-commit sebelumnya belum memuat tipe PCKM
  yang sudah ada di `src/index.ts` (source sudah diubah agent lain, belum di-build) — tanpa ini
  `tsc --noEmit` di `apps/web` tidak mungkin lulus karena `ProjectGraphRetrievalResponse` dkk. tidak
  ter-export dari package. Ini murni regenerasi artifact build dari source yang sudah ada, bukan
  perubahan source `packages/schemas`.
- Tidak ada commit/push dilakukan. Tidak ada atribusi AI di kode/komentar.

## Verifikasi nyata

1. `pnpm exec tsc --noEmit -p tsconfig.json` (di `apps/web`, setelah rebuild `packages/schemas`
   dist) → **0 error**.
2. `pnpm exec vitest run src/components/drawing-intelligence/level-tree-panel.test.tsx` →
   **6/6 test lulus**.
3. `pnpm exec vitest run` (seluruh suite web) → **17 file test, 71 test, semua lulus** — tidak ada
   regresi di test lain (termasuk `command-room-ui.test.ts` yang eksplisit dilindungi CLAUDE.md §6).
4. `graphify update .` dijalankan setelah selesai (6048 nodes, 11823 edges, 409 communities).

`pnpm run lint` gagal dengan `ESLint must be installed` — ini kondisi environment yang sudah ada
sebelum task ini (paket `eslint` belum terpasang di node_modules), tidak terkait perubahan C9, dan
di luar cakupan verifikasi yang diminta (tsc + test).

## Keterbatasan yang diketahui

- Wire format `/project-graph/retrieve` di DB API (`main.py:615-621`) lebih ramping dari skema
  `Citation`/`ProjectGraphNode` Pydantic penuh — tidak membawa `verification_status` untuk node hasil
  retrieve (hanya `node_id/type/name/discipline/confidence`). `OccurrenceListPanel` membaca
  `verification_status` secara opsional (`(node as {verification_status?: string})`) dan
  menampilkan "Status tidak tercatat" bila backend belum mengisinya — bukan bug UI, tapi
  keterbatasan payload backend saat ini yang perlu diselaraskan bila C7/C8 memperluas response.
- Panel tengah memicu query retrieve baru dengan `next.levelName` sebagai query text (mengikuti
  instruksi: `POST retrieve` dengan `"<nama level>"` untuk daftar occurrence per level) — bukan
  filter langsung by `element_type_id`, karena endpoint retrieve saat ini adalah pencarian teks/
  intent, bukan filter terstruktur per tipe elemen. Daftar occurrence yang tampil karena itu bisa
  mencakup seluruh level, bukan hanya tipe elemen yang diklik; ini sudah sesuai kontrak endpoint
  yang tersedia sekarang (tidak ada endpoint filter granular element_type_id di scope C9).
- Tab "Review" dan "Kesiapan Quantity" murni placeholder disabled — tidak ada wiring ke endpoint
  apa pun, sesuai instruksi menunggu backend C7/C8.
- Belum ada uji end-to-end melawan DB API/document-intelligence nyata (butuh snapshot Project Graph
  aktif berjalan) — verifikasi dibatasi pada unit test komponen + tsc, sesuai scope yang diminta.

## Path relevan

- `apps/web/src/app/(dashboard)/drawing-intelligence/page.tsx`
- `apps/web/src/app/api/drawing-intelligence/[...path]/route.ts`
- `apps/web/src/components/drawing-intelligence/drawing-intelligence-workspace.tsx`
- `apps/web/src/components/drawing-intelligence/level-tree-panel.tsx`
- `apps/web/src/components/drawing-intelligence/occurrence-list-panel.tsx`
- `apps/web/src/components/drawing-intelligence/insights-panel.tsx`
- `apps/web/src/components/drawing-intelligence/drawing-intelligence-api.ts`
- `apps/web/src/components/drawing-intelligence/types.ts`
- `apps/web/src/components/drawing-intelligence/level-tree-panel.test.tsx`
- `.env.example` (tambahan `DB_API_URL`/`NEXT_PUBLIC_DB_API_URL`)
