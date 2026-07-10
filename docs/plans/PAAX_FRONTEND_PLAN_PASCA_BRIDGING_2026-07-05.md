# PAAX — Rencana Kerja Frontend Pasca-Bridging (2026-07-05)

> Ditulis Saya, 2026-07-05, atas instruksi owner. **Ini rencana kerja
> Saya sendiri — BUKAN prompt Saya, BUKAN untuk diserahkan ke Saya.**
> Semua item di sini menyentuh `apps/web/**`, yang menurut aturan baku
> proyek ini (`SAYA.md` §9) SELALU jadi domain Saya, tidak pernah
> Saya. Dokumen ini murni utk didiskusikan dgn owner dulu — **BELUM ada
> eksekusi apa pun**.
>
> Latar belakang: sepanjang sesi 2026-07-05 (lihat `report-remote/
> REPORT_SESSION_SUMMARY_2026-07-05.md`), backend `document-intelligence`
> mendapat lapisan AI-assist bridging utk 7 kategori non-struktur
> (dinding, atap/gording-trekstang-ikatan_angin, kuda-kuda/baja, kusen,
> MEP, keramik dinding basah/plafon/waterproofing, +4 sub-domain
> arsitektur lain di Task 5) DAN `services/ai-orchestrator` (tool-calling
> Engineering Chat, 7 tool) selesai dibangun — TAPI **frontend nol
> disentuh**. Semua kerja backend ini TIDAK ADA GUNANYA bagi user sampai
> ada UI yang memakainya. Dokumen ini memetakan pekerjaan itu.

---

## 0. Fakta yang sudah dicek langsung (bukan asumsi) sebelum menyusun plan

- `apps/web/src/components/drawings/tkg-workspace.tsx` (Review Gambar,
  dari Fase H) **belum memanggil** `/drawings/tkg/work-items` sama
  sekali — masih menampilkan element registry mentah (grid & elemen per
  zona), BUKAN daftar item pekerjaan dgn `formula_status`. Ini artinya
  seluruh lapisan bridging (X1 s.d. Task 5) SAAT INI tidak terlihat di
  UI mana pun.
- `apps/web/src/app/(dashboard)/proyek/[projectId]/schedule/page.tsx`
  hanya berisi Simulator Skenario (what-if) — TIDAK ADA komponen Gantt/
  jalur kritis sama sekali, walau `schedulePlan()` (client fetch ke
  `/schedule/plan`) sudah ada siap pakai di `lib/engine.ts`.
- `apps/web/src/app/api/ai/chat/route.ts` masih satu panggilan Gemini
  one-shot, belum memanggil `services/ai-orchestrator` sama sekali.

---

## 1. Empat area kerja

### 1.1 A3 — Tombol 1-klik "Analisa RAB dari Gambar Kerja" (Fase Y)

**Scope**: rename tombol "Analisa Gambar Kerja" → "Analisa RAB dari
Gambar Kerja"; alur penuh upload → perception → consolidate (dgn
`ai_client` aktif kalau `GEMINI_API_KEY` ada) → `POST /drawings/tkg/
work-items` → isi halaman RAB otomatis. Panel data mentah (grid/elemen/
OCR) dipindah ke toggle "mode developer" (TETAP ada di kode, bukan
dihapus). **Sebelum menyentuh tombol "Susun dengan AI"/RAB manual yang
sudah ada, cek dulu apakah dipakai jalur RAB tanpa-gambar — kalau ya,
JANGAN dihapus, biarkan jadi jalur terpisah** (keputusan owner yang
sudah pernah ditegaskan di rencana besar sebelumnya).

**Kenapa PALING PRIORITAS**: ini satu-satunya jalur yang membuat SELURUH
pekerjaan backend sesi ini (7 kategori bridging) benar-benar terlihat &
berguna bagi user. Tanpa ini, semua kerja Saya hari ini "tidur" di
backend.

**Kompleksitas**: **BESAR**. Bukan sekadar wiring tombol — perlu
membangun tampilan `DrawingWorkItem[]` (kode, kategori, work_type,
formula_status, volume, review_reason) yang BELUM PERNAH ada di UI mana
pun, ditambah alur "kirim ke draft RAB" utk item `formula_status:
"dihitung"`. Bergantung penuh pada 1.2 (lihat dependency §2).

### 1.2 UI Review/Approval untuk usulan AI-assist (BARU, ditemukan
kebutuhannya dari kerja sesi ini — belum pernah direncanakan sebelum ini)

