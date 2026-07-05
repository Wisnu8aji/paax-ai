# PAAX — Master Plan Frontend: Redesign Visual + Sisa Pekerjaan Fungsional (2026-07-05)

> Ditulis Claude, 2026-07-05. **Murni rencana kerja Claude/owner (dgn
> model "Fable 5") — BUKAN prompt Codex, TIDAK ADA kode diubah sesi ini.**
> Dokumen ini MENGGANTIKAN `docs/plans/PAAX_FRONTEND_PLAN_PASCA_
> BRIDGING_2026-07-05.md` sbg daftar tugas OTORITATIF (dokumen lama TETAP
> DISIMPAN, isinya digabung & diperluas di sini, jangan dihapus — konten
> teknisnya soal 3 area fungsional masih akurat, cuma sekarang
> diurutkan ulang bersama pekerjaan redesign visual). Spesifikasi visual
> detail (palet/tipografi/spacing/motion): lihat companion
> `docs/plans/PAAX_FRONTEND_DESIGN_SYSTEM_2026-07-05.md`.

---

## 1. Ringkasan — 2 jenis pekerjaan yang digabung jadi 1 roadmap

1. **Pekerjaan FUNGSIONAL yang tertunda** (dari audit sesi sebelumnya):
   tombol 1-klik + UI approval AI-assist, wiring ke `ai-orchestrator`,
   Gantt/CPM UI — SEMUA backend-nya SUDAH SIAP, tinggal UI.
2. **Redesign VISUAL besar-besaran** (permintaan baru owner): palet
   warna, skala ukuran, bentuk komponen, sistem animasi — lihat
   `PAAX_FRONTEND_DESIGN_SYSTEM_2026-07-05.md` utk detail teknis penuh.

Keduanya digabung jadi SATU urutan supaya tidak ada kerja dobel (bangun
UI baru dgn gaya lama, lalu di-restyle lagi belakangan).

---

## 2. Daftar LENGKAP tugas, diurutkan

### Tahap 0 — Keputusan desain (WAJIB selesai sebelum kode apa pun ditulis)
Lihat checklist penuh di `PAAX_FRONTEND_DESIGN_SYSTEM_2026-07-05.md` §7:
pilih 1 dari 3 arah palet, putuskan radius/shape, setujui dependency
Framer Motion. **Tanpa ini, Tahap 1 tidak bisa mulai** (semua turunan
darinya).

### Tahap 1 — Fondasi design system (KECIL, terfokus — bukan sweep semua
halaman)
**Scope**: update `globals.css` (token warna baru sesuai arah terpilih +
skala tipografi/spacing formal §4 design-system doc), redesign
`components/ui/*` (Card/Button/Badge/Modal/Drawer + prop varian baru),
tambah komponen `Skeleton` (BARU, belum ada), install Framer Motion +
wrapper motion dasar (page transition di layout dashboard, stagger
utility).
**Kompleksitas**: SEDANG. Scope SENGAJA dibatasi ke `components/ui/` +
`globals.css` + 1 layout file — BUKAN ke semua halaman individual (itu
Tahap 4).
**Kenapa PALING DULU**: semua pekerjaan lain (Tahap 2, 3, 4) memakai
komponen ini — kalau dikerjakan belakangan, Tahap 2/3 harus dikerjakan 2x
(sekali gaya lama, sekali restyle).

### Tahap 2 — A3 (tombol 1-klik) + UI Review/Approval AI-assist
**Scope PERSIS** sama seperti tercatat di
`PAAX_FRONTEND_PLAN_PASCA_BRIDGING_2026-07-05.md` §1.1+§1.2 (rename
tombol, wiring `/drawings/tkg/work-items`, tampilan `DrawingWorkItem[]`,
kartu usulan AI-assist dgn tombol Setujui/Tolak utk 7 kategori
`ai_*_suggestion`, toggle "mode developer"). **Dikerjakan MEMAKAI
komponen dari Tahap 1** (Card/Skeleton/Motion baru), BUKAN gaya lama.
**Kompleksitas**: BESAR (tidak berubah dari analisis sebelumnya).
**Kenapa PRIORITAS TERTINGGI setelah fondasi**: ini satu-satunya jalur
yang membuat SELURUH kerja backend (7 kategori bridging Codex, x ratus
test) mulai kelihatan & berguna bagi user — nilai yang sudah "dibayar"
tapi belum "dipanen". Juga: **kemungkinan menyingkap kebutuhan endpoint
baru** ("Setujui usulan AI" mungkin belum ada jalur API-nya) — investigasi
ini HARUS terjadi di awal tahap ini, bisa memunculkan spek backend
tambahan (prompt Codex terpisah, ditulis kalau ketemu, bukan diasumsikan
sekarang).

