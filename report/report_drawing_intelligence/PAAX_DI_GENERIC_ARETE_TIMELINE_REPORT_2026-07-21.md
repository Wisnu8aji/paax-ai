# PAAX Drawing Intelligence — Generalisasi Proyek dan Arete Activity Timeline

**Tanggal:** 21 Juli 2026  
**Status:** Implementasi selesai; regression gate utama hijau  
**Live provider/API AI calls:** 0

## 1. Ringkasan

Gelombang ini menyelesaikan dua masalah produk:

1. Drawing Intelligence tidak lagi dibentuk seperti template PLHUT. Klasifikasi sekarang menangani lantai arbitrary, basement, ground floor, mezzanine, atap, fondasi, site, superstruktur, substruktur, trase jalan, rumah sakit bertingkat, gambar jembatan, road plan/profile, cross-section, reinforcement detail, dan halaman yang tidak dikenal.
2. Command Room Arete tidak lagi menampilkan satu status template yang berganti-ganti atau ringkasan dari model murah. UI sekarang menampilkan activity timeline bertumpuk berdasarkan milestone dan tool event nyata.

Frontend visual utama tidak didesain ulang. Perubahan berada pada data flow, reasoning presentation, transition, source authority, dan kebenaran klasifikasi.

## 2. Activity timeline Arete

### Sebelum

- Satu label status diganti berulang kali.
- Sebagian label berasal dari daftar template.
- Reasoning summary memakai model murah dan kualitasnya tidak konsisten.
- Riwayat proses tidak menjadi artefak yang mudah dibuka kembali.

### Sekarang

- Langkah baru ditambahkan ke bawah; langkah lama tetap terlihat.
- Ikon mengikuti aktivitas nyata: pemeriksaan file, context/database, graph, search, tool, reasoning aman, verification, compose, dan save.
- Tool call mempunyai ID unik sehingga pemanggilan tool yang sama tidak saling menimpa.
- Durasi berasal dari timestamp run, bukan teks buatan.
- Setelah selesai, trace bertransisi lalu terlipat menjadi **“Memproses selama …”**.
- Trace tersimpan pada history assistant dan dapat dibuka kembali.
- `aria-live` digunakan saat proses aktif.
- Arete/Lucent tidak menerima raw provider reasoning. Noir mempertahankan mode reasoning eksplisit yang memang sudah menjadi konsep produk.

Activity timeline adalah observability UI, bukan pembocoran private chain-of-thought.

## 3. Generalisasi Drawing Intelligence

### Level dan scope

Didukung tanpa default PLHUT:

- Lantai 0 sampai Lantai 99 berdasarkan metadata atau title evidence;
- Basement B1–B99;
- Lantai Dasar;
- Mezanin;
- Atap;
- Fondasi/Substruktur;
- Area Tapak;
- Superstruktur;
- Substruktur;
- Trase/Alignment;
- level belum teridentifikasi.

Metadata level eksplisit dari backend selalu menang terhadap inferensi judul. Title inference hanya fallback.

### Jenis gambar tambahan

- General Arrangement;
- Bridge Plan;
- Road Plan / Profile;
- Cross Section;
- Reinforcement Detail;
- Other / Unclassified.

Halaman asing tidak dipaksa menjadi Floor Plan.

### Kasus uji non-PLHUT

- `Level 12 Column Plan` rumah sakit → column plan, L12, structure;
- `Basement 3 Parking Plan` → B3;
- `Bridge General Arrangement - Abutment A1` → bridge plan, substructure;
- `Road Plan and Profile STA 0+000 - 1+000` → road plan/profile, alignment;
- vendor reference sheet → unknown, tanpa lantai palsu.

## 4. Human-first Command Room

`query_project_graph` sekarang mencoba mengambil **human drawing view** terbaru. Untuk pertanyaan biasa, Arete menerima work item ringkas:

- kode dan nama elemen;
- klasifikasi;
- level dan disiplin;
- ukuran tertulis;
- jumlah label/simbol teramati;
- status verifikasi;
- blocker;
- judul lembar dan halaman.

