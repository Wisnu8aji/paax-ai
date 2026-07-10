# PROMPT SAYA — AI-Orchestrator Chain 02/2: Tool query_rab/query_schedule/query_progress/query_materials + Integrasi Penuh

> Ditulis Saya, 2026-07-05. **Ini bagian 2 dari 2 file berantai** — WAJIB
> dikerjakan SETELAH `docs/prompts/PAAX_SAYA_CHAIN_AIO_01_SCAFFOLD_
> TOOLCALLING_LOOP_2026-07-05.md` selesai (loop tool-calling +
> `lookup_ahsp`/`run_scenario` sudah ada & teruji). **JANGAN mulai file ini
> kalau Chain 01 belum selesai/belum teruji** — cek dulu
> `services/ai-orchestrator/src/gemini/tool-loop.ts` ada & test Chain 01
> hijau semua.
>
> **Ini adalah TASK TERAKHIR dari rangkaian ai-orchestrator.** Setelah
> selesai dan report ditulis (§6), **JANGAN mencari prompt lain, JANGAN
> lanjut ke fase lain apa pun** — tulis ringkasan status KESELURUHAN
> rangkaian ai-orchestrator (Chain 01 + Chain 02 digabung) di report ini,
> lalu BERHENTI. Wiring `apps/web` → `ai-orchestrator` adalah tugas Saya
> terpisah, BUKAN bagian task ini.

---

## 0. Konteks tambahan (baca setelah §0 Chain 01, jangan ulangi bacaan)

Chain 01 membangun 2 tool yang TIDAK butuh data proyek dari client
(`lookup_ahsp`, `run_scenario` — proxy langsung ke core-engine). 4 tool
sisanya PUNYA KARAKTERISTIK BERBEDA yang WAJIB dipahami dulu sebelum
implementasi:

### 0.1 Temuan arsitektur penting: TIDAK ADA database proyek server-side

Audit B0 (`docs/ai-map/STATE.md`) menemukan: draft RAB & hasil jadwal
proyek **TERSIMPAN DI BROWSER (localStorage), BUKAN di database yang bisa
diakses server** (`apps/web/src/lib/projects/rab-repository.ts`:
"Penyimpanan draft RAB per-proyek" pakai `LocalStorage`/Firestore
opsional client-side). Ini artinya `ai-orchestrator` **TIDAK BISA**
"mengambil sendiri" data RAB/jadwal proyek dari database (tidak ada
databasenya) — SATU-SATUNYA cara tool `query_rab`/`query_schedule` bisa
bekerja adalah: **client (`apps/web`, di luar scope Saya) mengirim
snapshot data itu di dalam body request `POST /chat`**, dan tool ini
HANYA memfilter/meringkas data yang SUDAH dikirim itu — BUKAN fetch dari
mana pun.

**Ini BUKAN keterbatasan sementara yang perlu "diperbaiki" di task ini** —
ini keputusan arsitektur yang disengaja (database proyek server-side
adalah proyek migrasi besar terpisah, di luar scope). Tugas Saya: buat
tool ini bekerja dgn BAIK dari data yang tersedia di request, dan JUJUR
kalau datanya tidak dikirim.

### 0.2 `query_progress`/`query_materials`: TIDAK ADA sumber data sama sekali

Site Agent (monitoring progres lapangan, v2.0) dan prediksi kebutuhan
material (v1.5) **BELUM DIBANGUN SAMA SEKALI** di proyek ini (cek
`docs/MASTER_PLAN.md` §16 roadmap — keduanya rilis masa depan). Tool ini
HARUS jadi **STUB JUJUR** yang SELALU bilang fitur belum tersedia — JANGAN
mengarang data progres/material apa pun. Ini BUKAN "belum sempat
diimplementasi", ini KEPUTUSAN DESAIN (konsisten Aturan Emas: AI tidak
boleh mengarang data yang tidak ada sumbernya).

---

## 1. Scope task ini (Chain 02/2)

1. Perluas `POST /chat` request body supaya menerima `context` (snapshot
   data proyek dari client) — lihat §2.
2. Implementasi tool `query_rab` (§3.1).
3. Implementasi tool `query_schedule` (§3.2) — **WAJIB cek dulu shape
   response `/schedule/plan` sungguhan** (`services/core-engine/app/
   rab/schedule.py` atau file setara + `packages/schemas/src/index.ts`
   `SchedulePlanResultSchema`/tipe terkait — CARI NAMA PERSIS via grep,
   JANGAN menebak) sebelum menulis tipe TypeScript utk `context.schedule`.
4. Implementasi tool `query_progress` dan `query_materials` sbg stub jujur
   (§3.3, §3.4) — PALING SEDERHANA dari semua tool, jangan overthink.
5. Daftarkan SEMUA 6 tool (2 dari Chain 01 + 4 ini) di
   `src/tools/registry.ts` dan pastikan `POST /chat` (`src/routes/chat.ts`)
   memakai registry lengkap.
