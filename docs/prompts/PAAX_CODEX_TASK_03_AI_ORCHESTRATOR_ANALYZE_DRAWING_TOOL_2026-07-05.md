# PROMPT CODEX — Task 3/3: Tool `analyze_drawing` untuk AI-Orchestrator

> Ditulis Claude, 2026-07-05, reasoning tinggi. **Task TERAKHIR dari 3
> task berantai.** Setelah selesai + report ditulis (§7), **JANGAN
> mencari prompt lain, JANGAN lanjut ke fase apa pun** — tulis ringkasan
> status keseluruhan 3-task chain ini di report, lalu BERHENTI.

---

## 0. PENTING — pindah context branch/worktree dulu

Task 1 & 2 (kalau sudah selesai) ada di branch
`feat/x2-bridging-non-struktur-dinding-atap-kusen-mep` (document-
intelligence). **Task ini BEDA SAMA SEKALI** — menyentuh
`services/ai-orchestrator` di branch `feat/ai-orchestrator-toolcalling`
(PR #39, sudah ada dari Chain AIO-01/02 sebelumnya). **Sebelum mulai**:

```
git status   # pastikan tidak ada perubahan uncommitted dari task lain yang tertinggal
git checkout feat/ai-orchestrator-toolcalling
# ATAU kalau kamu bekerja di worktree terpisah (mis. G:\paax-ai-aio-worktree
# dari sesi sebelumnya), pindah/`cd` ke situ. VERIFIKASI dulu:
git log --oneline -5
# HARUS menunjukkan commit "feat(ai-orchestrator): add project context tools"
# dan "feat(ai-orchestrator): scaffold tool calling loop" di riwayatnya.
```

Kalau branch/worktree itu TIDAK ditemukan atau riwayat commit di atas
TIDAK ada: **STOP**, laporkan di report bahwa prasyarat Chain AIO-01/02
tidak ditemukan, jangan menebak/membangun ulang dari nol.

---

## 1. Konteks — kenapa tool ini melengkapi rangkaian

`docs/MASTER_PLAN.md` §8.1 menyebut **7 tool** utk Engineering Chat:
`query_rab`, `query_schedule`, `lookup_ahsp`, **`analyze_drawing`**,
`query_progress`, `run_scenario`, `query_materials`. Chain AIO-01/02
membangun 6 dari 7 tool itu (owner sengaja tidak menyebut
`analyze_drawing` di instruksi awal) — task ini melengkapi yang ke-7.

**Beda penting dari `query_rab`/`query_schedule`** (yang HANYA bisa baca
`context` dari client krn tidak ada database proyek server-side, lihat
Chain AIO-02 §0.1): `analyze_drawing` PUNYA sumber data server-side yang
GENUINE — `services/document-intelligence` sudah punya job store
in-memory utk hasil analisa gambar (`POST /drawings/analyze/start` +
`GET /drawings/analyze/status/{job_id}`, lihat `services/document-
intelligence/app/api/drawing_routes.py` baris ~249-304, VERIFIKASI
LANGSUNG ke file itu sebelum implementasi). Client (`apps/web`) yang
sudah memicu analisa gambar akan punya `job_id` — tool ini PROXY
LANGSUNG ke endpoint itu, TIDAK butuh `context` dari request `/chat`
sama sekali (beda dgn `query_rab`/`query_schedule`).

**Batasan jujur yang WAJIB dipertahankan**: job store ini in-memory
(`_ANALYZE_JOBS: dict[str, AnalyzeJobStatus]`, komentar di kode:
"BATASAN JUJUR: status job hilang kalau service di-restart"). Tool ini
HARUS jujur meneruskan itu — kalau `job_id` tidak ditemukan (404), jawab
apa adanya ("job tidak ditemukan, mungkin sudah kadaluarsa/server
restart"), JANGAN mengarang data analisa gambar apa pun.

---

## 2. Verifikasi SEBELUM implementasi (WAJIB)

Baca **persis** `services/document-intelligence/app/api/drawing_routes.py`:
- `class AnalyzeJobStatus` (field: `job_id, status, progress_message,
  created_at, updated_at, result: Optional[DrawingAnalysisResponse],
  error`).
- `class DrawingAnalysisResponse` (cari definisinya — field yang relevan
  utk tool ini: `consolidated: Optional[dict]` berisi hasil
  `ConsolidatedExtraction.model_dump()` — `sheets`, `grid`,
  `element_registry`, `assumptions`, `building_dimensions`; JUGA
  `metrics`, `gerbang` kalau ada).
- Endpoint: `GET /drawings/analyze/status/{job_id}` mengembalikan
  `AnalyzeJobStatus` langsung (bukan dibungkus), status HTTP 404 kalau
  `job_id` tidak dikenal (`HTTPException(status_code=404, ...)`).

**JANGAN menebak field kalau ternyata berbeda dari yang disebut di atas**
— sesuaikan implementasi ke apa yang BENAR-BENAR ada di kode saat kamu
verifikasi, catat di report kalau ada perbedaan dari yang diperkirakan
Claude di sini.

---

## 3. Scope

1. Tool baru `services/ai-orchestrator/src/tools/analyze_drawing.ts`
   (§4).
2. Tambah `DOCUMENT_INTELLIGENCE_URL` ke `src/config.ts` (env var,
   default `http://localhost:8083` — SAMA nama & default dgn yang sudah
   dipakai `apps/web/.env.example`/`document-intelligence`, JANGAN buat
   nama env var baru).
3. Daftarkan sbg tool ke-7 di `src/tools/registry.ts`.
4. Update `systemPrompt` di `src/routes/chat.ts` supaya menyebut tool
   ini.
5. Update `createChatHandler`/route wiring supaya `documentIntelligenceUrl`
   diteruskan ke registry (pola SAMA `coreEngineUrl` yang sudah ada).
6. Test lengkap (§5), README update (§6).

**JANGAN**: menyentuh `apps/web/**`, menyentuh
`services/document-intelligence/**` (tool ini HANYA konsumen HTTP dari
endpoint yang SUDAH ADA, tidak mengubah service itu sama sekali).

---

## 4. Implementasi `analyze_drawing`

```typescript
interface AnalyzeDrawingArgs {
  job_id: string;
}
```

Deklarasi tool:
```typescript
{
  name: "analyze_drawing",
  description: "Cek status & ringkasan hasil analisa gambar kerja (job_id dari proses upload/analisa yang sudah dijalankan user).",
  parameters: {
    type: "OBJECT",
    properties: {
      job_id: { type: "STRING", description: "ID job hasil POST /drawings/analyze/start" },
    },
    required: ["job_id"],
  },
}
```

Logika eksekusi:
```typescript
async function executeAnalyzeDrawing(args, options: { documentIntelligenceUrl: string; fetchImpl: typeof fetch }) {
  const jobId = String(args.job_id ?? "").trim();
  if (!jobId) return { error: "job_id wajib diisi" };

  const url = `${options.documentIntelligenceUrl.replace(/\/+$/, "")}/drawings/analyze/status/${encodeURIComponent(jobId)}`;
  let response;
  try {
    response = await options.fetchImpl(url, { method: "GET" });
  } catch {
    return { error: "document-intelligence tidak dapat dihubungi" };
  }
  if (response.status === 404) {
    return { available: false, message: "Job analisa gambar tidak ditemukan (mungkin sudah kadaluarsa atau service pernah restart)." };
  }
  if (!response.ok) {
    return { error: `HTTP ${response.status} dari document-intelligence` };
  }
  const job = await response.json(); // shape AnalyzeJobStatus, VERIFIKASI field persis (§2)

  if (job.status === "PENDING" || job.status === "PROCESSING") {
    return { available: true, status: job.status, progress_message: job.progress_message ?? null };
  }
  if (job.status === "FAILED") {
    return { available: true, status: "FAILED", error: job.error ?? "analisa gagal tanpa detail" };
  }
  // status === "COMPLETED"
  const consolidated = job.result?.consolidated ?? null;
  if (!consolidated) {
    return { available: true, status: "COMPLETED", message: "Job selesai tapi tidak ada hasil konsolidasi (kemungkinan bukan file PDF atau gagal parsial)." };
  }
  // RINGKAS -- JANGAN dump seluruh consolidated mentah ke model (bisa
  // sangat besar utk dokumen banyak halaman). Ambil field ringkas saja:
  const registry = Array.isArray(consolidated.element_registry) ? consolidated.element_registry : [];
  const byCategory: Record<string, number> = {};
  for (const entry of registry) {
    const kategori = entry.kategori ?? "lain";
    byCategory[kategori] = (byCategory[kategori] ?? 0) + 1;
  }
  const assumptions = Array.isArray(consolidated.assumptions) ? consolidated.assumptions : [];
  return {
    available: true,
    status: "COMPLETED",
    sheet_count: Array.isArray(consolidated.sheets) ? consolidated.sheets.length : 0,
    element_count: registry.length,
    element_by_category: byCategory,
    assumption_count: assumptions.length,
    high_severity_assumption_count: assumptions.filter((a: any) => a.dampak === "tinggi").length,
    building_dimensions: consolidated.building_dimensions ?? null,
  };
}
```

**PRINSIP**: tool ini HANYA meneruskan/meringkas data yang BENAR-BENAR
ada di response document-intelligence — TIDAK PERNAH menghitung ulang
apa pun (mis. TIDAK menjumlahkan volume, TIDAK menyimpulkan status RAB).
Kalau ada pertanyaan lanjutan yang butuh angka RAB dari hasil gambar ini,
arahkan model (via `systemPrompt`) utk memberi tahu user memakai jalur
UI biasa (halaman RAB proyek) — JANGAN coba menjawab angka itu dari tool
ini.

---

## 5. Test WAJIB (vitest, tanpa panggilan jaringan sungguhan ke
document-intelligence maupun Gemini)

`tests/tools/analyze_drawing.test.ts` (baru):
- `job_id` kosong → `{error: ...}`, TIDAK memanggil fetch sama sekali.
- Mock fetch mengembalikan 404 → `{available: false, message: ...}`.
- Mock fetch error jaringan (throw) → `{error: "document-intelligence tidak dapat dihubungi"}`.
- Mock fetch status PENDING/PROCESSING → `{available: true, status, progress_message}`.
- Mock fetch status FAILED → `{available: true, status: "FAILED", error}`.
- Mock fetch status COMPLETED dgn `consolidated` lengkap (buat fixture
  sintetis: 3 sheet, 5 element_registry entries dgn kategori campuran,
  2 assumption salah satunya `dampak: "tinggi"`) → assert
  `sheet_count/element_count/element_by_category/assumption_count/
  high_severity_assumption_count` PERSIS sesuai fixture (hitung manual
  dulu angka yang benar, JANGAN asal assert).
- Mock fetch status COMPLETED TAPI `result.consolidated` null/tidak ada
  → `{available: true, status: "COMPLETED", message: ...}`, TIDAK crash.

Update `tests/routes/chat.test.ts`: tambah 1 test end-to-end fake Gemini
client yang minta `analyze_drawing` → assert `tool_calls` berisi entri
itu.

Jalankan `pnpm --filter ai-orchestrator test` (atau `cd services/ai-
orchestrator && pnpm test`) — harapan: SEMUA test lama (22) + test baru
task ini tetap hijau. Jalankan juga `pnpm build` (tsc --noEmit) — harus
exit 0.

---

## 6. Update `README.md`

Tambahkan `analyze_drawing` ke daftar 7 tool + env var
`DOCUMENT_INTELLIGENCE_URL` ke bagian environment. Tambahkan catatan di
"Batasan Jujur": job store document-intelligence in-memory, hilang kalau
service di-restart — tool ini jujur meneruskan itu, bukan menyembunyikan.

---

## 7. Laporan WAJIB — `report-remote/`, JANGAN hapus/timpa riwayat lama

Nama file baru: `report-remote/REPORT_TASK03_ANALYZE_DRAWING_TOOL_CODEX_<tanggal>.md`.

Isi wajib: (1) field `AnalyzeJobStatus`/`DrawingAnalysisResponse` yang
BENAR-BENAR ditemukan saat verifikasi §2 (kutip langsung), (2) hasil test
lengkap (before/after, total test count), (3) daftar commit dgn output
mentah `git log`, (4) link PR (lanjutan PR #39 — SAMA branch) + status,
(5) konfirmasi tidak ada `apps/web/**`/`services/document-intelligence/**`
tersentuh, tidak ada `Co-Authored-By` di commit manapun.

**(6) WAJIB — ringkasan status KESELURUHAN 3-task chain** (Task 1+2+3
digabung, ini task TERAKHIR): apa yang selesai di tiap task, apakah ada
yang di-STOP/blocker di sepanjang jalan (Task 1 §0.1, Task 2 manapun),
status akhir kedua branch (`feat/x2-bridging-non-struktur-dinding-atap-
kusen-mep` & `feat/ai-orchestrator-toolcalling`) + PR masing-masing,
dan pending yang masih tersisa (mis. wiring `apps/web` ke ai-orchestrator
— TETAP tugas Claude terpisah, sebutkan ini eksplisit di ringkasan supaya
jelas bukan bagian yang "terlewat").

**SETELAH report ini selesai: BERHENTI.** Jangan mencari prompt lain.

---

## 8. Pembagian kerja & larangan (sama seperti task sebelumnya)

- Lanjutkan branch `feat/ai-orchestrator-toolcalling` (PR #39 yang sudah
  ada) — JANGAN branch baru.
- Commit HANYA Codex, TANPA `Co-Authored-By`/signature AI apa pun.
- PR draft yang sudah ada tetap terbuka, JANGAN merge sendiri.
- JANGAN sentuh `apps/web/**` atau `services/document-intelligence/**`.
- JANGAN mengarang/menghitung ulang data analisa gambar — tool ini murni
  proxy+ringkas dari data yang BENAR-BENAR dikembalikan document-
  intelligence.