**Scope**: setiap entry sintetis (`DINDING-AUTO-1`, `KUSEN-AUTO-P1`,
`KERAMIK_DINDING-AUTO-1`, dst) yang statusnya `perlu_review` DAN punya
`ai_*_suggestion` terisi (lihat field `ai_dimension_suggestion`/
`ai_dinding_suggestion`/`ai_roof_frame_suggestion`/`ai_kusen_suggestion`/
`ai_mep_suggestion`/`ai_kuda_kuda_suggestion`/
`ai_arsitektur_area_suggestion` di `ElementRegistryEntry`) perlu
ditampilkan sbg KARTU/BARIS yang menunjukkan: usulan nilai (mis. "panjang
45.6m, tinggi 3m"), `confidence`, `reasoning` (kenapa AI menyimpulkan
begitu), `source_texts` (kutipan teks asli sbg bukti — PENTING utk
kepercayaan user thd usulan), dan 2 tombol: **Setujui** (nilai masuk
sbg input terstruktur → panggil ulang engine via endpoint yang sesuai)
atau **Tolak** (tetap `perlu_review`, user isi manual).

**Kenapa ini WAJIB, bukan nice-to-have**: ini GERBANG REVIEW MANUSIA yang
disebut eksplisit di `SAYA.md` §1.1 ("Tidak ada auto-commit ke input
engine... menunggu gerbang review manusia sebelum dipakai sebagai input
`core-engine`") — **gerbang itu SAAT INI TIDAK ADA WUJUDNYA DI UI SAMA
SEKALI**. Backend sudah benar (tidak pernah auto-commit), tapi tanpa UI
ini, usulan AI yang sudah divalidasi ketat (anti-halusinasi, dsb) TIDAK
PERNAH bisa benar-benar dipakai user — semua akan macet selamanya di
`perlu_review` krn tidak ada tombol "Setujui".

**Kompleksitas**: **SEDANG-BESAR**. Perlu: (a) komponen kartu usulan
generik (bisa reuse utk 7 jenis suggestion, field beda-beda tapi pola
tampilan sama: nilai+confidence+reasoning+source_texts+2 tombol), (b)
endpoint/mutasi client-side utk "Setujui" (kemungkinan perlu endpoint
BARU di `core-engine`/`document-intelligence` kalau alur "user approve →
angka masuk RAB" belum ada jalurnya — INI PERLU DICEK LEBIH DALAM saat
mulai, kemungkinan besar perlu keputusan desain tambahan: apakah approve
memanggil ulang `/drawings/tkg/work-items` dgn data yang sudah
di-lock, atau approve cukup menyalin `ai_suggestion` jadi input manual
di form RAB yang sudah ada). **Digabung eksekusinya dengan 1.1** (satu
alur UI yang sama: tampilan work items DAN kartu approval usulan AI
tampil berdampingan di halaman yang sama).

### 1.3 Gantt/CPM UI (M3 — MASTER_PLAN §7)

**Scope**: halaman/section baru di `/proyek/[id]/schedule` (berdampingan
dgn Simulator Skenario yang sudah ada, BUKAN menggantikan) — input daftar
pekerjaan + durasi + **predecessor** (field `predecessors: List[str]`
SUDAH ADA di `PlanTaskInput`/`TaskInput` core-engine, tinggal UI utk
mengisinya — SAAT INI TIDAK ADA CARA user mengisi dependency sama
sekali), panggil `schedulePlan()` (SUDAH ADA di `lib/engine.ts`, tinggal
dipakai), tampilkan Gantt chart (bar per task, tanggal mulai/selesai) +
highlight jalur kritis (`critical_path: string[]` dari
`SchedulePlanResult`) + Kurva S (`s_curve` field, sudah ada di response).

**Kompleksitas**: **SEDANG**. Backend 100% siap (endpoint, client fetch
function, semua field response sudah ada) — kerja murni UI: (a) form/
tabel input predecessor per item (bisa mulai simple: dropdown pilih
task lain sbg predecessor, drag-reorder sbg peningkatan nanti), (b)
render Gantt (SVG custom, reuse pola `TimeCostChart` yang sudah ada di
`schedule/page.tsx` sbg referensi teknik gambar SVG timeline), (c) render
Kurva S (kemungkinan ada komponen serupa sudah ada di `components/rab/
s-curve` — CEK dulu sebelum bangun dari nol).

**Independen** dari 1.1/1.2 — halaman berbeda, data flow berbeda, TIDAK
ADA dependency teknis ke pekerjaan gambar-kerja.

### 1.4 Wiring `apps/web` → `services/ai-orchestrator`

**Scope**: ganti `apps/web/src/app/api/ai/chat/route.ts` dari panggilan
Gemini langsung (`geminiText`/`geminiMultimodal`) jadi `fetch` ke
`services/ai-orchestrator` `POST /chat` (env var baru `AI_ORCHESTRATOR_URL`,
default `http://localhost:8082`, ikuti pola `CORE_ENGINE_URL`/
`DOCUMENT_INTELLIGENCE_URL` yang sudah ada). Perlu membangun payload
`context` (§Chain AIO-02): `rab_lines` dari `rabRepository` (SUDAH ADA,
tinggal dibaca), `schedule` dari hasil `/schedule/plan` terakhir (BELUM
ADA tempat menyimpannya di client — kemungkinan perlu cache/state baru),
`job_id` kalau user baru saja menganalisa gambar (BELUM ADA tracking
job_id per proyek di client saat ini — perlu ditambah). **Fallback**:
kalau `ai-orchestrator` tidak bisa dihubungi (belum dijalankan/dideploy),
JANGAN pecah — fallback ke perilaku LAMA (panggilan Gemini langsung) ATAU
pesan jujur "asisten tool-calling belum aktif", supaya chat tetap
berfungsi minimal.

**Kompleksitas**: **SEDANG**. Perubahan terpusat di satu route + state
tambahan utk melacak `job_id`/schedule cache per proyek. Tidak butuh
komponen visual baru (chat UI yang ada tetap dipakai), TAPI perlu
keputusan: tampilkan `tool_calls` (audit trail) ke user atau tidak (mis.
badge kecil "mencari data RAB..." saat tool dipanggil) — nice-to-have,
bisa ditunda ke iterasi berikutnya.

---

## 2. Urutan pengerjaan yang disarankan & alasan

```
1. A3 + UI Review/Approval (1.1 + 1.2, DIGABUNG satu alur)
        ↓ (independen, bisa paralel/kapan saja)
2. Wiring ai-orchestrator (1.4)
        ↓ (independen, bisa paralel/kapan saja)
3. Gantt/CPM UI (1.3)
```

**Alasan urutan**:
- **1.1+1.2 dulu** — ini SATU-SATUNYA jalur yang membuat kerja backend
  hari ini (7 kategori bridging, ratusan test) mulai memberi nilai nyata
  ke user. Menunda ini berarti menunda nilai dari pekerjaan yang SUDAH
  selesai & dibayar (secara token/waktu Saya) tapi belum dipanen.
  Digabung krn secara teknis satu alur UI yang sama (halaman "Review
  Gambar" perlu menampilkan WORK ITEMS, dan work items yang
  `perlu_review` dgn usulan AI perlu kartu approval — memisahnya jadi 2
  iterasi hanya menambah overhead tanpa manfaat, keduanya menyentuh file
  yang sama).
- **1.4 (ai-orchestrator) & 1.3 (Gantt) bisa kapan saja setelah/paralel**
  — keduanya independen secara teknis dari 1.1/1.2 dan dari satu sama
  lain. Urutan di antara keduanya murni preferensi: **ai-orchestrator
  didahulukan** di sini krn dampaknya ke KUALITAS Engineering Chat
  (fitur yang sudah dipakai user tiap hari) lebih terasa langsung
  dibanding Gantt (fitur baru yang butuh adopsi kebiasaan baru: mengisi
  predecessor). Tapi kalau owner lebih prioritas Gantt (mis. utk demo ke
  klien), urutan ini BOLEH dibalik tanpa risiko teknis.

---

## 3. Dependency map (ringkas)

| Item | Bergantung pada | Diperlukan oleh |
|---|---|---|
| 1.1 (A3) | Backend bridging (SUDAH selesai) | 1.2 (satu alur UI) |
| 1.2 (Review/Approval AI) | 1.1 (tampil di halaman yang sama) | — |
| 1.3 (Gantt/CPM) | Tidak ada (backend sudah siap) | — |
| 1.4 (ai-orchestrator wiring) | `services/ai-orchestrator` running (PR #39 perlu di-merge/dijalankan dulu scr operasional, BUKAN dependency kode) | — |

---

## 4. Catatan tambahan utk didiskusikan sebelum eksekusi

- **1.2 kemungkinan menyingkap kebutuhan desain baru** (endpoint "approve
  usulan AI" mungkin belum ada di `core-engine`/`document-intelligence`)
  — ini perlu diinvestigasi LEBIH DALAM di awal 1.1/1.2, bisa jadi
  memunculkan kebutuhan spek backend TAMBAHAN (yang berarti prompt Saya
  baru, bukan pekerjaan frontend murni) — akan dilaporkan terpisah kalau
  ditemukan saat mulai kerja, bukan diasumsikan sekarang.
- **1.4 butuh keputusan operasional**: `services/ai-orchestrator` harus
  benar-benar berjalan (lokal via `pnpm dev` atau dideploy) supaya wiring
  ini bisa diuji nyata — bukan cuma soal kode.
- PR #39 & #40 (Saya) masih **draft, belum di-review/merge owner** —
  disarankan direview & di-merge (atau diputuskan nasibnya) SEBELUM
  frontend mulai bergantung padanya, supaya tidak membangun UI di atas
  API yang mungkin masih berubah.