### Tahap 3 — Wiring `apps/web` → `ai-orchestrator` + Gantt/CPM UI
Digabung 1 tahap krn keduanya INDEPENDEN satu sama lain & dari Tahap 2 —
boleh dikerjakan paralel atau berurutan sesuai preferensi, TIDAK ada
dependency teknis di antara keduanya.

- **3a. Wiring ai-orchestrator** (scope persis §1.4 plan lama): ganti
  `app/api/ai/chat/route.ts` jadi proxy ke `services/ai-orchestrator`,
  bangun payload `context` (rab_lines/schedule/job_id), fallback jujur
  kalau service tidak aktif. Kompleksitas SEDANG.
- **3b. Gantt/CPM UI** (scope persis §1.3 plan lama): form predecessor,
  render Gantt (reuse pola SVG `TimeCostChart` sbg referensi), Kurva S.
  **Dikerjakan pakai motion draw-in chart dari Tahap 1** (§6.2 poin 7
  design-system doc — chart animasi masuk). Kompleksitas SEDANG.

### Tahap 4 — Rollout redesign ke SISA halaman yang tidak tersentuh
Tahap 2/3
**Scope**: terapkan token/komponen baru (Tahap 1) ke halaman yang TIDAK
otomatis ter-cover Tahap 2/3: `dashboard` (home), `database-ahsp`,
`files`, `kolaborasi`, `laporan`, `pengaturan`, `proyek/[id]/chat`
(bagian visual, terpisah dari wiring logic Tahap 3a), `proyek/[id]/rab`
(halaman RAB existing), `proyek/[id]/site-agent` (placeholder v2.0 —
cukup selaraskan token, jangan bangun fitur baru).
**Kompleksitas**: BESAR TAPI BISA DICICIL per halaman (tidak perlu 1
rilis besar) — setiap halaman independen, bisa dikerjakan satu-satu
tanpa blocking rilis fitur lain.
**Kenapa TERAKHIR**: halaman-halaman ini sudah BERFUNGSI (tidak ada gap
fungsional), jadi murni soal estetika — boleh menyusul kapan saja setelah
nilai fungsional (Tahap 2/3) sudah dipanen duluan. Kalau owner justru mau
"WOW visual" duluan utk demo, urutan Tahap 2/3/4 BOLEH ditukar (lihat
catatan fleksibilitas §3).

---

## 3. Dependency map & fleksibilitas urutan

```
Tahap 0 (keputusan desain)
    ↓ wajib
Tahap 1 (fondasi design system: token+komponen+motion+skeleton)
    ↓ dipakai oleh
    ├── Tahap 2 (A3 + Review AI)         ─┐
    └── Tahap 3 (ai-orchestrator + Gantt) ─┴─ independen satu sama lain
    ↓ (setelah 1 selesai, kapan saja)
Tahap 4 (rollout ke sisa halaman) — independen, bisa dicicil paralel dgn 2/3
```

**Fleksibilitas yang BOLEH diambil owner/Fable 5**:
- Tahap 2 vs Tahap 3 boleh ditukar urutan (tidak saling bergantung).
- Tahap 4 boleh MULAI sebagian (mis. dashboard home dulu, utk demo cepat)
  SEBELUM Tahap 2/3 selesai, SELAMA Tahap 1 (fondasi) sudah kelar —
  karena Tahap 4 murni re-skin, bukan fitur baru, risikonya rendah utk
  dikerjakan sela-sela.
- **YANG TIDAK BOLEH ditukar**: Tahap 1 harus SELALU lebih dulu dari
  2/3/4 — mengerjakan tahap lain dgn komponen lama lalu restyle
  belakangan = kerja dobel yang coba dihindari dokumen ini.

---

## 4. Perkiraan kompleksitas relatif (ringkasan, bukan janji waktu)

