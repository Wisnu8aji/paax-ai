# PROMPT CODEX — Batch Perbaikan: Hydration, Navigasi Ganda, Chat, Gambar Kerja AI (2026-07-03)

> Sumber: `Downloads/perbaikan.txt` (14 poin ditulis owner setelah mencoba build
> hasil redesign UI premium, branch `feat/ui-premium-redesign`, PR **#26
> draft, belum di-merge**) + investigasi Claude di sesi ini yang menemukan
> root cause persis di kode untuk tiap poin (dikutip file:baris di bawah).
> Owner sudah menjawab pertanyaan arsitektural (lihat Batch 4) — JANGAN
> menebak ulang keputusan itu, ikuti seperti tertulis.
>
> **Semua batch di bawah HANYA presentasi/orkestrasi UI.** Tidak ada satupun
> yang mengubah rumus/angka di `services/core-engine` atau kontrak
> `@paax/schemas`. Aturan Emas (`CLAUDE.md` §1) tetap: engine yang hitung,
> frontend hanya menampilkan/mengurutkan panggilan.
>
> Kerjakan di branch **`feat/ui-premium-redesign`** (SUDAH checked out, PR #26
> sudah ada sebagai draft) — JANGAN buat branch baru untuk batch 1-4, ini
> perbaikan atas kerja yang sama yang belum di-merge. Commit terpisah per
> batch (4 commit kecil), push ke branch yang sama (PR #26 auto-update).
> **JANGAN** ubah status draft→ready, **JANGAN** merge.

## Aturan keras

1. **DILARANG** `git add .` / `git add -A`. Tambahkan file satu per satu.
2. **DILARANG** commit `.claude/`, `skills-lock.json`, `excel_extracted.txt`, `pdf_extracted.txt` (lihat `git status` — ada file liar ini di working tree, JANGAN ikut ter-stage).
3. **DILARANG** merge / mengubah PR #26 dari draft ke ready.
4. **DILARANG** push ke `main`.
5. **DILARANG** menyentuh rumus/angka di `services/core-engine`, atau mengubah signature fungsi di `apps/web/src/lib/engine.ts` (`validateTkg`/`renderTkg`/`takeoffTkg`) — batch ini murni presentasi.
6. Jika guardrail merah → STOP, tulis laporan, jangan commit.

## Toolchain (PATH non-interaktif — mesin Windows ini)

```powershell
$env:Path = "C:\Program Files\nodejs;$env:APPDATA\npm;$env:Path"
```

## Guardrail wajib sebelum TIAP commit

```powershell
cd apps/web
pnpm exec tsc --noEmit -p tsconfig.json
pnpm test
pnpm build
```

---

## BATCH 1 — Fix Recoverable Error: Hydration mismatch di Dashboard

**Root cause pasti** (bukan dugaan): `apps/web/src/lib/projects/projects-context.tsx:23`

```ts
const [projects, setProjects] = useState<Project[]>(() => projectRepository.cachedList());
```

`cachedList()` (`apps/web/src/lib/projects/project-repository.ts:119-121`) memanggil
`readLocalProjects()` → `LocalStorage.get(...)` yang membaca `window.localStorage`
**langsung di badan komponen, saat render pertama.** Di server, `window` tidak
ada → hasil `[]`. Di client (render pertama untuk hydration), `window` ADA →
membaca localStorage ASLI (proyek nyata yang sudah tersimpan). Dua hasil
render pertama berbeda → persis pesan error yang owner temukan ("External
changing data without sending a snapshot of it along with the HTML"),
muncul lewat teks `sub` di `KpiCard` (`apps/web/src/app/(dashboard)/dashboard/page.tsx:109`,
dipanggil dari KPI "Nilai Portfolio RAB" baris 162-168 dst).

**Fix:**
1. Di `ProjectsProvider` (`projects-context.tsx`):
   - Ubah initial state jadi `useState<Project[]>([])` (array kosong statis, SAMA persis dengan yang di-render server).
   - `loading` harus `true` di render pertama untuk backend `localStorage` juga (sekarang `useState(backend === 'firestore')` — jadi `false` untuk localStorage, itu bagian dari masalah).
   - Tambah `useEffect` (jalan sekali saat mount, HANYA di client, SETELAH hydration selesai) yang memanggil `projectRepository.cachedList()` atau `.list()`, lalu `setProjects(...)` + `setLoading(false)`. Boleh gabung dengan `useEffect` yang sudah ada di baris 39-41 (yang sekarang cuma jalan utk backend firestore) — jadikan satu efek yang menangani kedua backend.
2. **Audit cepat**: grep `useState(() =>` yang memanggil `LocalStorage.get`/`cachedList`/pembacaan `window.localStorage` langsung di initializer, di file lain (`rab-repository.ts` dan konteks/provider lain yang belum diperiksa Claude). Sudah dicek AMAN (pola benar, baca lewat `useEffect`/`async`): `tkg-repository.ts`, `lib/chat/chat-history.ts`. Kalau grep menemukan pola sama di file lain, perbaiki dengan pola yang sama seperti poin 1.

**Kriteria terima:** buka `/dashboard` dengan minimal 1 proyek tersimpan di localStorage dari sesi sebelumnya (reload beberapa kali) — TIDAK ADA lagi "Recoverable Error"/warning hydration di console browser. KPI card boleh sempat menampilkan status loading singkat sebelum data tampil — itu wajar, bukan bug.

---

## BATCH 2 — Hilangkan navigasi ganda (halaman proyek)

**Root cause:** ada DUA navigasi untuk modul proyek yang sama persis:
- Sidebar kiri (benar, pertahankan): `apps/web/src/components/app-shell/nav-panel.tsx:39-45` (`projectModules` — Gambar Kerja AI, RAB & BOQ, Schedule & Skenario, Engineering Chat, Site Agent).
- Tab horizontal duplikat (hapus): `apps/web/src/app/(dashboard)/proyek/[projectId]/layout.tsx:24-31` (`projectTabs`) yang di-render sebagai bar horizontal di baris 92-119.

**Fix:**
1. Hapus blok `<div>{projectTabs.map(...)}</div>` (baris 92-119) dari `layout.tsx`.
2. Hapus array `projectTabs` (baris 24-31) dan import icon yang jadi tidak terpakai (`LayoutDashboard`, `FileImage`, `Calculator`, `CalendarClock`, `MessageSquare`, `HardHat` — cek satu-satu, beberapa mungkin masih dipakai di tempat lain di file yang sama, jangan hapus kalau masih dipakai).
3. **Penting — jangan sampai halaman Overview proyek (`/proyek/[projectId]` sendiri) jadi tidak bisa diakses**: tab horizontal yang dihapus punya entry "Overview" (`href: ''`) yang TIDAK ADA padanannya di `nav-panel.tsx` punya sidebar kiri. Setelah tab dihapus, jadikan nama proyek di header (`layout.tsx`, elemen `<h1>{project.name}</h1>`) atau breadcrumb (`<span>{project.name}</span>` di baris 74) sebagai `<Link href={`/proyek/${projectId}`}>` supaya Overview tetap bisa dituju satu klik. Pilih salah satu (yang paling rapi secara kode), yang penting rute Overview tidak hilang.

**Kriteria terima:** buka proyek apa saja — hanya SATU navigasi terlihat (panel kaca kiri). Overview, Gambar Kerja AI, RAB & BOQ, Schedule, Chat, Site Agent semua tetap bisa dituju. Highlight "active" tetap benar di sidebar kiri utk tiap halaman.

---

## BATCH 3 — Engineering Chat: label, filter Pinned/Archived, diagnosis riwayat hilang

File utama: `apps/web/src/lib/chat/chat-history.ts`,
`apps/web/src/app/(dashboard)/proyek/[projectId]/chat/page.tsx`.

### 3a. Ganti label "Lainnya" → "Chat"
`page.tsx:417-421` — section header di atas daftar percakapan yang tidak
masuk folder mana pun, teksnya `Lainnya`. Ganti jadi `Chat` (permintaan
persis owner: "jangan tulis lainnya tapi tulis chat").

### 3b. Filter All / Pinned / Archived (belum ada sama sekali)
1. `chat-history.ts` — tambah field ke `ChatConversation` (baris 18-26):
   `pinned: boolean` dan `archived: boolean`, default `false` di `createConversation` (baris 83-98).
2. Tambah fungsi `togglePinned(id: string): void` dan `toggleArchived(id: string): void`,
   pola sama seperti `moveConversation` (baris 115-122): `load()` → cari
   conversation → update field → `save(state)`.
3. UI (`page.tsx`): tambah kontrol filter kecil (ikon + dropdown 3 pilihan:
   **Semua** / **Pinned** / **Diarsipkan**) di atas daftar percakapan (area
   sekitar baris 322-344, dekat tombol buat-folder/percakapan-baru). Pola
   buka/tutup dropdown: contek PERSIS pola yang sudah ada untuk menu "+"
   lampiran (`plusOpen` state baris 118 + effect klik-di-luar baris 167-174)
   — buat state baru (mis. `filterMode`, `filterOpen`) dengan pola sama biar
   konsisten. Ini yang dimaksud owner "ada ikon yang bisa diklik... bisa
   ditutup buka".
4. Tambah tombol pin/archive kecil di tiap baris percakapan (`conversationRow`,
   baris 279-314) — sebelah tombol hapus (`Trash2`, baris 302-312) yang
   sudah ada, pola `onClick` + `stopPropagation` yang sama.
5. Filter daftar (`looseConversations` baris 277, dan yang di-render per
   folder baris 369-415) sesuai `filterMode` sebelum di-render. Default
   `filterMode = 'all'`. Archived HANYA tampil saat filter = Diarsipkan
   (tersembunyi dari "Semua" — supaya archive terasa seperti "menyingkirkan").
   State filter tidak perlu ikut persist ke localStorage (cukup di React
   state, reset ke "Semua" tiap reload — sederhana, tidak diminta persist).

**Kriteria terima:** pin 1 percakapan → tetap muncul di "Semua", muncul juga
di filter "Pinned". Arsipkan 1 percakapan → hilang dari "Semua", hanya
muncul di filter "Diarsipkan". Label "Lainnya" sudah jadi "Chat" di semua
tempat.

### 3c. Diagnosis "chat hilang saat stop lalu jalankan ulang"
Claude SUDAH memverifikasi kode `chat-history.ts` **tidak** punya bug
hydration/race-condition (pola `load()`-nya sudah benar: guard `typeof window
=== 'undefined'` baris 44, dipanggil hanya dari `useEffect`/event handler,
bukan dari initializer render). `clearAllPaaxData()` (`local-storage.ts:68-74`)
memang ada tapi **tidak pernah dipanggil di manapun** (sudah digrep, dead
code) — jadi bukan itu penyebabnya.

**Hipotesis utama:** localStorage terikat per-origin (protocol+host+**port**).
`apps/web/package.json` `dev` script SUDAH fix `--port 3000`, TAPI kalau ada
proses `next dev` sebelumnya yang tidak benar-benar mati (umum di Windows:
menutup jendela terminal tidak selalu mematikan proses node anak-nya), port
3000 masih terpakai proses lama → Next.js auto-pindah ke 3001/3002 diam-diam
→ browser melihat origin BEDA → localStorage terlihat "kosong" padahal data
lama masih ada di origin/port sebelumnya (tidak hilang, cuma "tidak
kelihatan").

**Tugas (investigasi dulu, JANGAN asal fix):**
1. Jalankan `pnpm dev`, catat port yang benar-benar dipakai (lihat log
   terminal — Next.js mencetak port asli kalau fallback terjadi, mis.
   "Port 3000 is in use, using port 3001 instead").
2. Stop (Ctrl+C), cek apakah proses node/next masih hidup: PowerShell
   `Get-Process node -ErrorAction SilentlyContinue`. Kalau masih ada padahal
   terminal sudah ditutup/Ctrl+C — itu konfirmasi hipotesis.
3. Kalau terkonfirmasi: laporkan ke owner sebagai temuan (bukan bug kode,
   tapi kebiasaan menjalankan dev server) — sarankan selalu pastikan proses
   lama mati (`Get-Process node | Stop-Process`) sebelum `pnpm dev` lagi,
   ATAU tambahkan catatan di README/CLAUDE.md dev-workflow.
4. Kalau TIDAK terkonfirmasi (port selalu 3000 konsisten, proses selalu
   mati bersih) — cari kemungkinan lain: apakah owner menguji di jendela
   Incognito/Private (localStorage per-sesi, hilang saat browser ditutup)?
   Tulis pertanyaan balik ke owner di laporan kalau tidak ketemu penyebab
   pasti — JANGAN menebak-nebak fix tanpa bisa mereproduksi.

**Kriteria terima:** laporan jelas: penyebab terkonfirmasi APA, dan langkah
yang diambil (fix kode kalau ternyata memang bug, atau rekomendasi kebiasaan
kalau ternyata bukan bug kode).

---

## BATCH 4 — Gambar Kerja AI: satu halaman, sembunyikan proses internal AI, upload nyata

> Owner sudah memutuskan (lewat tanya-jawab sesi ini, JANGAN tanya ulang):
> - Transkrip TKG, skrip `.tkg.txt`, tabel takeoff mentah, dan kotak "tempel
>   JSON manual" **TIDAK BOLEH ada di UI sama sekali**. User hanya boleh
>   melihat: status ringkas proses AI, item yang butuh review manusia
>   (Triage — TETAP tampil, ini beda dari data mentah TKG), dan tombol kirim
>   ke RAB. Proses TKG→transkrip→skrip→takeoff terjadi di belakang layar.
> - **TIDAK** membangun AI vision/CV yang benar-benar "melihat" file gambar
>   di batch ini (itu computer-vision beneran = `services/document-intelligence`,
>   sudah digerbang eksplisit sebagai DITUNDA di `docs/BRAIN_ALIGNMENT.md`
>   baris "Ditunda | services/document-intelligence (OCR/CV/vision), TKG
>   builder sungguhan | menunggu gerbang F0 + validasi Wizard-of-Oz" —
>   keputusan itu dibuat sadar 2026-07-02, JANGAN dibalik diam-diam di batch
>   perbaikan UI ini). Jalur AI-baca-gambar sungguhan sudah dipisah jadi
>   prompt lain: `docs/prompts/PAAX_CODEX_PROMPT_AI_MULTIMODAL_LAMPIRAN_2026-07-03.md`
>   (JANGAN kerjakan itu di sini, itu menunggu keputusan terpisah owner).
>   Input TKG untuk sekarang TETAP lewat teks yang diketik/ditempel user
>   (satu-satunya jalur AI yang sudah berfungsi hari ini) — hanya
>   TAMPILANNYA yang disederhanakan di batch ini.

### 4a. Satu halaman (poin 12)
Sekarang ada 2 halaman terpisah untuk "hal yang sama":
- `apps/web/src/app/(dashboard)/proyek/[projectId]/gambar-kerja/page.tsx` —
  halaman proyek SUNGGUHAN, sudah render `<TkgWorkspace>` (baris 24).
- `apps/web/src/app/(dashboard)/gambar-kerja-ai/page.tsx` — halaman global,
  TANPA konteks proyek, TANPA TkgWorkspace, isinya mock/demo statis.
  Dihubungkan lewat kartu "Buka workspace analisis gambar AI lengkap"
  (`gambar-kerja/page.tsx:58-65`) yang justru membawa user KELUAR dari
  workspace asli ke halaman demo yang lebih kosong — inilah "2 halaman
  terpisah" yang dikeluhkan.

**Fix:**
1. Hapus blok `<Link href="/gambar-kerja-ai">...Buka workspace analisis
   gambar AI lengkap...</Link>` (`gambar-kerja/page.tsx:58-65`) — halaman
   proyek SUDAH lengkap, tidak perlu "buka versi lengkap" lagi.
2. `nav-panel.tsx:40` — modul "Gambar Kerja AI" punya `gateway:
   '/gambar-kerja-ai'` (dipakai kalau belum ada proyek aktif — pola yang
   sama dipakai modul lain, lihat baris 41-44 yang gateway-nya `/proyek`).
   Ubah gateway "Gambar Kerja AI" jadi `/proyek` juga (SAMA seperti modul
   lain) — supaya user diarahkan "pilih/buat proyek dulu" alih-alih melihat
   halaman demo terpisah.
3. Halaman `gambar-kerja-ai/page.tsx` (global) jadi tidak lagi punya jalan
   masuk dari navigasi manapun setelah langkah 2 — hapus route ini
   (`apps/web/src/app/(dashboard)/gambar-kerja-ai/page.tsx`) sepenuhnya.
   Cek dulu tidak ada `Link`/`router.push('/gambar-kerja-ai')` lain yang
   akan jadi broken link (grep `gambar-kerja-ai` di seluruh `apps/web/src`)
   sebelum menghapus — kalau ada pemakaian lain, laporkan dan putuskan
   kasus per kasus, jangan hapus buta.

**Kriteria terima:** hanya ADA SATU halaman "Gambar Kerja AI" per proyek,
diakses lewat sidebar kiri. Tidak ada lagi kartu/link yang membawa ke
halaman demo terpisah. `pnpm build` tidak menunjukkan route
`/gambar-kerja-ai` lagi (mirip cara verifikasi `/rab-tester` hilang di
redesign sebelumnya).

### 4b. Sederhanakan tampilan TkgWorkspace — sembunyikan proses internal
File: `apps/web/src/components/drawings/tkg-workspace.tsx` (513 baris,
komponen `TkgWorkspace`). **Ini restrukturisasi tampilan, BUKAN logika** —
semua pemanggilan `renderTkg`/`validateTkg`/`takeoffTkg` dari
`@/lib/engine` (baris 18) TETAP dipakai apa adanya, hanya diorkestrasi
berbeda dan ditampilkan lebih sedikit.

1. **Hapus dari tampilan default** (jangan hapus logikanya, cukup jangan
   dirender ke user):
   - Textarea "Fallback manual — tempel JSON TkgDocument langsung" + tombol
     "Muat TKG Manual" (baris 250-260, fungsi `loadManual` baris 104-117).
     Kalau ingin tetap ada sebagai alat debug SENDIRI (bukan untuk user),
     boleh dipindah ke halaman/route terpisah yang tidak dipromosikan di
     navigasi manapun — TAPI default: hapus saja dari halaman ini, sesuai
     instruksi owner ("tidak ada di UI").
   - Switcher 4-tab yang sekarang terlihat user (`Tab` type baris 24, array
     `tabs` baris 179-184, render tombol tab baris 211-221): jangan lagi
     jadi navigasi yang diklik user. Tabel elemen/grid/level mentah di tab
     "Transkrip" (baris 298-368), teks mentah skrip `.tkg.txt` di tab
     "Skrip" (baris 373-383), dan tabel rumus/formula + BBS mentah di tab
     "Takeoff" (baris 421-503) — SEMUA ini tidak lagi jadi tampilan utama.
2. **Alur baru (linear, otomatis):**
   - Input tetap: textarea "Teks/deskripsi gambar kerja" (baris 240-248) +
     tombol "Transkrip dengan AI" (`runAiExtract`, baris 83-102) — SATU-
     SATUNYA cara masuk data untuk sekarang.
   - Setelah `saveTkg` berhasil (TKG tersimpan): jalankan otomatis berturutan
     `runValidate` → `runRender` → `runTakeoff` (gabungkan jadi satu alur/
     satu fungsi baru, bisa dipanggil otomatis setelah AI extract sukses,
     ATAU lewat satu tombol "Proses" — pilih yang lebih rapi secara kode).
     User tidak perlu klik 3 tombol terpisah di 3 tab terpisah lagi.
   - Tampilkan HANYA: (a) status ringkas hasil proses dalam bahasa awam,
     contoh "AI menemukan {N} elemen dari {M} tabel — siap ditinjau" (hitung
     dari `tkg.sheets` yang sudah ada di `record.tkg`, JANGAN hitung ulang
     apapun, murni `.length` dari data yang sudah ada), (b) `<TriagePanel>`
     yang SUDAH ADA (baris 415-420) — komponen ini SUDAH tepat untuk user
     (bahasa awam, alasan per item, tombol "Hitung Ulang"/"Abaikan") —
     PERTAHANKAN APA ADANYA, jangan diubah, (c) tombol "Kirim Volume ke
     Draft RAB" yang sudah ada (`sendToRab`, baris 403-406) dengan syarat
     yang sama seperti sekarang (`!it.needs_review`).
   - Ganti judul komponen dari "Transkrip Kanonik Gambar (TKG)" (baris 204,
     istilah internal) jadi judul yang masuk akal untuk user awam, mis.
     "Analisis Gambar AI" atau "Baca Gambar Kerja" — pilih yang paling pas
     dengan copy sekitarnya, tidak perlu menyebut singkatan "TKG" ke user.
3. **Simpan hasil takeoff juga (celah yang ditemukan Claude, bagian dari
   poin 6 owner — "harus disimpan dimana"):** sekarang `takeoff`
   (`TakeoffResult`, baris 47) cuma `useState` biasa, TIDAK pernah disimpan
   ke `tkgRepository` — hilang tiap kali user pindah halaman lalu balik
   lagi, harus hitung ulang. Tambah field opsional ke `ProjectTkgRecord`
   (`apps/web/src/lib/projects/tkg-repository.ts:20-29`): `lastTakeoff:
   TakeoffResult | null` (tipe sudah ada, import dari `@paax/schemas`, TIDAK
   perlu ubah `packages/schemas` — ini murni tipe penyimpanan sisi web).
   Simpan di `runTakeoff` (tkg-workspace.tsx baris 141-149) bersamaan dengan
   hasil lain, dan muat balik saat komponen mount (`useEffect` baris 49-58)
   supaya status/Triage tetap ada tanpa hitung ulang tiap kali user
   membuka halaman.

**Kriteria terima:** buka halaman Gambar Kerja AI proyek — yang terlihat
HANYA: kotak input teks + tombol proses, status ringkas hasil, panel Triage
(kalau ada item perlu review), tombol kirim ke RAB. Tidak ada tab/JSON/skrip
mentah/tabel rumus yang terlihat user. Refresh halaman setelah proses
selesai — status & Triage tetap ada (tidak perlu proses ulang).

### 4c. Upload nyata (poin 11) — simpan file, BUKAN baca AI
Sekarang tombol "Pilih File" di drawer Unggah (`apps/web/src/components/app-shell/overlays.tsx:46-66`)
murni dekoratif — TIDAK ADA `<input type="file">`, tidak ada handler apapun
(baris 65 bahkan menulis jujur: "unggahan belum tersambung ke backend").

1. Tambah `<input type="file" multiple accept="application/pdf,.dwg,image/*,.xlsx,.xls">`
   tersembunyi + trigger dari tombol "Pilih File" (pola persis seperti yang
   SUDAH BENAR di `chat/page.tsx:557-568` — contek pola itu). Tambah juga
   `onDrop`/`onDragOver` di kotak dashed area (baris 47-59) supaya
   drag-and-drop juga berfungsi.
2. Buat `apps/web/src/lib/projects/drawings-repository.ts` baru, pola PERSIS
   sama seperti `tkg-repository.ts` (localStorage key per-proyek via
   `projectStorageKey`, atau Firestore kalau `getProjectBackend() ===
   'firestore'`). Simpan metadata: `{ id, projectId, name, mimeType,
   sizeBytes, uploadedAt }`. **Lingkup sengaja dibatasi**: untuk file kecil
   boleh simpan `dataURL`/base64 di localStorage (dipakai lagi nanti kalau
   prompt AI-multimodal terpisah disetujui); untuk file besar cukup metadata
   + `URL.createObjectURL` sebagai preview sesi-berjalan saja. JANGAN
   membangun storage cloud/Firebase Storage sungguhan di batch ini — itu di
   luar lingkup perbaikan UI.
3. Sambungkan daftar "Gambar Proyek" di `proyek/[projectId]/gambar-kerja/page.tsx`
   (baris 32-56) supaya baca dari `drawingsRepository` yang baru, bukan
   `drawings`/`drawingSummary` hardcoded dari `lib/mock/workspace.ts`
   (baris 9, dipakai baris 27-29 & 40-54). Upload lewat drawer harus muncul
   di daftar ini setelah selesai.

**Kriteria terima:** klik "Pilih File" (atau drag file) di halaman Gambar
Kerja AI proyek → file beneran terpilih → muncul di daftar "Gambar Proyek"
dengan nama & ukuran asli → tetap ada setelah reload halaman. (AI belum
membaca isi file ini — itu memang bukan lingkup batch ini.)

---

## Setelah semua batch selesai

Sertakan `docs/prompts/PAAX_CODEX_PROMPT_PERBAIKAN_UI_BATCH_2026-07-03.md`
(file ini sendiri) dan `docs/ai-map/STATE.md` (sudah diupdate Claude dengan
ringkasan batch ini) di salah satu commit — keduanya sudah ada di working
tree, tinggal `git add` seperti file lain. **Jangan** ikut stage
`excel_extracted.txt`/`pdf_extracted.txt` (file liar tak terkait, sudah ada
sebelum sesi ini, biarkan untracked).

Tulis laporan ringkas (ke `report/` atau langsung di pesan akhir ke owner —
ikuti kebiasaan sesi Codex sebelumnya) berisi:
- 4 batch, status masing-masing (selesai/terlewat/blocked), SHA commit tiap batch.
- Hasil guardrail terakhir (tsc/test/build) — harus hijau semua sebelum berhenti.
- Batch 3c: kesimpulan diagnosis "chat hilang" — penyebab pasti atau belum ketemu.
- Batch 4a: konfirmasi tidak ada broken link ke `/gambar-kerja-ai` yang terlewat.
- Link PR #26 (branch sama, sudah ada) — TETAP draft, TIDAK di-merge.