6. Update `systemPrompt` di `chat.ts` supaya menyebut SEMUA 6 tool +
   instruksi eksplisit ttg `query_progress`/`query_materials` (model harus
   tahu utk memanggil tool ini AKAN dapat jawaban "belum tersedia", supaya
   modelnya tidak berulang kali mencoba tool yang sama).
7. Test lengkap (§4) + `README.md` service ini (§5) yang menjelaskan
   arsitektur, cara jalankan lokal, dan BATASAN JUJUR (§0.1/§0.2 di atas)
   supaya siapa pun yang baca README paham kenapa 2 tool ini butuh
   `context` dan 2 tool lain selalu stub.

---

## 2. Perluasan kontrak `POST /chat`

Request body BARU (menambah field `context`, opsional, TIDAK mengubah
field yang sudah ada dari Chain 01):

```json
{
  "message": "Berapa total volume kolom di draft RAB saya?",
  "project_id": "proj-123",
  "context": {
    "rab_lines": [
      {"id": "line-1", "ahsp_code": "6.2.1.1", "volume": 12.5, "duration_days": null}
    ],
    "schedule": { "...shape PERSIS hasil /schedule/plan, cek dulu..." : "..." }
  }
}
```

`context.rab_lines` HARUS PERSIS shape `RabDraftLine`
(`apps/web/src/lib/projects/rab-repository.ts` baris 18-28, BACA file
ini dulu, JANGAN menebak — field: `id: string`, `ahsp_code: string`,
`volume: number | null`, `duration_days: number | null`,
`ahsp_suggested?: boolean`). Definisikan tipe TypeScript
`RabLineSnapshot` di `src/tools/types.ts` yang MIRROR field ini persis.

`context.schedule` — CARI DULU shape response `/schedule/plan` (endpoint
sudah ada, dipanggil dari `apps/web/src/lib/engine.ts` fungsi
`schedulePlan`, lihat baris ~343-351 file itu utk tahu field yang dipakai
frontend) SEBELUM mendefinisikan tipe `ScheduleSnapshot`. Perlakukan
sbg objek longgar (`Record<string, unknown>` ATAU tipe yang kamu susun
dari hasil pengecekan nyata) — YANG PENTING: `query_schedule` tool
membaca field yang BENAR-BENAR ADA, bukan field yang ditebak.

---

## 3. 4 Tool baru

### 3.1 `query_rab`

```typescript
interface QueryRabArgs {
  filter_ahsp_code?: string;   // substring match, opsional
}
interface QueryRabResult {
  available: boolean;
  lines?: Array<{ ahsp_code: string; volume: number | null; duration_days: number | null }>;
  total_lines?: number;
  message?: string;    // diisi kalau available=false
}
```

Logika:
```typescript
function executeQueryRab(args: QueryRabArgs, context?: ChatContext): QueryRabResult {
  const lines = context?.rab_lines;
  if (!lines || lines.length === 0) {
    return { available: false, message: "Data RAB tidak tersedia di konteks percakapan ini — user perlu membuka halaman RAB proyek dulu." };
  }
  const filtered = args.filter_ahsp_code
    ? lines.filter(l => l.ahsp_code.toLowerCase().includes(args.filter_ahsp_code!.toLowerCase()))
    : lines;
  return { available: true, lines: filtered.map(l => ({ ahsp_code: l.ahsp_code, volume: l.volume, duration_days: l.duration_days })), total_lines: filtered.length };
}
```

**PENTING**: tool ini TIDAK MENGHITUNG apa pun (tidak menjumlahkan volume,
tidak menghitung total biaya) — HANYA memfilter/mengembalikan data mentah
yang SUDAH ada di `context`. Kalau user tanya "berapa TOTAL biaya", model
HARUS diarahkan (via `systemPrompt`) utk memakai `run_scenario` (yang
memanggil engine sungguhan utk hitungan), BUKAN menjumlahkan sendiri dari
hasil `query_rab`. Tambahkan baris eksplisit ini ke `systemPrompt` §1
poin 6.

### 3.2 `query_schedule`

Pola sama `query_rab`: baca `context.schedule`, kalau tidak ada →
`available: false` + pesan jujur. Kalau ada, filter/ringkas berdasarkan
`args` (mis. `item_code?: string` utk cari task tertentu). Field PERSIS
menyesuaikan hasil pengecekan §2. TIDAK MENGHITUNG ulang tanggal/durasi —
murni membaca apa yang sudah dihitung `/schedule/plan` dan dikirim client.

### 3.3 `query_progress`

```typescript
interface QueryProgressArgs {}  // tidak butuh argumen apa pun
interface QueryProgressResult {
  available: false;
  message: "Monitoring progres lapangan (Site Agent) belum dibangun (rencana v2.0, docs/MASTER_PLAN.md §16) — fitur ini belum tersedia.";
}
```
Fungsi ini SELALU mengembalikan objek yang SAMA PERSIS, tidak peduli
argumen apa pun yang dikirim model. Deklarasi tool (function declaration)
tetap harus ADA & terdaftar (supaya model TAHU tool ini eksis dan bisa
"mencoba" memanggilnya kalau relevan, lalu dapat jawaban jujur) — JANGAN
dihapus dari daftar tool hanya karena selalu stub.

