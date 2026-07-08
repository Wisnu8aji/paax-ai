# PAAX Detail Teknis Perubahan

Tanggal report: 2026-07-08

Report ini menjelaskan detail teknis pekerjaan terbaru. Bahasa dibuat tetap jelas, tetapi nama file dan fungsi dicantumkan supaya mudah diaudit sebelum commit.

## 1. Frontend Dashboard / Fable Premium

Area yang disentuh:

- `apps/web/src/app/(dashboard)/layout.tsx`
- `apps/web/src/components/app-shell/side-rail.tsx`
- `apps/web/src/app/(dashboard)/dashboard/page.tsx`
- `apps/web/src/app/(dashboard)/command-room/`
- `apps/web/src/app/globals.css`
- `apps/web/src/components/app-shell/topbar.tsx`

Tujuan:

- Mengunci UI utama ke Fable Premium Redesign.
- Mencegah dashboard lama muncul kembali.
- Membuat shell lebih konsisten: side rail tetap, area konten yang scroll.

Perubahan penting:

- Komponen sidebar lama dihapus dari flow.
- `SideRail` baru menjadi basis navigasi.
- Halaman dashboard disesuaikan dengan konsep visual premium.
- Command Room ditambahkan/dirapikan untuk pengalaman chat engineering.
- Styling global diperluas untuk background, panel, animasi, dan layout.

## 2. Drawing Intelligence / TKG Workspace

Area:

- `apps/web/src/components/drawings/tkg-workspace.tsx`
- `apps/web/src/components/drawings/tkg-workspace.test.tsx`
- `apps/web/src/lib/ai/document-intelligence-tkg.ts`
- `apps/web/src/lib/document-intelligence-client.ts`

Tujuan:

- User tidak melihat hasil OCR mentah yang terlalu ramai.
- Hasil Drawing Intelligence diarahkan menjadi review AI yang lebih matang.
- Tombol `Proses RAB` tetap mengikuti hasil validasi/takeoff, bukan memaksa angka.

Perubahan penting:

- Status/progress yang memakan ruang dikurangi dari tampilan utama.
- Tabel hasil diarahkan agar lebih lebar dan informatif.
- Error `Missing authentication token` dipisahkan antara masalah direct backend dan jalur proxy.
- Jalur proxy `/api/document-intelligence` dibuat sebagai jalur benar dari dashboard.

## 3. NVIDIA API di Web

Area:

- `apps/web/src/lib/ai/orchestrator.ts`
- `apps/web/src/app/api/ai/chat/route.ts`
- `apps/web/src/app/api/ai/extract/route.ts`
- `apps/web/src/app/api/ai/tkg/route.ts`
- `apps/web/src/lib/ai/tkg-extractor.ts`
- `apps/web/src/lib/ai/engineering-chat.ts`

Tujuan:

- PAAX memakai NVIDIA API langsung.
- Lucent dan Solace memakai key/model berbeda.
- Extract/TKG tidak diam-diam fallback ke Gemini.

Mapping:

- Lucent -> NVIDIA Kimi
- Solace -> NVIDIA DeepSeek Pro
- Drawing text extraction -> NVIDIA drawing fast model

Perubahan penting:

- `NVIDIA_LUCENT_API_KEY` dipakai untuk Lucent.
- `NVIDIA_SOLACE_API_KEY` dipakai untuk Solace.
- `NVIDIA_DRAWING_FAST_API_KEY` dipakai untuk extraction/TKG.
- `NVIDIA_API_KEY` tetap ada sebagai fallback umum.

## 4. Document Intelligence / NVIDIA OCR dan Review

Area:

- `services/document-intelligence/app/perception/ocr/nvidia_vision_extractor.py`
- `services/document-intelligence/app/perception/ai_report.py`
- `services/document-intelligence/app/perception/ai_assist/client.py`
- `services/document-intelligence/app/api/drawing_routes.py`
- `services/document-intelligence/app/api/health_routes.py`

Tujuan:

- Menjadikan NVIDIA sebagai provider aktif untuk Drawing Intelligence.
- Menambahkan OCR/layout NVIDIA untuk halaman raster.
- Menambahkan AI review/reasoning akhir untuk laporan user.
- Menambahkan AI-assist NVIDIA untuk reasoning tengah.

Detail:

- `nvidia_vision_extractor.py`
  - Menambah client NVIDIA vision/OCR.
  - Mendukung key per model:
    - `NVIDIA_DRAWING_FAST_API_KEY`
    - `NVIDIA_DRAWING_PARSE_API_KEY`
    - `NVIDIA_DRAWING_OCR_API_KEY`
  - Menambahkan parser output `nemotron-parse`.
  - Menambahkan parser output `nemotron-ocr-v2`.
  - Memecah OCR block seperti `K1 300x400` menjadi span terpisah `K1` dan `300x400`.
  - Fast visual tidak lagi dipanggil default agar tidak boros; bisa dinyalakan dengan `NVIDIA_DRAWING_ENABLE_FAST_VISUAL=true`.

