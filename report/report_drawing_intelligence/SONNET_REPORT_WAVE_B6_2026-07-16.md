# SONNET Report Wave B6 — Tool Command Room v2

Tanggal: 2026-07-16
Branch: `feat/pckm-phase3-synthesis`

## Ringkasan

SPEC B6 (`docs/plans/drawing intelligence/SPEC_WAVE_B_QUERY_UNDERSTANDING_2026-07-16.md`)
telah diimplementasikan pada tool `query_project_graph` (Command Room, ai-orchestrator).
Seluruh kalimat workaround lama ("kirim HANYA nama lantai persis... jangan gabungkan...")
sudah dihapus dari declaration tool dan dari `TOOL_SYSTEM_SUFFIX`. Tool sekarang
memakai body v2 (`use_intent: true`) ke endpoint retrieve yang sama, dan meneruskan
`data_status`/`intent`/`summary_view`/`guidance`/`notes` dari response v2 ke model.
Tidak ada commit atau push.

## Temuan penting sebelum implementasi

Endpoint `POST /projects/{id}/project-graph/retrieve` (services/db, diimplementasikan
Luna di B5) HANYA menerima field body: `query, use_intent, depth, budget_tokens,
relations, traversal_mode, target_node_id` (`services/db/src/paax_db/schemas.py:368`,
`ProjectGraphRetrievalRequest`). Field `level`/`discipline`/`node_types`/`limit` yang
diminta SPEC B6 sebagai param opsional di tool declaration **tidak punya slot body
terpisah di backend nyata** — filter lokasi/disiplin backend HANYA diturunkan oleh
parser intent B4 yang membaca teks `query` (dikonfirmasi lewat
`services/db/src/paax_db/project_graph_retrieval.py:262-263`,
`applied_filters["level"]`/`["discipline"]` berasal dari `plan.filters`, hasil parsing
teks). Field itu ada di dokumen plan kanonik §17.2 (`search_project_graph`,
`PAAX_DEM_PCKM_GRAPH_COMMAND_ROOM_PLAN_2026-07-14.md`) sebagai visi desain granular
multi-tool asli, tapi arsitektur nyata yang berjalan (retrieve v2 tunggal) belum
mengekspos itu sebagai field HTTP.

Karena mengirim field itu sebagai body JSON terpisah akan diam-diam diabaikan Pydantic
(default `extra="ignore"`) — silent no-op yang menyesatkan pemanggil tool — keputusan
desain: param opsional `level`/`discipline`/`node_types` dilipat sebagai klausa
tambahan ke teks `query` yang benar-benar dikirim (satu-satunya jalur yang memengaruhi
parser B4). Param `limit` tidak punya padanan semantik di backend sama sekali (backend
tidak punya node-count cap, hanya `budget_tokens` yang unitnya token) — dipotong di
sisi tool sesudah backend menjawab, murni *slicing* array (bukan perhitungan/agregasi),
sehingga tetap sesuai Aturan Emas dan tidak mengklaim backend melakukan sesuatu yang
tidak dilakukannya.

## Perubahan per file

| File | Perubahan |
|---|---|
| `services/ai-orchestrator/src/tools/query_project_graph.ts` | Ditulis ulang. Declaration: `query` (wajib, frasa alami), `level`/`discipline`/`node_types`/`limit` (opsional, sesuai §B6). Executor: body v2 `{query: enrichedQuery, use_intent: true}` (level/discipline/node_types dilipat ke `enrichedQuery`; `limit` dipotong client-side lewat `applyLimit()`). Cabang khusus untuk `data_status`: `calculation_required` (meneruskan `guidance`/`rab_bridge_available` apa adanya, TIDAK PERNAH menghitung, `note` eksplisit melarang model menghitung sendiri), `unknown_level` (jujur bilang level tidak dikenal, tidak menebak). Jalur normal meneruskan `intent`, `applied_filters`, `nodes`, `evidence` (format sitasi `[sheet_id p.halaman]` dipertahankan persis), `summary_view`, `notes`, `missing_information`. Seluruh kalimat workaround lama dihapus dari description tool. |
| `services/ai-orchestrator/tests/tools/query_project_graph.test.ts` | Ditulis ulang. Menambah test: body v2 terkirim (`use_intent: true`, tanpa field legacy `depth`/`traversal_mode`), level/discipline/node_types terlipat ke teks query, `calculation_required` (dengan & tanpa guidance eksplisit dari backend — keduanya tidak pernah menyisipkan angka hasil hitung sendiri), `unknown_level`, `summary_view` diteruskan utuh, `summary_view` tanpa nodes tetap `available: true` (bukan false-positif "tidak ditemukan"), `limit` memotong array nodes sisi klien. Test lama (unavailable saat DB_API_URL kosong/query kosong/project_id hilang/not_ready/network error, sitasi mandatory, summarize) dipertahankan. |
| `apps/web/src/app/api/command-room/chat/tools.ts` | HANYA konstanta `TOOL_SYSTEM_SUFFIX` diubah — persis satu baris di diff (dikonfirmasi `git diff`). Deskripsi `query_project_graph` diperbarui: hapus instruksi "kirim HANYA nama lantai persis... jangan gabungkan...", tambah instruksi kirim pertanyaan apa adanya, tambah perilaku `calculation_required` (jangan menghitung, sampaikan guidance + arahkan ke RAB/Core Engine dengan approval) dan `unknown_level` (jangan menebak lantai). Bagian suffix lain (query_rab, query_schedule, lookup_ahsp, run_scenario, project_diagnostics, export_rab_xlsx, ATURAN JAWABAN AKHIR) tidak disentuh sama sekali. |
| `apps/web/src/components/command-room/command-room-ui.test.ts` | TIDAK diubah — dicek lewat grep, file ini tidak mereferensikan `query_project_graph` atau kalimat workaround apa pun, jadi tidak "tersentuh" oleh perubahan B6. |

