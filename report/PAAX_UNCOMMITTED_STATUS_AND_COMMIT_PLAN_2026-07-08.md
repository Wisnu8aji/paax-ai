# PAAX Uncommitted Status and Commit Plan

Tanggal: 2026-07-08  
Branch aktif: `feat/site-agent-scaffold`  
Status: belum commit.

## Ringkasan Git

Saat report dibuat:

- `git status --short` menunjukkan 80 path berubah/belum track.
- `git diff --stat` menunjukkan 66 tracked files berubah.
- Perubahan tracked: 2.447 insertions, 2.372 deletions.
- Ada beberapa file/folder baru untracked.

## File / Folder Baru Penting

Untracked penting:

- `apps/web/src/app/(dashboard)/command-room/`
- `apps/web/src/app/api/core-engine/`
- `apps/web/src/app/api/document-intelligence/`
- `apps/web/src/components/app-shell/side-rail.tsx`
- `docs/plans/PAAX_UI_UTAMA_FABLE_PREMIUM_2026-07-07.md`
- `docs/prompts/PAAX_SAYA_PROMPT_SAYA_WIRING_UI_TANPA_REDESIGN_2026-07-07.md`
- `docs/superpowers/plans/2026-07-08-nvidia-drawing-vision-ocr-plan.md`
- `services/db/tests/conftest.py`
- `services/document-intelligence/app/env.py`
- `services/document-intelligence/app/perception/ai_report.py`
- `services/document-intelligence/app/perception/ocr/nvidia_vision_extractor.py`
- `services/document-intelligence/tests/test_perception_ai_report.py`
- `services/document-intelligence/tests/test_perception_nvidia_vision_extractor.py`

## File Lama yang Dihapus dari Working Tree

File lama yang sudah berstatus deleted:

- `apps/web/src/components/app-shell/icon-rail.tsx`
- `apps/web/src/components/app-shell/nav-panel.tsx`
- `apps/web/src/components/app-shell/sidebar.tsx`
- `docs/plans/PAAX_SAYA_PLAN_UI_WIRING_saya.md`
- `docs/prompts/PAAX_SAYA_PROMPT_PERBAIKAN_UI_BATCH_2026-07-03.md`
- `docs/prompts/PAAX_SAYA_PROMPT_UI_OVERHAUL.md`
- `docs/prompts/PAAX_SAYA_PROMPT_UI_PREMIUM_REDESIGN.md`
- `docs/superpowers/plans/2026-06-25-paax-workspace-redesign.md`
- `docs/superpowers/specs/2026-06-25-paax-workspace-redesign-design.md`

Alasan umum:

- Mengurangi kebingungan prompt/UI lama.
- Menjaga Fable Premium Redesign sebagai sumber utama.
- Menghindari agent lain memakai layout lama.

## Daftar Area Perubahan

### UI / Dashboard

- `apps/web/src/app/(dashboard)/dashboard/page.tsx`
- `apps/web/src/app/(dashboard)/layout.tsx`
- `apps/web/src/app/(dashboard)/proyek/page.tsx`
- `apps/web/src/app/(dashboard)/proyek/[projectId]/page.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/src/components/app-shell/topbar.tsx`
- `apps/web/src/components/charts/dashboard-charts.tsx`
- `apps/web/src/components/theme/theme-provider.tsx`

### Command Room / AI Web

- `apps/web/src/app/(dashboard)/command-room/`
- `apps/web/src/app/api/ai/chat/route.ts`
- `apps/web/src/lib/ai/engineering-chat.ts`
- `apps/web/src/lib/ai/orchestrator.ts`
- `apps/web/src/lib/ai/orchestrator.test.ts`

### Drawing Intelligence Web

- `apps/web/src/components/drawings/tkg-workspace.tsx`
- `apps/web/src/components/drawings/tkg-workspace.test.tsx`
- `apps/web/src/lib/ai/document-intelligence-tkg.ts`
- `apps/web/src/lib/document-intelligence-client.ts`
- `apps/web/src/app/api/document-intelligence/`

### Core/API Proxy

- `apps/web/src/app/api/core-engine/`
- `apps/web/src/lib/core-engine-client.ts`
- `services/core-engine/app/auth.py`

### Document Intelligence Backend

- `services/document-intelligence/app/api/drawing_routes.py`
- `services/document-intelligence/app/api/health_routes.py`
- `services/document-intelligence/app/auth.py`
- `services/document-intelligence/app/main.py`
- `services/document-intelligence/app/env.py`
- `services/document-intelligence/app/perception/assemble.py`
- `services/document-intelligence/app/perception/ai_assist/client.py`
- `services/document-intelligence/app/perception/ai_report.py`
- `services/document-intelligence/app/perception/ocr/nvidia_vision_extractor.py`

### DB / AI Orchestrator / Site Agent

- `services/db/src/paax_db/main.py`
- `services/db/src/paax_db/models.py`
- `services/db/tests/conftest.py`
- `services/db/tests/test_knowledge.py`
- `services/db/tests/test_usage.py`
- `services/ai-orchestrator/src/*`
- `services/site-agent/app/main.py`
- `services/site-agent/tests/test_site_agent.py`

## Rekomendasi Urutan Commit

Jangan commit `.env.local`.

Commit 1:

```text
feat(ui): jadikan fable premium dashboard sebagai shell utama
```

Isi:

- layout dashboard
- side rail
- topbar
- CSS global
- penghapusan sidebar lama
- dokumen UI kanonik Fable

Commit 2:

```text
feat(api): add local service proxies for dashboard
```

Isi:

- `/api/core-engine`
- `/api/document-intelligence`
- core/document auth dev internal key
- client URL proxy

Commit 3:

```text
feat(ai): route command room to nvidia model keys
```

Isi:

- chat route
- orchestrator NVIDIA key/model selection
- Lucent/Solace mapping
- tests orchestrator

Commit 4:

```text
feat(document-intelligence): add nvidia drawing reasoning and ocr
```

Isi:

- NVIDIA OCR client
- NVIDIA AI report
- NVIDIA AI assist
- health NVIDIA-only
- Drawing routes memakai NVIDIA AI assist

Commit 5:

```text
test(document-intelligence): cover nvidia drawing intelligence flow
```

Isi:

- test AI report
- test NVIDIA OCR parser
- test route updates jika relevan

Commit 6:

```text
fix(db-site-agent): stabilize local tests and scaffold endpoints
```

Isi:

- DB fallback/local tests
- site-agent tests
- ai-orchestrator small fixes

Commit 7:

```text
docs(report): add worklog and uncommitted status reports
```

Isi:

- report baru ini
- master report
- detail teknis report

## Catatan Commit

- Jangan pakai `Co-Authored-By`.
- Jangan commit secret/API key.
- Jangan force-push kecuali user minta jelas.
- Sebelum commit final, jalankan minimal:
  - `pnpm --filter @paax/web test src/lib/ai/orchestrator.test.ts`
  - test fokus Document Intelligence NVIDIA
  - health check 8083 jika server hidup

## Status yang Perlu Diketahui User

Pekerjaan belum commit bukan berarti hilang. Semua perubahan masih ada di working tree lokal. Namun karena belum commit, perubahan ini rentan tertimpa kalau ada checkout/reset/merge sembarangan.

Saran saya: commit dipisah sesuai area di atas agar lebih aman dan mudah rollback.

