# PROMPT SAYA — FASE 2 · PAKET P5-FIX: Perbaikan Terarah Panel Review Persepsi

> ## ⚠️ STATUS: HISTORIS / SUPERSEDED (2026-07-04 malam)
> Owner memutuskan Saya mengerjakan paket ini LANGSUNG. **SUDAH
> DIIMPLEMENTASIKAN** — lebih tuntas dari rencana di bawah (fabrikasi kode
> gerbang DIHAPUS TOTAL, bukan sekadar di-rename, karena `metrics`/`gerbang`
> ASLI dari backend sudah tersedia). Diverifikasi end-to-end di browser
> nyata. **JANGAN jalankan prompt ini via Saya.** Lihat status nyata di
> `docs/plans/PAAX_FASE2_PERSEPSI_PLAN_2026-07-04.md` §Paket F2-P5-FIX.

> Ditulis Saya 2026-07-04 setelah audit hasil kerja hari ini. Rencana induk:
> `docs/plans/PAAX_FASE2_PERSEPSI_PLAN_2026-07-04.md` §0.2 & §Paket F2-P5-FIX.
> **Ini BUKAN pembangunan baru.** Fitur "Analisis Gambar AI" / panel review
> persepsi di `TkgWorkspace` SUDAH ADA dan SUDAH JALAN (commit `a45b4c1` di
> branch `feat/ui-premium-redesign`, PR #26). Tugas paket ini HANYA memperbaiki
> 3 hal spesifik di kode yang sudah ada — jangan menulis ulang komponen, jangan
> mengubah alur yang sudah benar (upload → jalankan persepsi → review →
> konfirmasi pakai sebagai transkrip tetap dipertahankan, itu sudah bagus).

---

## 0. Konteks — kenapa perbaikan ini perlu

Audit Saya menemukan `buildPerceptionReview()` di
`apps/web/src/components/drawings/tkg-workspace.tsx` menghitung sendiri (di
TypeScript) sebuah blok "Gerbang" dengan kode `V-TKG`, `V-COV`, `V-WARN`,
`V-CLS`. Ini BUKAN pelanggaran Aturan Emas secara harfiah (bukan angka
RAB/HSP — cuma tally elemen/tabel/dimensi yang sudah ada di memori), TAPI ada
2 masalah nyata:

1. **Tabrakan penamaan dengan validator resmi.** Brain (`docs/specs/brain-v4.1/
   PAAX_BRAIN_00_EKSTRAKSI_GAMBAR_KERJA.txt` §7) mendefinisikan kode validator
   resmi `V-01` s/d `V-10` (mis. `V-02` = konsistensi grid, `V-05` = hitung
   ganda-metode). Kode buatan `V-TKG`/`V-COV`/`V-WARN`/`V-CLS` di frontend
   MENIRU pola penamaan itu padahal bukan validator resmi — berisiko membuat
   sesi/engineer mendatang mengira ini bagian dari validator brain yang asli.
2. **Tidak ada label yang bilang ini sementara.** UI menampilkan status "SIAP
   REVIEW" / "DRAFT PERSEPSI" seolah ini hasil gerbang yang tervalidasi,
   padahal itu heuristik tally lokal (`coverage = classified / total` dari
   data yang sudah ter-load), BUKAN dari validator backend V-01..V-10.

Perbaikan ini KECIL & TERARAH: ganti penamaan supaya tidak bentrok, dan
tambahkan label jujur bahwa ini sementara — sambil menyiapkan agar mudah
diganti oleh `metrics`/`gerbang` ASLI begitu backend (paket P4, memperluas
`POST /drawings/analyze`) selesai.

---

## 1. Perubahan yang WAJIB dilakukan

File: `apps/web/src/components/drawings/tkg-workspace.tsx`

### 1.1 Ganti kode `checks` supaya tidak bentrok nama dengan validator resmi
Di fungsi `buildPerceptionReview()`, ubah `code` pada array `checks`:
- `'V-TKG'` → `'UI-TKG'`
- `'V-COV'` → `'UI-COV'`
- `'V-WARN'` → `'UI-WARN'`
- `'V-CLS'` → `'UI-CLS'`

(Prefiks `UI-` menandakan ini heuristik tampilan, BUKAN kode validator resmi
`V-01..V-10` milik brain/backend.)

### 1.2 Tambah label eksplisit "heuristik sementara"
Di bagian render blok "Gerbang" (sekitar judul
`<div ...>Gerbang</div>` sebelum list `perceptionReview.checks.map(...)`),
tambahkan satu baris teks kecil (gaya sama dengan teks `--text3` lain di
komponen ini, JANGAN styling baru):

```tsx
<div style={{ fontSize: 10.5, color: 'var(--text3)', marginBottom: 6, fontStyle: 'italic' }}>
  Ringkasan heuristik UI dari transkrip yang sudah dimuat — belum divalidasi backend
  (validator resmi V-01..V-10 dari Fase 2 P4 belum tersambung). Akan diganti otomatis
  begitu metrik/gerbang asli dari backend tersedia.
</div>
```

### 1.3 Siapkan jalur agar mudah diganti oleh data backend asli
Tambahkan komentar TODO tepat di atas fungsi `buildPerceptionReview` (di atas
baris `function buildPerceptionReview(...)`):

```tsx
// TODO(Fase2 P4): buildPerceptionReview() menghitung coverage/checks secara
// heuristik di frontend dari DrawingIntakeResult SEMENTARA karena
// POST /drawings/analyze (services/document-intelligence) belum mengembalikan
// field `metrics`/`gerbang` asli. Begitu P4 menambah field itu ke
// DrawingAnalysisResponse, fungsi ini WAJIB diganti untuk membaca field asli
// dari backend, bukan menghitung ulang di sini (lihat
// docs/plans/PAAX_FASE2_PERSEPSI_PLAN_2026-07-04.md §Paket F2-P4).
```

**JANGAN mengubah logika lain** di fungsi ini (tetap hitung `coverage` dari
tally yang sudah ada — itu wajar sbg fallback sementara, TIDAK ada larangan
untuk menampilkan angka turunan dari data yang SUDAH di memori; yang dilarang
adalah menyamarkannya sebagai validator resmi, yang sudah diperbaiki di §1.1-1.2).

### 1.4 Update test yang relevan
`apps/web/src/components/drawings/tkg-workspace.test.tsx`: kalau ada assertion
yang mencocokkan string `'V-TKG'`/`'V-COV'`/`'V-WARN'`/`'V-CLS'`, update ke
`'UI-TKG'`/`'UI-COV'`/`'UI-WARN'`/`'UI-CLS'`. Tambahkan 1 assertion baru: teks
disclaimer heuristik (§1.2) muncul di DOM saat `perceptionReview` terisi.

---

## 2. Beres-beres PR lama (housekeeping git, HATI-HATI — baca sebelum eksekusi)

Ada draft PR #28 (`feat/fase2-p5-ui-persepsi-review`) dari eksekusi PERTAMA
paket P5 pagi ini — versi itu memakai kontrak mock `POST /drawings/tkg/perceive`
yang sekarang SUPERSEDED oleh implementasi nyata di PR #26
(`feat/ui-premium-redesign`, memakai `POST /drawings/analyze` yang sudah ada).

- **JANGAN hapus branch `feat/fase2-p5-ui-persepsi-review` atau force-push
  apa pun.** Cukup:
  1. Beri komentar di PR #28 menjelaskan bahwa implementasi final ada di PR
     #26 (`feat/ui-premium-redesign`), dan PR #28 boleh ditutup TANPA merge.
  2. **JANGAN menutup PR itu sendiri** — itu keputusan owner. Tulis di report
     bahwa PR #28 sebaiknya ditutup manual oleh owner, sertakan alasannya.
- Kalau connector GitHub tidak mengizinkan komentar PR (403 seperti sesi
  sebelumnya), cukup catat rekomendasi ini di report — JANGAN memaksa lewat
  cara lain.

---

## 3. Branch & commit

- **Kerjakan LANGSUNG di branch `feat/ui-premium-redesign`** (branch yang
  sudah aktif berisi implementasi nyata fitur ini, sudah terhubung ke draft PR
  #26) — JANGAN buat branch baru untuk perbaikan kecil ini. Ini bukan
  pengecualian dari aturan "branch baru → PR" (SAYA.md §9); PR #26 SUDAH
  ADA sebagai kendaraan review untuk seluruh perubahan UI premium, termasuk
  fitur ini.
- Commit terpisah (jangan digabung ke commit lain), conventional commit:
  `fix(tkg-workspace): hindari tabrakan kode validator + label heuristik sementara (Fase 2 P5-FIX)`
- Push ke `origin/feat/ui-premium-redesign` (branch ini sudah ahead beberapa
  commit dari origin — push akan menambah, bukan menimpa; JANGAN force-push).

---

## 4. Verifikasi sebelum commit

```powershell
cd G:\paax-ai-main\apps\web
pnpm test -- tkg-workspace
pnpm tsc --noEmit
```

Kriteria terima:
- Tidak ada lagi string kode `'V-TKG'`/`'V-COV'`/`'V-WARN'`/`'V-CLS'` di
  `tkg-workspace.tsx` (ganti semua ke prefiks `UI-`).
- Disclaimer heuristik tampil saat ada `perceptionReview`.
- Komentar TODO(Fase2 P4) ada di atas `buildPerceptionReview`.
- vitest & tsc tetap hijau, tidak ada regresi ke 40 test yang sudah ada.
- Fallback manual (tab teks-deskripsi / AI-teks) tetap ada & tidak diubah.

---

## 5. Commit & REPORT

- Push ke `feat/ui-premium-redesign` (lihat §3).
- Report → `report/REPORT_FASE2_P5_FIX_SAYA_2026-07-04.md`: ringkas 3
  perubahan (§1.1-1.4), rekomendasi soal PR #28 (§2), output test/tsc, SHA
  commit baru.

---

## 6. Yang TIDAK dikerjakan di paket ini
- Tidak membangun endpoint backend baru/memperluas `/drawings/analyze` — itu
  paket P4.
- Tidak menyambungkan ke pipeline persepsi baru (P1-P4 belum ada) — panel ini
  TETAP memakai `/drawings/analyze` yang sudah ada, hanya dikoreksi labelnya.
- Tidak mengubah alur upload/konfirmasi yang sudah benar.
- Tidak menutup PR #28 sendiri — itu keputusan owner (§2).
Ragu di luar 3 poin §1 → STOP & tanya, jangan menambah cakupan.