| Tahap | Kompleksitas | Alasan |
|---|---|---|
| 0. Keputusan desain | Kecil (bukan coding) | Diskusi + pilihan, bisa cepat kalau owner sudah condong ke 1 arah |
| 1. Fondasi design system | Sedang | Scope dibatasi sengaja (~10 komponen + 1 CSS file + 1 layout), bukan sweep halaman |
| 2. A3 + Review AI | **Besar** (paling besar di seluruh plan) | UI baru sama sekali (belum pernah ada), + investigasi endpoint approval yang mungkin belum ada |
| 3a. Wiring ai-orchestrator | Sedang | Perubahan terpusat 1 route + state context baru |
| 3b. Gantt/CPM UI | Sedang | Backend 100% siap, murni kerja render + form |
| 4. Rollout ke sisa halaman | Besar (tapi bisa dicicil) | Banyak halaman, TAPI masing-masing independen & berisiko rendah |

---

## 5. Apa yang perlu disiapkan owner SEBELUM mulai (gabungan semua tahap)

- [ ] **Keputusan Tahap 0** (§7 `PAAX_FRONTEND_DESIGN_SYSTEM_2026-07-05.md`)
  — arah palet, radius/shape, approval dependency Framer Motion.
- [ ] **Review & putuskan nasib PR #39 (`ai-orchestrator`) & PR #40
  (bridging non-struktur)** — keduanya masih draft dari sesi Codex
  sebelumnya. Disarankan direview/merge (atau diputuskan revisinya)
  SEBELUM Tahap 2/3 mulai, supaya UI tidak dibangun di atas API yang
  masih bisa berubah.
- [ ] **`GEMINI_API_KEY` tersedia utk `services/ai-orchestrator`**
  (bukan cuma utk `apps/web` yang sudah ada) — dicek/diisi di
  `.env` service itu sebelum Tahap 3a diuji nyata.
- [ ] **`services/ai-orchestrator` bisa dijalankan** (lokal via `pnpm
  dev` atau dideploy) — Tahap 3a butuh service ini ONLINE utk diuji,
  bukan cuma soal kode.
- [ ] **Referensi visual tambahan (opsional)** — kalau owner sudah
  condong ke satu Arah palet (§3 design-system doc) tapi ingin acuan yang
  LEBIH SPESIFIK dari 3 mood umum yang saya jabarkan, ambil 2-3
  screenshot dari daftar riset yang paling dekat mood itu (mis. kalau
  condong Arah A "Blueprint", cari referensi dashboard fintech/enterprise
  bertema biru gelap dari daftar Muzli/Dribbble yang sudah dikumpulkan) —
  mempercepat keselarasan visual sebelum Fable 5 mulai coding.
- [ ] **Keputusan desain "approve usulan AI"** (Tahap 2) — kemungkinan
  perlu diputuskan di awal tahap itu sendiri (bukan sekarang): apakah
  approve memanggil endpoint baru, atau cukup menyalin nilai usulan ke
  form RAB manual yang sudah ada. Investigasi dulu, jangan diasumsikan.

---

## 6. Yang SENGAJA TIDAK masuk plan ini

- **RBAC/role-based UI** (v2.0) — riset owner menyinggung "role-based
  UI" sbg tren 2026, DAN ini relevan krn `CLAUDE.md` §7 memang menyebut
  RBAC direncanakan "saat fitur multi-user mulai dibangun". TAPI itu
  BELUM waktunya (v2.0, jauh setelah v1.0) — cukup DESAIN token/layout
  sekarang dgn ASUMSI RINGAN bahwa suatu saat nav/dashboard perlu
  varian per-role (mis. jangan hardcode 1 nav tunggal dgn cara yang
  sulit dicabang nanti), TANPA membangun logic RBAC apa pun sekarang.
- **Migrasi ke shadcn/ui** — dipertimbangkan & DITOLAK di
  `PAAX_FRONTEND_DESIGN_SYSTEM_2026-07-05.md` §2 (risiko rewrite besar,
  manfaat tidak jelas utk kebutuhan aplikasi ini saat ini).
- **Chart library pihak ketiga** (recharts/visx/dll) — chart custom SVG
  yang ada SUDAH cukup baik & sudah terverifikasi bekerja; redesign
  cukup menambah motion (§6 design-system doc), bukan mengganti
  fondasi chart.