### 3.4 `query_materials`

Sama persis pola §3.3, pesan: `"Prediksi & pengingat kebutuhan material
belum dibangun (rencana v1.5, docs/MASTER_PLAN.md §16) — fitur ini belum
tersedia."`

---

## 4. Test WAJIB tambahan (vitest, tanpa panggilan API Gemini sungguhan)

- `query_rab`: `context.rab_lines` ada & match filter → hasil benar;
  `context.rab_lines` kosong/tidak ada → `available: false` + pesan;
  filter tidak match apa pun → `lines: []`, `total_lines: 0` (BUKAN
  `available: false` — beda dgn "tidak ada context sama sekali").
- `query_schedule`: pola sama (sesuaikan field nyata dari §2).
- `query_progress`/`query_materials`: SELALU `available: false` + pesan
  PERSIS yang ditentukan, apa pun argumennya (test dgn args kosong DAN
  args aneh/tidak terduga — hasil harus tetap sama).
- **Integrasi penuh** (`tests/routes/chat.test.ts`, tambah ke file yang
  sudah ada dari Chain 01): fake Gemini client yang minta `query_rab` lalu
  `run_scenario` berturutan (2 tool call dlm 1 percakapan) — assert
  `tool_calls` di response berisi 2 entri berurutan, dan `context` yang
  dikirim di request awal benar-benar diteruskan ke tool `query_rab`
  (bukan dibuang di tengah jalan).
- Jalankan SEMUA test (Chain 01 + Chain 02) — laporkan angka total.

---

## 5. `services/ai-orchestrator/README.md` (WAJIB dibuat)

Isi minimal:
- Cara jalankan lokal (`pnpm install`, `pnpm dev`/`pnpm start`, env yang
  dibutuhkan: `GEMINI_API_KEY`, `CORE_ENGINE_URL`, `PORT`).
- Daftar 6 tool + 1 kalimat penjelasan tiap tool.
- **Bagian "Batasan Jujur"**: jelaskan eksplisit §0.1 (query_rab/
  query_schedule butuh `context` dari caller, tidak fetch database sendiri
  krn belum ada database proyek server-side) dan §0.2 (query_progress/
  query_materials selalu stub, fitur belum dibangun).
- Catatan bahwa `apps/web` BELUM memanggil service ini (wiring itu tugas
  terpisah) — service ini berdiri sendiri, testable via `curl`/Postman
  memakai contoh request di §2 dokumen ini.

---

## 6. Laporan WAJIB — `report-remote/`, JANGAN hapus/timpa riwayat lama

Nama file baru: `report-remote/REPORT_AIO_CHAIN02_TOOLS_INTEGRASI_SAYA_<tanggal>.md`.

Isi wajib: (1) shape `context.schedule` yang BENAR-BENAR ditemukan saat
verifikasi §2 (kutip langsung, bukan parafrase), (2) hasil test lengkap
GABUNGAN Chain 01+02, (3) daftar SEMUA commit sesi ini (Chain 01 + Chain
02 kalau di branch yang sama) dgn output mentah `git log`, (4) link PR +
status, (5) **RINGKASAN STATUS KESELURUHAN rangkaian ai-orchestrator**
(apa yang selesai, apa yang masih pending — mis. wiring `apps/web`, atau
kalau ternyata Chain 01 punya bagian yang di-`STOP` karena blocker, sebut
lagi di sini), (6) konfirmasi tidak ada `apps/web/**` tersentuh, tidak ada
`Co-Authored-By` di commit manapun.

**SETELAH report ini selesai: BERHENTI.** Jangan mencari prompt lain.
Rangkaian ai-orchestrator selesai — langkah berikutnya (wiring
`apps/web`) menunggu Saya, bukan Saya.

---

## 7. Pembagian kerja, commit, gerbang review, larangan (SAMA seperti Chain 01)

- Lanjutkan di branch YANG SAMA dgn Chain 01 (`feat/ai-orchestrator-
  toolcalling`) — task ini memperluas service yang sama, bukan service
  baru.
- Commit HANYA Saya, TANPA `Co-Authored-By`/signature AI apa pun.
- PR yang sudah dibuka di Chain 01 tetap draft, JANGAN merge sendiri.
- JANGAN sentuh `apps/web/**` sama sekali.
- JANGAN mengarang data `query_progress`/`query_materials` dgn alasan
  apa pun — kalau kamu tergoda "supaya kelihatan lebih lengkap", INGAT ini
  pelanggaran Aturan Emas (`SAYA.md` §1) yg berlaku juga utk lapisan
  orkestrasi, bukan cuma engine.
