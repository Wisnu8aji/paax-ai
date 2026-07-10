# PAAX Master Report Worklog

Tanggal report: 2026-07-08 14:08 WIB  
Branch aktif saat report dibuat: `feat/site-agent-scaffold`  
Status commit: banyak pekerjaan terbaru masih belum commit.

## Inti Besar Pekerjaan

Dalam rentang kemarin sampai hari ini, pekerjaan PAAX bergerak di empat area besar:

1. UI dashboard dikembalikan dan diarahkan supaya memakai Fable / Premium Redesign sebagai tampilan utama.
2. Backend non-UI hasil pekerjaan R2-R14 Saya/Saya diaudit, beberapa bug test diperbaiki, dan service utama dibuat lebih bisa berjalan lokal.
3. Drawing Intelligence diperkuat supaya tidak hanya menampilkan hasil mentah, tetapi memakai AI reasoning di belakang layar.
4. Integrasi NVIDIA API diperbaiki supaya PAAX memakai NVIDIA langsung untuk Lucent, Solace, OCR/layout, OCR backup, dan review gambar kerja.

## Pekerjaan UI Dashboard

Yang dikerjakan:

- Menjadikan UI Fable Premium Redesign sebagai dasar utama dashboard.
- Menghapus pemakaian shell/sidebar lama agar dashboard tidak kembali ke tampilan lama.
- Mengarahkan layout dashboard ke `SideRail` premium.
- Menyesuaikan bentuk utama dashboard mengikuti referensi visual yang diberikan user: area kerja besar, rounded container, gelap di luar, terang di dalam.
- Memperbaiki perilaku sidebar:
  - sidebar tidak ikut scroll,
  - sisi kanan konten yang scroll,
  - sidebar lebih rapat saat tertutup,
  - arah ekspansi sidebar diperbaiki.
- Memperbaiki Command Room:
  - warna chat diselaraskan ke palet biru gelap,
  - border/list putih yang tidak sinkron dihilangkan,
  - tampilan tidak kembali ke dashboard lama.

File utama terkait:

- `apps/web/src/app/(dashboard)/layout.tsx`
- `apps/web/src/components/app-shell/side-rail.tsx`
- `apps/web/src/app/(dashboard)/dashboard/page.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/src/components/app-shell/topbar.tsx`
- `apps/web/src/app/(dashboard)/command-room/`

Catatan penting:

- File sidebar lama sudah ditinggalkan/dihapus dari tracking:
  - `apps/web/src/components/app-shell/icon-rail.tsx`
  - `apps/web/src/components/app-shell/nav-panel.tsx`
  - `apps/web/src/components/app-shell/sidebar.tsx`
- Dokumen prompt UI lama juga dihapus supaya tidak membingungkan agent lain dan tidak menarik dashboard kembali ke UI lama.

## Pekerjaan Drawing Intelligence

Masalah yang ditemukan:

- User ingin AI benar-benar membantu menganalisis gambar kerja, bukan hanya OCR.
- Untuk file `G:\Gambar kerja\GAMBAR KERJA PLHUT SURAKARTA (1).pdf`, sistem membaca 88 halaman.
- File PLHUT tersebut adalah PDF vektor, bukan scan/raster. Artinya NVIDIA OCR tidak dipakai untuk file itu karena teks sudah bisa dibaca langsung dari PDF.
- Masalah asli bukan OCR, tetapi payload review AI terlalu besar sekitar 140 ribu karakter sehingga AI review NVIDIA timeout/fallback lokal.

Yang diperbaiki:

- Payload AI review dipadatkan sebelum dikirim ke NVIDIA.
- Prompt review turun dari sekitar 140 ribu karakter menjadi sekitar 21 ribu karakter.
- Review Drawing Intelligence sekarang benar-benar memakai NVIDIA:
  - `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`
- Timeout NVIDIA review dinaikkan agar proses reasoning panjang tidak cepat digagalkan.
- AI reasoning belakang layar diarahkan agar menjadi otak analisa:
  - membaca hasil PDF/OCR,
  - mengelompokkan data,
  - menjelaskan gambar proyek,
  - mengidentifikasi item pekerjaan,
  - memberi status perlu verifikasi jika data belum cukup,
  - tidak mengarang volume/RAB final.

