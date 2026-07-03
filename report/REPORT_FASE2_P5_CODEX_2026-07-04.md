# Report Codex - Fase 2 P5 UI Persepsi Review

Tanggal eksekusi: 2026-07-04  
Branch: `feat/fase2-p5-ui-persepsi-review`  
Base PR: `main`  
Implementation commit: `60a2f64`  
Draft PR: https://github.com/Wisnu8aji/paax-ai/pull/28

## Sumber Instruksi

Prompt:

`G:\paax-ai-main\docs\prompts\PAAX_CODEX_PROMPT_FASE2_P5_UI_PERSEPSI_REVIEW.md`

Plan:

`G:\paax-ai-main\docs\plans\PAAX_FASE2_PERSEPSI_PLAN_2026-07-04.md`

Skill/guidance yang dipakai:

- `ui-ux-pro-max`: accessibility, error recovery, progressive disclosure, data table overflow, loading feedback.
- `ui-main/shadcn`: dipakai sebagai checklist komposisi UI; repo tidak memiliki `components.json`, jadi CLI shadcn tidak dijalankan.
- `frontend-design`: menjaga konsistensi gaya PAAX yang sudah ada, tanpa palet/font baru.

## Yang Dikerjakan

- Menambahkan tab `0 · Persepsi (PDF)` sebelum tab `Sumber` di `TkgWorkspace`.
- Menambahkan upload PDF dengan label eksplisit dan tombol `Jalankan persepsi`.
- Menambahkan client `DocumentIntelligenceClient.perceiveTkg()` untuk `POST /drawings/tkg/perceive`.
- Menampilkan hasil review persepsi:
  - status `GERBANG-2 LOLOS` / `DRAFT`,
  - metrik dari backend (`cakupan`, `grammar_pass_rate`, `n_unclassified`, `n_warning`),
  - daftar checks gerbang,
  - warnings grouped by code dan collapsed default,
  - unclassified list dengan locator teks `(hal. n, bbox ...)`.
- Menambahkan aksi `Pakai TKG ini sebagai transkrip` yang menyimpan source `pipeline`.
- Menambahkan aksi `Buang, coba lagi`.
- Menambahkan error recovery yang mengarahkan user ke tab `Sumber` untuk fallback AI-teks/manual JSON.
- Menambahkan source `pipeline` ke repository TKG dan context pack chat.
- Menambahkan test komponen React untuk flow P5.

## Deskripsi UI

Screenshot tidak dibuat; hasil diverifikasi lewat test komponen dan deskripsi:

- Saat belum ada hasil, tab persepsi menampilkan empty state: "Belum ada hasil persepsi — unggah PDF gambar kerja."
- Setelah upload sukses, panel menampilkan ringkasan gerbang di atas, grid metrik ringkas, checks gerbang, accordion warning per kode, tabel detail warning, tabel unclassified, dan CTA utama untuk memakai TKG.
- Warna bukan satu-satunya indikator: status memakai `StatusPill`, checks memakai ikon `CheckCircle2` / `AlertTriangle` plus teks `lolos` / `belum lolos`.
- Semua tabel baru dibungkus `overflowX: auto`.

## Bagian Yang Masih Mock / Menunggu P4

Backend P4 belum merge di `main`. UI ini memakai kontrak P5 yang disediakan prompt:

- endpoint: `POST /drawings/tkg/perceive`,
- response: `tkg`, `validation`, `metrics`, `gerbang`, optional `warnings`, optional `unclassified`, `tkg_txt`.

Di code sudah diberi marker:

`TODO: sambung P4 saat endpoint kontrak final sudah merge.`

Jika P4 final mengubah nama endpoint atau shape field, bagian client/type perlu diselaraskan.

## File Diubah

- `apps/web/src/components/drawings/tkg-workspace.tsx`
- `apps/web/src/components/drawings/tkg-workspace.test.tsx`
- `apps/web/src/lib/document-intelligence-client.ts`
- `apps/web/src/lib/projects/tkg-repository.ts`
- `apps/web/src/lib/ai/project-context.ts`
- `apps/web/vitest.config.ts`
- `apps/web/package.json`
- `pnpm-lock.yaml`

## Verifikasi

Perintah:

```powershell
cd G:\paax-ai-main-fase2-p5\apps\web
pnpm test -- tkg-workspace
```

Hasil:

```text
Test Files  1 passed (1)
Tests       6 passed (6)
```

Perintah:

```powershell
cd G:\paax-ai-main-fase2-p5\apps\web
pnpm tsc --noEmit
```

Hasil:

```text
passed
```

Perintah tambahan:

```powershell
cd G:\paax-ai-main-fase2-p5
pnpm --filter @paax/web test
```

Hasil:

```text
Test Files  11 passed (11)
Tests       36 passed (36)
```

Lakmus fixture-bukan-template:

```powershell
rg "PLHUT" apps/web/src/components/drawings/tkg-workspace.tsx
```

Hasil:

```text
NO_PLHUT_IN_COMPONENT
```

## Status Akhir

- Branch sudah dipush ke `origin/feat/fase2-p5-ui-persepsi-review`.
- Draft PR sudah dibuat: https://github.com/Wisnu8aji/paax-ai/pull/28
- PR belum di-merge.
- Aturan Emas aman: UI hanya menampilkan hasil pipeline dan menyimpan TKG; tidak menghitung biaya/RAB.
- Fallback manual tetap tersedia di tab `Sumber`.