- `ai_report.py`
  - Menambah report model untuk Drawing Intelligence.
  - Menambah NVIDIA review client.
  - Timeout NVIDIA review menjadi 1 jam.
  - Payload review dipadatkan agar PDF besar tidak timeout.
  - Key review khusus: `NVIDIA_DRAWING_REVIEW_API_KEY`.

- `ai_assist/client.py`
  - Menambah `NvidiaAiAssistClient`.
  - Drawing route sekarang memilih NVIDIA AI-assist, bukan Gemini.
  - Client ini dipakai untuk reasoning teks di tengah pipeline.

- `health_routes.py`
  - Health sekarang menampilkan `providers: ["nvidia"]`.
  - Health menampilkan status key per fungsi:
    - fast visual
    - OCR layout
    - OCR backup
    - deep review
    - civil reasoning

## 5. Auth dan Proxy Lokal

Area:

- `apps/web/src/app/api/core-engine/[...path]/route.ts`
- `apps/web/src/app/api/document-intelligence/[...path]/route.ts`
- `services/core-engine/app/auth.py`
- `services/document-intelligence/app/auth.py`
- `services/document-intelligence/app/main.py`
- `services/document-intelligence/app/env.py`

Tujuan:

- Dashboard tidak langsung memanggil backend port 8081/8083 tanpa auth.
- Proxy Next.js menambahkan `X-Internal-Key`.
- Development lokal tidak macet karena token Firebase.

Hasil:

- Direct backend tanpa token tetap 401.
- Jalur dashboard via proxy berhasil.
- `Missing authentication token` dihindari jika memakai jalur proxy yang benar.

## 6. DB / RAG / Usage / Site Agent

Area:

- `services/db/src/paax_db/main.py`
- `services/db/src/paax_db/models.py`
- `services/db/tests/conftest.py`
- `services/db/tests/test_knowledge.py`
- `services/db/tests/test_usage.py`
- `services/site-agent/app/main.py`
- `services/site-agent/tests/test_site_agent.py`
- `services/ai-orchestrator/src/*`

Tujuan:

- Mengurangi kegagalan test lokal akibat PostgreSQL tidak hidup.
- Memperjelas status R14 Site Agent sebagai scaffold.
- Menjaga ai-orchestrator tetap bisa test/build setelah audit.

Catatan:

- R14 belum menjadi agent lapangan penuh.
- Integrasi DB/core-engine real masih perlu dilanjutkan.
- Beberapa perubahan berasal dari audit pekerjaan Antigravity R2-R14.

## 7. File Env

File yang disentuh:

- `.env.example`
- `.env.local` tidak masuk commit dan tidak boleh masuk commit.

Yang dilakukan:

- `.env.example` ditambah daftar variabel NVIDIA per model.
- `G:\api.txt` dibaca dan mapping key dimasukkan ke `.env.local`.
- Isi key tidak ditampilkan.

Variabel baru/contoh:

- `NVIDIA_LUCENT_API_KEY`
- `NVIDIA_KIMI_API_KEY`
- `NVIDIA_SOLACE_API_KEY`
- `NVIDIA_DEEPSEEK_API_KEY`
- `NVIDIA_DRAWING_FAST_API_KEY`
- `NVIDIA_DRAWING_PARSE_API_KEY`
- `NVIDIA_DRAWING_OCR_API_KEY`
- `NVIDIA_OCR_API_KEY`
- `NVIDIA_DRAWING_REVIEW_API_KEY`

## 8. Test yang Relevan

Test yang berhasil:

- Web orchestrator:
  - `pnpm --filter @paax/web test src/lib/ai/orchestrator.test.ts`
  - 14 passed

- NVIDIA key per model:
  - `test_nvidia_ai_assist_client_uses_review_specific_key`
  - `test_drawing_ai_report_client_uses_review_specific_nvidia_key`
  - `test_nvidia_vision_client_uses_model_specific_keys`
  - 3 passed

- NVIDIA OCR parser:
  - `test_extract_spans_via_nvidia_prefers_parse_then_ocr`
  - `test_nvidia_vision_client_uses_model_specific_keys`
  - 2 passed

- Document Intelligence full suite sempat berhasil sebelumnya:
  - 293 passed, 5 skipped

Catatan:

- Full gabungan terakhir pernah timeout karena suite berat/real OCR; test fokus yang relevan sudah hijau.

## 9. Hal yang Belum Selesai

- Belum commit.
- Belum push.
- UI dan backend sudah berjalan lokal, tapi perlu commit terpisah agar aman.
- Drawing Intelligence masih perlu fase lanjutan untuk AI reasoning yang lebih dalam:
  - pecah dokumen per halaman/zona,
  - review per batch,
  - gabungkan hasil reasoning,
  - baru tampilkan user-ready report.
- RAB final dari gambar belum boleh otomatis penuh karena data dimensi/grid belum selalu lengkap.