Raw PCKM nodes tidak dikirim bila human view sudah cukup. Raw audit layer baru disertakan ketika user memang meminta evidence, konflik, audit, atau detail teknis.

Sitasi disederhanakan menjadi contoh:

```text
[DENAH KOLOM LANTAI 2 p.43]
```

ID evidence internal tetap tersedia di backend untuk audit.

## 5. Simulasi jawaban Arete dari data 88 halaman

Pertanyaan:

> kolom lantai 2 ada apa saja jumlah berapa ukuran berapa

Jawaban kontrak yang lulus QA:

| Tipe | Temuan gambar | Ukuran tertulis | Status | Sumber |
|---|---:|---|---|---|
| K1A | 12 label/simbol teramati | 400 × 400 mm | Jumlah fisik belum diverifikasi | [DENAH KOLOM LANTAI 2 p.43] |
| K2 | 3 label/simbol teramati | 250 × 600 mm | Jumlah fisik belum diverifikasi | [DENAH KOLOM LANTAI 2 p.43] |
| K3 | 2 label/simbol teramati | 250 × 400 mm | Jumlah fisik belum diverifikasi | [DENAH KOLOM LANTAI 2 p.43] |

K-01 tetap dipisahkan sebagai temuan tambahan karena dimensinya belum pasti.

Untuk pertanyaan volume, Arete menolak angka final sampai tinggi dan jumlah fisik telah disahkan, kemudian mengarahkan kalkulasi ke Core Engine.

## 6. Claim authority hardening

Dua bug nyata ditemukan dan diperbaiki:

1. Dimensi `250 × 600 mm` sebelumnya hanya membentuk claim untuk angka kedua. Sekarang 250 dan 600 diikat ke tool result yang sama.
2. Kalimat seperti `12 simbol ..., jadi jumlah fisik kolom adalah 12` sebelumnya hanya mengganti angka dengan placeholder dan masih meninggalkan makna yang salah. Sekarang klausa physical inference dihapus utuh. Observasi drawing yang evidence-backed tetap dapat dipertahankan.

## 7. Google Fonts build dependency

`next/font/google` membuat production build bergantung pada akses `fonts.googleapis.com`. Import tersebut diganti dengan build-safe local font stacks menggunakan token CSS yang sama. Tidak ada font binary yang dibundel dan tidak ada perubahan hierarchy/layout.

## 8. Hasil pengujian

| Gate | Hasil |
|---|---:|
| Drawing Intelligence focused regression | **32 passed** |
| Arete offline QA terhadap 88-page human delivery | **16/16 PASS** |
| Command Room focused TypeScript regression | **47 passed** |
| Schemas Jest | **32 passed** |
| AI Orchestrator Vitest | **54 passed** |
| Web Vitest | **140 passed** |
| Schemas typecheck | **PASS** |
| AI Orchestrator typecheck | **PASS** |
| Web `tsc --noEmit` | **PASS** |
| Core Engine | **295 passed** |
| PCKM benchmark | **14/14 PASS** |
| TypeScript syntax scan | **204 files, 0 syntax errors** |
| Python compile | **PASS** |
| Live AI provider call | **0** |

### Production build

- schemas build: PASS;
- types build: PASS;
- orchestrator build/typecheck: PASS;
- web compilation: PASS;
- web type validation terpisah: PASS;
- Next.js page-data collection: belum selesai pada environment ini; worker tertahan lalu diputus timeout/EPIPE.

Build tidak lagi gagal karena Google Fonts. Sisa masalah berada setelah compile/type validation dan harus direproduksi di lokal atau CI dengan observability process yang lebih lengkap.

### Database

Tidak ada source DB yang diubah dalam gelombang ini. Full DB suite tidak diklaim dijalankan ulang karena runner monolitik tertahan pada environment plugin sebelumnya. PCKM benchmark offline 14/14 lulus.

## 9. Batasan

- Tidak ada live model call. Variasi bahasa model nyata harus diuji pada staging dengan key khusus non-produksi.
- Universal accuracy membutuhkan proyek nyata kedua dan manual ground truth, bukan hanya PLHUT.
- PostgreSQL/pgvector CI tetap menjadi release gate.
- Activity timeline tidak dan tidak boleh menampilkan private hidden chain-of-thought.