Hasil uji file PLHUT:

- Halaman: 88
- Span teks vektor: 5.453
- Work item: 42
- Status item:
  - 33 perlu review
  - 9 belum didukung rumus engine
- Provider AI report: NVIDIA
- Model AI report: `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`

Catatan batasan:

- AI sudah membantu analisa dan ringkasan akhir.
- Namun volume RAB final belum boleh dipaksa jika dimensi/grid/takeoff belum lengkap.
- Ini benar sesuai prinsip PAAX: AI boleh membantu memahami, tetapi tidak boleh mengarang angka.

## Pekerjaan NVIDIA API

Masalah sebelumnya:

- Sistem masih punya beberapa fallback Gemini/DeepSeek.
- Beberapa jalur hanya membaca satu `NVIDIA_API_KEY` umum.
- User punya API key berbeda untuk masing-masing model NVIDIA.
- Saat proses lama, backend tampak menggantung karena menunggu NVIDIA dan belum jelas key mana yang dipakai.

Yang dilakukan:

- Membaca file `G:\api.txt`.
- Memasukkan mapping API key ke `G:\paax-ai-main\.env.local`.
- Tidak menampilkan isi API key ke chat/report.
- Menambah dukungan key per model/fungsi.

Mapping sekarang:

- Lucent: `NVIDIA_LUCENT_API_KEY` / `NVIDIA_KIMI_API_KEY`
- Solace: `NVIDIA_SOLACE_API_KEY` / `NVIDIA_DEEPSEEK_API_KEY`
- Drawing fast visual: `NVIDIA_DRAWING_FAST_API_KEY`
- Drawing OCR/layout: `NVIDIA_DRAWING_PARSE_API_KEY`
- Drawing OCR backup: `NVIDIA_DRAWING_OCR_API_KEY` / `NVIDIA_OCR_API_KEY`
- Drawing deep review: `NVIDIA_DRAWING_REVIEW_API_KEY`
- Fallback umum: `NVIDIA_API_KEY`

Perubahan perilaku:

- Command Room:
  - Lucent memakai NVIDIA Kimi.
  - Solace memakai NVIDIA DeepSeek Pro.
- Drawing Intelligence:
  - AI-assist belakang layar memakai NVIDIA, bukan Gemini.
  - Health service sekarang melaporkan provider aktif sebagai `nvidia`.
  - Semua key NVIDIA per fungsi terbaca `true`.
- OCR raster:
  - default sekarang tidak lagi memanggil fast visual tambahan terus menerus.
  - alur default lebih hemat: `nemotron-parse` dulu, kalau gagal baru `nemotron-ocr-v2`.

## Pekerjaan API/Proxy/Auth Lokal

Yang diperbaiki:

- Proxy web untuk Core Engine:
  - `apps/web/src/app/api/core-engine/[...path]/route.ts`
- Proxy web untuk Document Intelligence:
  - `apps/web/src/app/api/document-intelligence/[...path]/route.ts`
- Internal key development:
  - default dev `test-internal-key` agar local proxy tidak terkena `Missing authentication token`.
- Core Engine client diarahkan lewat proxy internal agar dashboard tidak langsung memanggil service backend tanpa auth.

Catatan:

- Jika membuka langsung `http://127.0.0.1:8083/drawings/analyze` tanpa header internal, tetap akan muncul `Missing authentication token`.
- Jalur yang benar dari dashboard adalah lewat:
  - `http://127.0.0.1:3000/api/document-intelligence/...`

## Pekerjaan DB/RAG/Usage/Site Agent

Yang dikerjakan atau diaudit:

- Audit pekerjaan R2-R14 Saya.
- Test DB usage/knowledge/report diperbaiki agar tidak langsung gagal hanya karena PostgreSQL lokal tidak hidup.
- R14 Site Agent tetap dicatat sebagai scaffold, belum integrasi penuh ke DB/core-engine nyata.
- Site Agent service berjalan di port 8085.
- Service DB berjalan di port 8084.
- AI Orchestrator berjalan di port 8082.

Catatan:

- PostgreSQL nyata tetap dibutuhkan untuk mode produksi/DB real.
- Untuk test lokal, beberapa jalur dibuat bisa memakai fallback agar development tidak buntu.

