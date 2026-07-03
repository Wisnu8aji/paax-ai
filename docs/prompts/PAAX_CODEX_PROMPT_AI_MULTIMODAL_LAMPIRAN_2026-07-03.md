# PROMPT CODEX — AI Multimodal: Lampiran Chat + (opsional) Vision Gambar Kerja (2026-07-03)

> ⚠️ **JANGAN JALANKAN sebelum owner mengisi kotak persetujuan Bagian B di
> bawah.** Ini prompt TERPISAH dari `PAAX_CODEX_PROMPT_PERBAIKAN_UI_BATCH_2026-07-03.md`
> (owner sengaja minta dipisah — "task terpisah tapi tetap pikirkan, saya
> akan tinggal running nanti"). Baca dulu catatan gerbang di bawah sebelum
> mulai — ada satu keputusan roadmap yang harus dikonfirmasi owner secara
> eksplisit (Bagian B), bukan diasumsikan oleh Codex.

## Kenapa dipisah dari batch perbaikan UI

`Downloads/perbaikan.txt` poin 10-11 minta: lampiran file/foto di
Engineering Chat beneran dibaca AI (bukan cuma tempelan visual), dan upload
gambar di halaman Gambar Kerja AI juga berfungsi. Ini kerja baru yang cukup
besar (bukan sekadar rapikan UI) — perlu ubah skema API chat + panggilan
Gemini jadi multimodal. Owner minta ini jadi prompt sendiri yang direview
dulu sebelum dijalankan.

---

## Bagian A — Lampiran Engineering Chat (aman, TIDAK menyentuh gerbang F0)

Bagian ini murni membuat Engineering Chat bisa "melihat" apa yang
dilampirkan user — SAMA seperti Claude/ChatGPT. Chat hanya MENJELASKAN
(Aturan Emas tetap berlaku: tidak pernah menghasilkan angka RAB/HSP dari
lampiran ini), jadi ini tidak menyentuh gerbang F0/TKG sama sekali — aman
dikerjakan kapan saja.

**Kondisi sekarang** (sudah diverifikasi Claude, jujur ditulis di kode):
`apps/web/src/app/(dashboard)/proyek/[projectId]/chat/page.tsx:481-499` —
lampiran hanya `{id, name, sizeLabel}` (`onPickFiles`, baris 201-210), TIDAK
PERNAH ikut dikirim ke `/api/ai/chat`. Ada disclaimer jujur di baris 497-499:
"Lampiran belum dikirim ke AI". `lib/ai/orchestrator.ts` (`geminiText`, baris
202-220) hanya mendukung `parts: [{ text }]` — belum ada dukungan
`inlineData` (gambar/PDF) sama sekali.

**Fix:**

1. **Client** (`chat/page.tsx`): `onPickFiles` baca isi file betulan pakai
   `FileReader.readAsDataURL` (base64), simpan di `PendingAttachment`
   (tambah field `base64: string`, `mimeType: string`). Batasi ukuran per
   file (mis. tolak > 8 MB dengan pesan jelas) DAN batasi jumlah lampiran per
   pesan (mis. maks 4) — guard biaya/payload, pola sama seperti
   `context.max(8000)` yang sudah ada di `ChatBodySchema`.
2. **Kirim ke server**: sertakan `attachments: [{mimeType, data}]` di body
   POST `/api/ai/chat` (`handleSubmit`, baris 235-243).
3. **Schema** (`apps/web/src/app/api/ai/chat/route.ts:17-23`,
   `ChatBodySchema`): tambah field opsional
   `attachments: z.array(z.object({ mimeType: z.string(), data: z.string() })).max(4).optional()`.
   Validasi mimeType hanya izinkan yang benar-benar didukung Gemini inline
   (`image/png`, `image/jpeg`, `image/webp`, `application/pdf` — **BUKAN**
   `.docx`/`.xlsx`/`.dwg`, Gemini tidak baca itu sebagai inline data mentah).
4. **`lib/ai/orchestrator.ts`**: perluas interface `GeminiPart` (baris 26-28)
   tambah `inlineData?: { mimeType: string; data: string }`. Tambah fungsi
   baru (mis. `geminiMultimodal(promptText, attachments, apiKey, fetchImpl)`)
   yang membangun `parts: [{ text: promptText }, ...attachments.map(a =>
   ({ inlineData: a }))]` lalu panggil `geminiGenerateContent` yang SUDAH ADA
   (baris 136-166) — endpoint & cara panggil REST-nya TIDAK berubah, Gemini
   API sudah menerima bentuk ini secara native, murni tambahan field.
5. **`lib/ai/engineering-chat.ts`**: `buildEngineeringChatPrompt` perlu tahu
   ada lampiran (tambah kalimat instruksi singkat: "User melampirkan N
   file — jelaskan/rangkum isinya bila relevan dengan pertanyaan").
   `app/api/ai/chat/route.ts` POST handler panggil `geminiMultimodal` (bukan
   `geminiText`) kalau `attachments` ada isinya.
6. **UI setelah wiring beres**: ganti disclaimer "Lampiran belum dikirim ke
   AI" (baris 497-499) — untuk mimeType yang DIDUKUNG (gambar/PDF), hapus
   disclaimer itu (memang sudah terkirim). Untuk mimeType yang TIDAK
   didukung (xlsx/docx/dwg), GANTI jadi pesan jujur baru yang lebih spesifik,
   mis. "Format ini belum bisa dibaca langsung AI — untuk RAB/BoQ pakai
   Smart Import, untuk gambar pakai halaman Gambar Kerja AI."

**Kriteria terima:** lampirkan foto/screenshot ke Engineering Chat, tanya
"apa isi gambar ini" — jawaban AI merujuk isi gambar sungguhan (bukan
generic). Lampirkan .xlsx — muncul pesan format-tidak-didukung yang jelas,
bukan diam-diam diabaikan.

---

## Bagian B — Vision MVP untuk Gambar Kerja AI (⚠️ menyentuh gerbang F0 — WAJIB persetujuan eksplisit)

### Kenapa ini beda dari Bagian A

`perbaikan.txt` poin 1-2 minta TKG jadi "hasil AI membaca gambar yang
diupload" — dan menurut spek acuan (`G:\brain\PAAX_BRAIN_00_EKSTRAKSI_GAMBAR_KERJA.txt`),
itu MEMANG desain yang benar untuk versi final: TKG lahir dari pipeline
persepsi (ekstraksi vektor PDF, OCR per-zona, deteksi grid/tabel/simbol,
pengikatan label↔objek, 10 validator V-01..V-10 — lihat §1-§8 dokumen
tersebut).

TAPI: pipeline lengkap itu = `services/document-intelligence` yang SUDAH
digerbang eksplisit di `docs/BRAIN_ALIGNMENT.md` (ditulis owner+Claude,
2026-07-02, SATU HARI sebelum perbaikan.txt ini):

> "Ditunda | `services/document-intelligence` (OCR/CV/vision), TKG builder
> sungguhan | ⚪ menunggu gerbang F0 (data grounding) + validasi
> Wizard-of-Oz"

Dan alasannya juga sudah tercatat: AHSP di repo masih data DEMO, harga
±99% kosong (`docs/ai-map/STATE.md` bagian "GAP DATA") — membangun
baca-gambar sebelum data dasarnya benar berisiko menghasilkan RAB yang
kelihatan meyakinkan tapi keliru dari akarnya.

**Bagian B di bawah BUKAN pipeline brain-00 yang lengkap** — ini jalan
pintas MVP: satu panggilan Gemini Vision (mekanisme SAMA dengan Bagian A)
untuk mengusulkan draft TKG dari gambar, TANPA ekstraksi vektor presisi,
TANPA OCR per-zona, TANPA 10 validator V-01..V-10. Ini lebih murah/cepat
dibangun tapi jauh lebih rendah akurasi & rigor dibanding spek final —
risiko salah-baca (kode elemen, angka tulangan, skala) jauh lebih tinggi
daripada yang dijamin brain-00. Tetap wajib lewat `reviewed=false` +
Triage seperti sekarang — tapi keyakinan terhadap hasilnya harus dianggap
lebih rendah.

**Ini keputusan roadmap, bukan keputusan teknis** — maka:

### Kotak persetujuan (isi sebelum menyuruh Codex jalan)

```
[ ] SAYA (owner) MENGERTI Bagian B = mulai duluan dari gerbang F0 yang
    sudah ditunda sadar, dan MEMILIH tetap jalan sekarang karena MVP vision
    (bukan pipeline lengkap) dianggap cukup untuk kebutuhan saat ini.
    Tanggal persetujuan: __________

[ ] TUNDA Bagian B — jalankan HANYA Bagian A dari prompt ini. Gambar Kerja
    AI tetap pakai jalur teks manual (sudah disederhanakan tampilannya di
    batch perbaikan UI) sampai gerbang F0 (data grounding AHSP/harga) selesai.
```

**Codex: kalau kotak di atas belum dicentang salah satu, JANGAN kerjakan
Bagian B — kerjakan Bagian A saja, laporkan bahwa Bagian B menunggu
keputusan.**

### Spek teknis Bagian B (HANYA kalau sudah disetujui)

1. Pakai ulang `geminiMultimodal` dari Bagian A — jangan bikin jalur Gemini
   terpisah.
2. `apps/web/src/app/api/ai/tkg/route.ts` — tambah dukungan input gambar:
   terima `image: { mimeType, data }` opsional selain `text` (salah satu
   wajib ada). `apps/web/src/lib/ai/tkg-extractor.ts` (`extractTkgWithProvider`)
   diperluas supaya saat ada `image`, prompt Gemini eksplisit minta hasil
   JSON sesuai `TkgDocumentSchema` (skema yang SAMA dengan jalur teks
   sekarang — jangan bikin skema baru) dari isi visual gambar.
3. UI (`tkg-workspace.tsx`, versi setelah disederhanakan di batch
   perbaikan-UI): tombol upload yang sudah tersambung ke
   `drawingsRepository` (dari batch UI, poin 4c) bisa kirim file gambar
   langsung ke jalur ini sebagai alternatif textarea teks — user pilih salah
   satu (upload gambar ATAU ketik teks), bukan wajib dua-duanya.
4. **WAJIB tetap:** `generated_by: "ai_proposal"`, `reviewed: false` sampai
   ditinjau manusia — SAMA seperti jalur teks sekarang, TIDAK ADA jalan
   pintas lewati review manusia hanya karena sumbernya "kelihatan canggih".
   Pertimbangkan menambah catatan confidence lebih rendah / lebih banyak
   item otomatis ditandai `needs_review` dibanding jalur teks, karena
   rigor-nya memang lebih rendah — dokumentasikan di komentar kode kenapa.
5. **Batasan tegas — DILARANG dibangun di Bagian B ini** (kalau butuh ini,
   berarti sudah bukan MVP lagi, harus sesi baru + gerbang F0 dibuka resmi):
   ekstraksi vektor PDF (PyMuPDF), OCR per-zona, deteksi grid/tabel/simbol
   dari geometri, 10 validator V-01..V-10 versi lengkap, `services/document-intelligence` sebagai service terpisah.

**Kriteria terima (kalau Bagian B dikerjakan):** upload foto/scan gambar
kerja sederhana di halaman Gambar Kerja AI → dapat draft TKG (status
"usulan AI, belum direview" tetap seperti sekarang) tanpa harus mengetik
ulang deskripsi teks. Tetap harus ditinjau manusia sebelum dipakai ke RAB —
tidak ada perubahan pada aturan review itu.

---

## Guardrail & aturan git (sama seperti batch lain)

```powershell
$env:Path = "C:\Program Files\nodejs;$env:APPDATA\npm;$env:Path"
cd apps/web
pnpm exec tsc --noEmit -p tsconfig.json
pnpm test
pnpm build
```

Branch: cek dulu apakah `feat/ui-premium-redesign` (PR #26) sudah di-merge
ke `main` saat prompt ini dijalankan. Kalau sudah merge → branch baru dari
`main`. Kalau belum → lanjutkan di `feat/ui-premium-redesign` supaya tidak
ada dua branch paralel yang sama-sama menyentuh `tkg-workspace.tsx`/
`chat/page.tsx`. `git add` eksplisit per file (JANGAN `-A`/`.`). PR **draft**,
**JANGAN merge**, **JANGAN** push ke `main`.

Laporkan: Bagian A selesai/tidak, Bagian B dikerjakan atau ditunda (dan
kenapa — kutip kotak persetujuan), hasil guardrail, SHA commit, URL PR.