## 10. File source yang ditambah/diubah

- `apps/web/src/app/api/command-room/chat/reasoning-visibility.test.ts`
- `apps/web/src/app/api/command-room/chat/reasoning-visibility.ts`
- `apps/web/src/components/drawing-intelligence/workspace/sheet-view-mapping.test.ts`
- `apps/web/src/components/drawing-intelligence/workspace/sheet-view-mapping.ts`
- `apps/web/src/lib/chat/activity-timeline.test.ts`
- `apps/web/src/lib/chat/activity-timeline.ts`
- `apps/web/src/lib/chat/arete-activity-contract.test.ts`
- `report/report_drawing_intelligence/BENCHMARK_SCORECARD_2026-07-21.md`
- `report/report_drawing_intelligence/COMMAND_ROOM_ARETE_OFFLINE_QA_2026-07-21.json`
- `report/report_drawing_intelligence/COMMAND_ROOM_ARETE_OFFLINE_QA_2026-07-21.md`
- `scripts/verify_arete_command_room_offline.py`
- `apps/web/src/app/(dashboard)/command-room/page.tsx`
- `apps/web/src/app/(dashboard)/drawing-intelligence/page.tsx`
- `apps/web/src/app/api/command-room/chat/claim-pipeline.test.ts`
- `apps/web/src/app/api/command-room/chat/claim-pipeline.ts`
- `apps/web/src/app/api/command-room/chat/claim-provenance.ts`
- `apps/web/src/app/api/command-room/chat/memory-runtime.test.ts`
- `apps/web/src/app/api/command-room/chat/route.ts`
- `apps/web/src/app/api/command-room/chat/tools.ts`
- `apps/web/src/app/globals.css`
- `apps/web/src/app/layout.tsx`
- `apps/web/src/components/command-room/RunStatus.tsx`
- `apps/web/src/components/drawing-intelligence/workspace/__tests__/ask-paax.test.ts`
- `apps/web/src/components/drawing-intelligence/workspace/di-types.ts`
- `apps/web/src/components/drawing-intelligence/workspace/dock/handoff-mode.tsx`
- `apps/web/src/components/drawing-intelligence/workspace/environment-and-sheet-mapping.test.ts`
- `apps/web/src/components/drawing-intelligence/workspace/index.tsx`
- `apps/web/src/components/drawing-intelligence/workspace/inspector/ask-paax.tsx`
- `apps/web/src/components/drawing-intelligence/workspace/navigator/files-mode.tsx`
- `apps/web/src/components/drawing-intelligence/workspace/status-bar.tsx`
- `apps/web/src/components/drawing-intelligence/workspace/topbar.tsx`
- `apps/web/src/components/drawing-intelligence/workspace/use-backend-sync.ts`
- `apps/web/src/components/drawing-intelligence/workspace/workspace-store.tsx`
- `apps/web/src/lib/chat/chat-history.ts`
- `apps/web/src/lib/chat/chat-run-store.ts`
- `apps/web/src/lib/chat/chat-stream-events.ts`
- `apps/web/src/lib/chat/format-run-duration.ts`
- `services/ai-orchestrator/src/tools/query_project_graph.ts`
- `services/ai-orchestrator/tests/tools/query_project_graph.test.ts`
- `services/document-intelligence/app/drawing_intelligence/models.py`
- `services/document-intelligence/app/drawing_intelligence/sheet_identity.py`
- `services/document-intelligence/app/drawing_intelligence/taxonomy.py`
- `services/document-intelligence/tests/test_drawing_intelligence_kreo_runtime.py`

### File yang dihapus

- `apps/web/src/app/api/command-room/chat/status-summarizer.ts`

## 11. Keputusan

```text
Siap dipindahkan ke lokal                         : YA
Siap menjadi basis source Drawing Intelligence   : YA
Generalisasi non-PLHUT baseline                   : YA
Arete activity timeline bertumpuk                 : YA
Jawaban 88-page diuji tanpa live API              : YA
Full production release                           : BELUM
```