`services/document-intelligence` (area Luna, sedang aktif berubah paralel di worktree
yang sama) tidak disentuh sama sekali oleh implementasi ini.

## Hasil verifikasi nyata

1. `pnpm --filter @paax/ai-orchestrator test` (dari root, setelah `$env:Path` diisi
   `C:\Program Files\nodejs;$env:APPDATA\npm`)

   ```text
   Test Files  10 passed (10)
        Tests  49 passed (49)
   ```

2. `pnpm exec tsc --noEmit` dari `services/ai-orchestrator`

   Exit code `0`, tanpa error. (Ditemukan dan diperbaiki satu type error saat iterasi
   pertama: `applyLimit<T>` generic gagal infer tipe dari `data.nodes` yang `any` —
   diperbaiki dengan anotasi eksplisit `const rawNodes: Record<string, unknown>[]`
   sebelum dipanggil.)

3. `pnpm exec tsc --noEmit` dari `apps/web`

   Exit code `0`, tanpa error.

4. `pnpm test` dari `apps/web`, discope ke file tersentuh
   (`command-room-ui.test.ts` + `src/app/api/command-room`)

   ```text
   Test Files  2 passed (2)
        Tests  11 passed (11)
   ```

5. `pnpm test` penuh dari `apps/web` (sanity check regresi menyeluruh)

   ```text
   Test Files  16 passed (16)
        Tests  65 passed (65)
   ```

6. `graphify update .` dari root repo

   Graph diperbarui: `5936 nodes`, `11572 edges`, `399 communities`. HTML dilewati
   otomatis (graph melebihi batas 5000 node) — bukan kegagalan.

Tidak menjalankan pytest — tidak ada perubahan Python di sesi ini.

## Verifikasi isolasi area (dua agent paralel)

`git status --porcelain` dibatasi ke path yang diizinkan menunjukkan HANYA 3 file
berubah: `apps/web/src/app/api/command-room/chat/tools.ts`,
`services/ai-orchestrator/src/tools/query_project_graph.ts`,
`services/ai-orchestrator/tests/tools/query_project_graph.test.ts`. `git diff` pada
`tools.ts` dikonfirmasi hanya menyentuh satu baris (konstanta `TOOL_SYSTEM_SUFFIX`).
`services/ai-orchestrator/src/tools/registry.ts` tidak berubah dari sesi ini. Lima
file `services/document-intelligence` yang sedang berubah paralel bukan hasil sesi
ini.

## Keraguan dan risiko

- Param `level`/`discipline`/`node_types` di declaration tool bersifat *hint* yang
  dilipat ke teks query, bukan filter terjamin — parser B4 backend tetap yang
  memutuskan apakah frasa gabungan itu dikenali. Kalau model Command Room mengisi
  `level="Lantai 99"` (nama tak ada di graph), hasilnya tetap jujur `unknown_level`
  (bukan silent-ignore), jadi tidak ada risiko halusinasi — hanya risiko UX minor
  kalau model mengira param ini adalah filter keras yang dijamin backend, padahal
  backend memprosesnya sama seperti kata dalam kalimat biasa.
- Param `limit` murni pemotongan sisi tool (client-side slicing), bukan permintaan
  ke backend untuk membatasi pencarian — kalau backend sendiri sudah memangkas hasil
  lewat `budget_tokens`/pruning (mekanisme B5), `limit` di sisi tool hanya memotong
  lebih lanjut dari hasil yang sudah dipangkas backend, tidak pernah menambah data
  yang hilang.
- Response v2 `applied_filters` diteruskan mentah dari backend (`Record<string,
  string|null>`) tanpa validasi tambahan di tool — ini konsisten dengan pola lama
  (evidence/nodes juga diteruskan mentah), backend (Luna, B5) sudah pytest-verified
  untuk kebenaran isi field ini.
- Tidak ada test end-to-end yang benar-benar memanggil `services/db` nyata dari sesi
  ini (semua test ai-orchestrator memakai `fetch` yang di-stub) — kebenaran kontrak
  request/response v2 disandarkan pada skema Pydantic/Zod yang dibaca langsung
  (`schemas.py`, `packages/schemas/src/index.ts`) plus laporan pytest Luna (B5,
  8/8 benchmark PASS) yang memverifikasi endpoint itu sendiri.
