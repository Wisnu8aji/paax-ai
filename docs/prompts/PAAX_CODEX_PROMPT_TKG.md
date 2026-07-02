# PROMPT CODEX — Sesi TKG (brain v4.1), 2026-07-02

> Salin-tempel per-tugas ke Codex. Konteks repo: baca `AGENTS.md` +
> `docs/ai-map/START_HERE.md` dulu. Semua pekerjaan di bawah adalah
> **tugas ringan/mekanis** — implementasi berat (rumus, model, UI) SUDAH
> dikerjakan Claude dan ada di working tree branch `docs/brain-v4.1-alignment`.

## GUARDRAIL (berlaku untuk SEMUA tugas di file ini)

1. **JANGAN mengubah rumus/logika** di `services/core-engine/app/tkg/`,
   `app/geometry/`, atau angka acuan test. Kalau test merah karena logika,
   STOP dan lapor — jangan "perbaiki" angkanya (Aturan Emas, CLAUDE.md §1).
2. **JANGAN push ke `main` dan JANGAN merge PR.** Branch → PR → tunggu review
   owner + Claude (CLAUDE.md §9).
3. Sebelum tiap commit, WAJIB hijau semua:
   ```
   cd services/core-engine && python -m pytest -q     # harus 126+ passed
   pnpm run test:schemas                               # 11+ passed
   pnpm --filter @paax/schemas build                   # dist rebuild
   pnpm --dir apps/web test                            # vitest hijau
   pnpm --dir apps/web build                           # build sukses
   ```
   (Path toolchain Windows owner: node di `C:\Program Files\nodejs`,
   pnpm shim di `%APPDATA%\npm`.)

---

## TUGAS C1 — Commit & PR pekerjaan TKG (PRIORITAS PERTAMA)

Working tree branch `docs/brain-v4.1-alignment` berisi pekerjaan belum
ter-commit. Buat **3 commit logis** dengan pesan berikut (Conventional
Commits), lalu push branch & buka PR. JANGAN merge.

**Commit 1 — engine TKG:**
```
feat(engine): add TKG module — validator, renderer, deterministic takeoff

TkgDocument models per brain TXT00 §6; validator V-02/V-04/V-05/V-08;
deterministic .tkg.txt renderer; takeoff beton/bekisting/besi per
F-B/F-C01-C06/F-D01-D05 with named params recorded in output
(no silent assumptions). Endpoints /tkg/validate|render|takeoff.
17 anchor tests with manually-computed reference values.
```
File: `services/core-engine/app/tkg/*`, `services/core-engine/app/main.py`,
`services/core-engine/tests/test_tkg.py`.

**Commit 2 — schemas + web:**
```
feat(web): TKG workspace, AI transcription route, grounded chat context

Zod mirror of TkgDocument/TakeoffResult; POST /api/ai/tkg (Gemini
transcribes drawing text to TKG proposal, doc text treated as DATA per
P-SEC-01); TkgWorkspace UI on gambar-kerja (source -> transcript ->
script -> takeoff -> send volumes to RAB draft); engineering chat now
receives project context pack (TKG script + RAB draft) so it reads
structured data instead of re-extracting drawings.
```
File: `packages/schemas/src/index.ts`, `apps/web/src/lib/ai/tkg-extractor.ts`,
`apps/web/src/lib/ai/project-context.ts`, `apps/web/src/lib/ai/engineering-chat.ts`,
`apps/web/src/lib/engine.ts`, `apps/web/src/lib/projects/tkg-repository.ts`,
`apps/web/src/app/api/ai/tkg/route.ts`, `apps/web/src/app/api/ai/chat/route.ts`,
`apps/web/src/components/drawings/tkg-workspace.tsx`,
`apps/web/src/app/(dashboard)/proyek/[projectId]/gambar-kerja/page.tsx`,
`apps/web/src/app/(dashboard)/proyek/[projectId]/chat/page.tsx`.

**Commit 3 — docs:**
```
docs: update MAP/STATE/gambar-kerja/BRAIN_ALIGNMENT for TKG system
```
File: `docs/ai-map/MAP.md`, `docs/ai-map/STATE.md`, `docs/pages/gambar-kerja.md`,
`docs/BRAIN_ALIGNMENT.md`, `docs/prompts/PAAX_CODEX_PROMPT_TKG.md`.

**PR:** judul `feat: TKG system — drawing transcript to takeoff pipeline (brain v4.1)`.
Body: ringkas 3 commit di atas + checklist verifikasi (pytest 126 passed,
schemas 11 passed, web build OK) + catatan "menunggu review owner + Claude".

**Kriteria terima C1:** 3 commit rapi di branch, PR terbuka, TIDAK di-merge,
semua perintah verifikasi guardrail #3 hijau sebelum commit pertama.

---

## TUGAS C2 — Vitest untuk lapisan AI TKG (mekanis)

Tambah test vitest di `apps/web` (ikuti pola test yang sudah ada di
`apps/web/src/**/__tests__` atau `*.test.ts`):

1. `tkg-extractor`: `buildTkgPrompt(text, projectId)` —
   (a) memuat delimiter `<<<DATA_GAMBAR_MULAI>>>` dan `<<<DATA_GAMBAR_SELESAI>>>`;
   (b) teks sumber muncul di antara kedua delimiter;
   (c) memuat instruksi larangan menghitung ("BUKAN menghitung").
2. `engineering-chat`: `buildEngineeringChatPrompt` dengan `projectContext`
   berisi string uji — hasil prompt memuat `<<<KONTEKS_PROYEK_MULAI>>>`,
   isi konteks, dan `<<<KONTEKS_PROYEK_SELESAI>>>`; tanpa `projectContext`,
   delimiter TIDAK muncul.
3. `extractTkgWithProvider` tanpa API key → `{ provider: "manual", tkg: null,
   fallback: true }` (tidak memanggil fetch).

**Kriteria terima:** `pnpm --dir apps/web test` hijau; tidak menyentuh file
non-test kecuali benar-benar perlu export tambahan (kalau perlu, lapor dulu).

---

## TUGAS C3 — requests.http + smoke (mekanis)

Tambahkan contoh request TKG ke `services/core-engine/requests.http`:
`POST /tkg/validate`, `POST /tkg/render`, `POST /tkg/takeoff` dengan body
contoh kecil (grid A-B-C 3000/3500 total 6500, K1 300x400 8D16 D8-150,
params `{"tinggi_per_lantai_m": 3.5}`) — nilai contoh HARUS sama dengan
fixture `buat_tkg()` di `tests/test_tkg.py` supaya hasil bisa dibandingkan
dengan anchor test (K1 beton 1.68 m3, bekisting 19.6 m2, besi ±221.32 kg).

**Kriteria terima:** file requests.http valid; angka contoh identik dengan
fixture test (jangan mengarang variasi baru).