## Server Terakhir yang Berjalan

Saat dicek:

- Web dashboard: port 3000
- Core Engine: port 8081
- AI Orchestrator: port 8082
- Document Intelligence: port 8083
- DB API: port 8084
- Site Agent: port 8085

Document Intelligence health terakhir:

- status: `ok`
- mode: `real_ai`
- providers: `nvidia`
- fast_visual key: true
- ocr_layout key: true
- ocr_backup key: true
- deep_review key: true
- civil_reasoning key: true

## Verifikasi yang Sudah Dijalankan

Verifikasi penting yang berhasil:

- `python -m pytest services/document-intelligence/tests -q`
  - hasil sebelumnya: 293 passed, 5 skipped
- `python -m pytest services/document-intelligence/tests/test_perception_ai_report.py::test_nvidia_ai_assist_client_uses_review_specific_key services/document-intelligence/tests/test_perception_ai_report.py::test_drawing_ai_report_client_uses_review_specific_nvidia_key services/document-intelligence/tests/test_perception_nvidia_vision_extractor.py::test_nvidia_vision_client_uses_model_specific_keys -q`
  - hasil: 3 passed
- `python -m pytest services/document-intelligence/tests/test_perception_nvidia_vision_extractor.py::test_extract_spans_via_nvidia_prefers_parse_then_ocr services/document-intelligence/tests/test_perception_nvidia_vision_extractor.py::test_nvidia_vision_client_uses_model_specific_keys -q`
  - hasil: 2 passed
- `pnpm --filter @paax/web test src/lib/ai/orchestrator.test.ts`
  - hasil: 14 passed

Catatan:

- Ada satu run gabungan backend yang sempat timeout karena test suite berat/real OCR, lalu verifikasi dipecah ke test fokus yang relevan.

## Status Commit

Belum semua pekerjaan terbaru di-commit.

Status `git status --short` saat report dibuat menunjukkan 80 path berubah/belum track.

Commit yang sudah ada sejak 2026-07-07 antara lain:

- `9c9a629` feat: PAAX AI UI Wiring (Engineering Chat Concept)
- `5f2a799` docs: master report audit semua task R2-R14 saya
- `b756203` fix: import Any di drawing_routes + asyncio.run di test_reports (audit)
- `5b5562f` feat(R14): scaffold site-agent service
- `eced3de` feat(R13): multi-versi price book
- `325cfd5` feat: implement R11/R12
- `5244e31` feat: implement Auth & RBAC
- `588dfd4` feat: Deploy & CI/CD Cloud Run
- `3bb7b84` feat: RAG vector store AHSP
- `d7ee3c0` feat(ai-orchestrator): tahap 2
- dan beberapa commit R6/R7/R8/R9/R10 sebelumnya.

Yang belum commit adalah perubahan setelah commit terakhir itu, terutama:

- UI Fable/Premium sebagai baseline utama
- Command Room dan side rail
- proxy API web
- NVIDIA API per-model
- Drawing Intelligence NVIDIA review/OCR parser
- AI-assist NVIDIA
- beberapa test terkait
- report baru ini

## Risiko / Hal yang Masih Perlu Dijaga

- Jangan commit `.env.local` karena berisi API key.
- Jangan tampilkan isi API key ke report/chat.
- Jangan mengembalikan dashboard ke UI lama.
- Jangan menghapus Fable/Premium shell.
- Jangan membuat AI mengarang volume RAB jika data gambar belum cukup.
- Jika akan commit, sebaiknya dipisah beberapa commit logis, bukan satu commit raksasa.

## Rekomendasi Commit Berikutnya

Rekomendasi pemecahan commit:

1. `feat(ui): jadikan fable premium dashboard sebagai shell utama`
2. `feat(api): add local proxies for core and document intelligence`
3. `feat(ai): route command room and extraction to nvidia models`
4. `feat(document-intelligence): add nvidia ocr and drawing review reasoning`
5. `fix(document-intelligence): support local auth and vector-first guard`
6. `test: add coverage for nvidia drawing intelligence flow`
7. `docs: add worklog report 2026-07-07 to 2026-07-08`

Pastikan commit tanpa `Co-Authored-By`.

