# PAAX — Spesifikasi Design System untuk Redesign Visual (2026-07-05)

> Ditulis Saya, 2026-07-05. **Dokumen ini murni rencana/spesifikasi
> desain — TIDAK ADA kode yang diubah.** Dimaksudkan sbg referensi teknis
> mendalam utk eksekusi nanti (owner + model "Fable 5"). Companion dari
> `docs/plans/PAAX_FRONTEND_REDESIGN_MASTER_PLAN_2026-07-05.md` (roadmap
> & urutan tugas — baca file itu utk konteks prioritas keseluruhan).

---

## 1. Audit kondisi visual SEKARANG (dicek langsung ke kode, bukan asumsi)

Sebelum merancang apa pun, ini realita teknis `apps/web` per 2026-07-05:

### 1.1 Stack styling yang SEBENARNYA dipakai (beda dari yang tertulis
di `SAYA.md`!)

`SAYA.md`/`docs/MASTER_PLAN.md` menyebut stack "shadcn/ui" — **tapi
`apps/web/package.json` TIDAK PUNYA satu pun dependency shadcn**
(`@radix-ui/*`, `class-variance-authority`, `tailwind-merge`, `clsx`
semua TIDAK ADA). Realita: 
- **Tailwind CSS v4** (`@import "tailwindcss"` di `globals.css`, config
  CSS-first — TIDAK ADA `tailwind.config.js/ts` terpisah, ini normal utk
  v4).
- **Design token via CSS custom properties** (`--bg`, `--text`,
  `--accent`, `--gold`, dst) didefinisikan di `:root` + override per tema
  via atribut `data-theme` (`light` default, `dark`, `grey`).
- **Komponen kustom buatan sendiri** (BUKAN shadcn) di
  `components/ui/`: `Card`, `Button`, `Badge`, `Modal`, `Drawer`,
  `EmptyState`, `PageHeader`, `ProgressBar`, `StatCard`, `Switch` — semua
  pola SAMA: menerima `style` prop, styling utama lewat **inline style
  object yang membaca CSS variable** (`style={{ background: 'var(--elev)'
  }}`), BUKAN className Tailwind utility.
- **Tidak ada library animasi** (tidak ada Framer Motion/GSAP/dll) —
  animasi SAAT INI murni 4 `@keyframes` CSS (`paxfade`, `paxpulse`,
  `paxbounce`, `paxspin`) + transition inline `.15s` di mana-mana.
- **Chart custom SVG buatan sendiri** (`components/charts/dashboard-
  charts.tsx`: DonutChart/HBarList/ColumnChart/RingGauge,
  `components/rab/s-curve-chart.tsx`) — TIDAK ADA library chart
  (recharts/visx/d3/nivo).
- Font: **Inter** (teks), **Outfit** (display/heading), **JetBrains
  Mono** (angka tabular) — via `next/font`, sudah cukup modern/premium.

### 1.2 Sistem tema yang SUDAH ADA (jangan dibuang, evaluasi dulu)

3 tema aktif via `data-theme`: `light` (default, warm grey-cream
`#ECEBE6`), `dark` (`#1D1D22`), `grey` ("Medium Grey Glass" — `#A6A6AA`,
glassmorphism `.pax-glass`/`.pax-glass-edge` dgn border gradasi kaca+
bronze, dipilih via swatch di Pengaturan → Personalisasi). Aksen brand
bronze/gold (`--gold: #8A6D3F` light / `#C9A66B` dark) dipakai konsisten
di warning state, chart seri 1, border glass.

**Ini pekerjaan desain yang SUDAH dilakukan & diverifikasi berjalan di
browser (sesi 2026-07-03)** — redesign berikutnya HARUS memutuskan
sadar: evolusi dari sistem ini, atau ganti total. §2 di bawah membahas
pilihan ini.

### 1.3 Kelemahan konkret yang ditemukan (bukan cuma kesan, dicek ke kode)

- **Tidak ada skala tipografi formal** — ukuran font ad-hoc granular
  (`11.5px`, `12.5px` ditemukan literal di beberapa file) menandakan
  tweak manual per komponen, bukan skala konsisten.
- **Tidak ada skala spacing formal** — padding/gap pakai angka ad-hoc
  (`14`, `18`, `10`, `8`) yang KEBETULAN kelipatan 2, tapi tidak
  didokumentasikan sbg skala resmi.
- **Tidak ada skeleton/loading state** — halaman yang menunggu data
  (mis. dashboard, RAB) langsung render `EmptyState` atau kosong, TIDAK
  ADA placeholder shimmer/skeleton saat data sedang dimuat — ini relevan
  krn riset 2026 soal load-time-perception (§0 prompt owner) menyorot ini
  spesifik.
- **Animasi minim & tidak terorkestrasi** — `KpiCard` di dashboard sudah
  punya prop `delay` (utk stagger fade-in manual via `animationDelay`
  inline), tapi ini pola manual per komponen, bukan sistem animasi
  reusable.
- **Tidak ada transisi antar halaman** — navigasi Next.js App Router
  langsung ganti konten tanpa animasi masuk/keluar.

---

## 2. Keputusan arsitektur: EVOLUSI vs GANTI TOTAL

**Rekomendasi Saya: EVOLUSI, bukan ganti total.** Alasan:
- Sistem token CSS variable + multi-tema SUDAH bekerja, sudah
  diverifikasi di browser, dan MENDUKUNG rombakan visual besar (ganti
  warna = ganti nilai variable, TIDAK perlu ubah struktur komponen).
  Mengganti ke shadcn/ui berarti menulis ulang SEMUA komponen (`Card`,
  `Button`, dll + puluhan halaman yang memakainya) — risiko regresi
  besar utk manfaat yang tidak jelas (komponen kustom yang ada sudah
  cukup dgn kebutuhan aplikasi ini, TIDAK butuh keluasan shadcn spt
  dialog kompleks/command palette/dll KECUALI direncanakan spesifik).
- **TAPI** — dokumentasi (`SAYA.md`/`MASTER_PLAN.md`) yang menyebut
  "shadcn/ui" perlu diperbarui supaya cocok realita (tugas dokumentasi
  kecil, catat di master plan §3).
- **Satu penambahan dependency yang DIREKOMENDASIKAN**: **Framer Motion**
  (`framer-motion`, atau paket penerusnya `motion` — CEK versi terbaru
  saat eksekusi, package ini kadang rebrand). Alasan: satu-satunya gap
  KONKRET yang tidak bisa dipenuhi CSS keyframes biasa dgn rapi adalah
  animasi ORKESTRASI (stagger list, shared layout transition modal/
  drawer, gesture-based interaction, animasi keluar/masuk yang di-cancel
  dgn benar saat komponen unmount cepat). Ini price-performance yang
  wajar utk SATU dependency baru (ringan, standar industri React,
  TIDAK bentrok dgn arsitektur CSS-variable yang ada — Framer Motion
  BEBAS dipakai berdampingan dgn `var(--token)` di style prop).
- **Opsional, prioritas rendah**: `clsx`/`tailwind-merge` kalau nanti
  className mulai kompleks (percabangan kondisional banyak) — TIDAK
  mendesak sekarang krn pola inline-style saat ini masih cukup rapi.

---

## 3. Palet warna — 3 ARAH pilihan (BELUM diputuskan, perlu keputusan
owner/Fable 5 sebelum eksekusi — lihat §7 checklist)

Ketiganya kompatibel dgn arsitektur token yang ada (tinggal ganti NILAI
variable, bukan strukturnya). Semua tetap sediakan varian light/dark.

### Arah A — "Blueprint Precision" (REKOMENDASI UTAMA Saya)
**Mood**: presisi teknis, kepercayaan, referensi literal ke gambar kerja
teknik sipil (cetak biru/blueprint) — cocok krn PRODUK INI SECARA HARFIAH
tentang membaca gambar kerja.
- Base: nearly-white dingin (`#F7F8FA`) / graphite gelap (`#14171F` utk
  dark).
- Aksen utama: **biru cetak-biru dalam** (`#1E3A5F`/`#2B4C7E`) — evokes
  garis gambar teknik di atas kertas biru klasik.
- Aksen sekunder/CTA: **cyan elektrik terang** (`#00B4D8` atau serupa)
  utk tombol utama/highlight — kontras tegas thd base dingin, terasa
  "digital-precise".
- Status warna: hijau/kuning/merah standar TAPI DESATURASI sedikit
  supaya tidak bentrok dgn aksen biru (mis. hijau `#3D9970`, bukan hijau
  neon).
- **Kelebihan**: diferensiasi kuat vs kompetitor SaaS generik, tie-in
  tematik jelas ke "gambar kerja". **Risiko**: biru+dingin bisa terasa
  "corporate/dingin" kalau eksekusi tipografi/spacing tidak diimbangi
  dgn kehangatan di tempat lain (mis. warna hover/aksen kecil tetap
  hangat).

### Arah B — "Warm Concrete" (evolusi dari sistem SEKARANG)
**Mood**: pertahankan kehangatan warm-grey yang sudah ada (`--bg`
sekarang cream/abu hangat), tapi GANTI aksen bronze/gold jadi lebih
"material konstruksi" — terracotta/rust (mengacu bata/besi berkarat) atau
amber (rompi keselamatan).
- Base: TETAP warm grey/concrete tone (`#EAE7E1` dst, SUDAH ADA, minimal
  perubahan).
- Aksen: **terracotta/rust** (`#B5502F`) ATAU **amber safety** (`#D97706`)
  menggantikan bronze `--gold` sekarang.
- **Kelebihan**: risiko PALING RENDAH (evolusi bukan revolusi, banyak
  token dipertahankan, less rework), tetap ada tie-in material
  konstruksi. **Kekurangan**: perubahan visual paling TIDAK terasa
  "rombak besar-besaran" dibanding sistem sekarang — kalau tujuan owner
  betul-betul mau tampilan BEDA JAUH, arah ini kurang memuaskan itu.

### Arah C — "Modern SaaS Neutral"
**Mood**: netral graphite/putih + SATU aksen vivid (indigo atau emerald)
— paling dekat ke tren "strategic minimalism" 2026 dari riset owner,
paling generik/aman, referensi visual paling dekat ke Linear/Vercel/
produk SaaS modern arus utama.
- Base: `#FAFAFA`/`#18181B` (dark) — nyaris monokrom.
- Aksen tunggal: **indigo** (`#6366F1`) atau **emerald** (`#10B981`) —
  pilih SATU, pakai konsisten sbg satu-satunya warna "hidup" di seluruh
  UI (tombol primer, active state, chart seri utama).
- **Kelebihan**: paling mudah dieksekusi dgn benar (minimalis = lebih
  sedikit keputusan warna keliru), selaras riset "5-9 elemen per layar"
  krn desain minimalis secara alami menahan godaan menambah elemen.
  **Kekurangan**: paling sedikit personality/diferensiasi — banyak SaaS
  dashboard 2026 terlihat spt ini, PAAX bisa "hilang" di antara
  kompetitor kalau tidak dikuatkan lewat elemen lain (tipografi/ilustrasi
  custom).

**Rekomendasi keputusan**: pilih Arah A kalau owner mau diferensiasi
brand kuat & bersedia effort desain lebih (perlu hati-hati keseimbangan
dingin-hangat). Pilih Arah B kalau mau minim risiko & masih puas dgn
evolusi bertahap. Pilih Arah C kalau prioritas adalah eksekusi cepat &
"terlihat modern" tanpa banyak keputusan desain. **Jangan campur
ketiganya** — pilih SATU arah lalu breakdown jadi token penuh (36+
variable per tema spt sistem sekarang) sebelum mulai coding.

---

## 4. Skala ukuran, spacing, tipografi (formal, gantikan pola ad-hoc)

### 4.1 Skala tipografi (rasio ~1.125-1.2, dibulatkan ke integer)
```
--text-xs:   11px   (label kecil, caption, badge)
--text-sm:   12px   (body sekunder, tabel)
--text-base: 13px   (body utama — SAAT INI paling sering dipakai)
--text-md:   14px   (body sedikit ditekankan, input)
--text-lg:   16px   (subheading kecil)
--text-xl:   20px   (heading kartu/section)
--text-2xl:  24px   (heading halaman)
--text-3xl:  32px   (angka KPI besar/hero metric)
--text-4xl:  40px   (jarang, hero angka RAB total kalau ingin sangat menonjol)
```
Ganti SEMUA angka ad-hoc (`11.5`, `12.5`, dst) ke skala ini SAAT
mengerjakan tiap halaman — jangan revisi CSS variable saja tapi biarkan
komponen lama pakai angka lama (drift lagi kalau tidak konsisten
diterapkan).

### 4.2 Skala spacing (basis 4px, dipakai utk padding/gap/margin)
```
--space-1: 4px   --space-2: 8px   --space-3: 12px   --space-4: 16px
--space-5: 20px  --space-6: 24px  --space-8: 32px   --space-10: 40px
--space-12: 48px --space-16: 64px
```

### 4.3 Border-radius (2 pilihan tergantung Arah palet §3)
- Kalau Arah A (Blueprint, presisi teknis): radius LEBIH KECIL/tegas —
  `--radius-sm: 6px`, `--radius-md: 8px`, `--radius-lg: 12px` (kesan
  presisi/technical drawing, bukan bulat playful).
- Kalau Arah B/C (evolusi warm / minimal modern): radius SAAT INI (10-16px)
  sudah cukup pas, TIDAK perlu diubah drastis — cukup dirapikan jadi
  skala formal `--radius-sm: 8px`, `--radius-md: 12px`, `--radius-lg: 16px`,
  `--radius-xl: 24px` (utk modal besar).

### 4.4 Shadow & elevasi
Pertahankan KONSEP yang sudah ada (`--shadow-card`/`--shadow-hover`/
`--shadow-modal` + opsi `--emboss` neumorphic utk tema grey) — cukup
kalibrasi ULANG nilai blur/opacity menyesuaikan base color baru (§3).
Tambahkan **1 level baru**: `--shadow-float` (utk elemen yang sengaja
"mengambang" tinggi, mis. FAB/tombol aksi utama mengambang, tooltip) —
blur lebih besar & offset lebih jauh drpd `--shadow-hover`.

---

## 5. Bentuk komponen — perubahan konkret per komponen inti

| Komponen | Sekarang | Rekomendasi redesign |
|---|---|---|
| `Card` | radius 16, shadow flat/emboss, tanpa animasi masuk | Tambah prop `variant: 'flat'\|'glass'\|'emboss'\|'outline'` (skema sudah dukung glass via `.pax-glass`, formalkan jadi prop resmi bukan className manual); animasi masuk via Framer Motion (`initial={{opacity:0,y:8}}`, stagger antar card via `custom` index) |
| `Button` | 3 varian (primary/secondary/ghost), radius 10, tanpa micro-interaction selain hover CSS | Tambah state animasi **tap** (scale 0.97 on press, via `whileTap` Framer Motion) — micro-interaction yang SAAT INI hilang sama sekali; opsional varian `destructive` (untuk aksi hapus, saat ini pakai warna `dng-*` tapi belum ada varian Button khusus) |
| `Badge`/`StatusPill` | flat, warna via `--ok/--warn/--dng` | Pertimbangkan animasi "pulse" halus utk status yang genuinely live/real-time (job analisa gambar sedang PROCESSING, misalnya) — REUSE `.pax-thinking`/`paxpulse` yang SUDAH ADA, jangan bikin baru |
| `Modal`/`Drawer` | tidak dicek detail sesi ini, KEMUNGKINAN transisi CSS sederhana | Ganti ke Framer Motion `AnimatePresence` + spring transition (slide utk Drawer, scale+fade utk Modal) — ini KANDIDAT PALING BERDAMPAK krn modal/drawer dipakai di banyak alur (settings, upload, dsb) |
| Chart (dashboard-charts.tsx, s-curve-chart.tsx) | SVG statis, render sekali | Animasi "draw-in" saat pertama render (path length animation Framer Motion utk line/donut/bar) — efek yang lazim di dashboard premium 2026 riset owner, dampak visual besar utk effort kecil (chart SUDAH custom SVG, tinggal tambah motion wrapper) |
| Loading state | EmptyState/kosong | **BARU**: komponen `Skeleton` (shimmer bar generik, dipakai sbg placeholder kartu/tabel/chart selama fetch) — prioritas TINGGI krn ini gap fungsional nyata, bukan cuma estetika |

---

## 6. Sistem animasi — spesifikasi konkret

### 6.1 Prinsip (dari riset owner + kebiasaan produk data-dense)
- **Durasi pendek** (150-300ms utk micro-interaction, maks 400ms utk
  transisi halaman) — dashboard data-dense TIDAK boleh terasa lambat
  krn animasi berlebihan.
- **Easing**: `easeOut` utk elemen MASUK (terasa responsif), `easeInOut`
  utk elemen yang loop/pulse.
- **Hormati `prefers-reduced-motion`** — SUDAH ADA di `globals.css`
  (`@media (prefers-reduced-motion: reduce)`), PASTIKAN semua animasi
  Framer Motion BARU juga tunduk aturan ini (Framer Motion punya
  `useReducedMotion()` hook bawaan — WAJIB dipakai di komponen bersama/
  wrapper, jangan per halaman manual).

### 6.2 Katalog animasi yang direkomendasikan (per momen interaksi)
1. **Masuk halaman** (route change): fade+slide-up tipis (8-12px),
   durasi 250ms, `AnimatePresence` di layout dashboard.
2. **Stagger list/grid** (KPI cards, daftar proyek, daftar work items):
   delay antar-item 40-60ms, formalkan dari pola `delay` prop yang SUDAH
   ada di `KpiCard` jadi utility/hook bersama (`useStagger(index)`).
3. **Hover kartu**: pertahankan `translateY(-2px)` yang sudah ada,
   TAMBAH transisi shadow yang lebih smooth via Framer Motion
   `whileHover` (opsional, CSS transition existing sbnrnya sudah cukup —
   jangan over-engineer bagian ini).
4. **Tekan tombol**: `whileTap={{ scale: 0.97 }}` — BARU, belum ada sama
   sekali.
5. **Modal/Drawer buka-tutup**: spring transition (`type: 'spring',
   damping: 25, stiffness: 300`) — BARU, gap paling terasa.
6. **Loading skeleton**: shimmer gradient bergerak (`background-position`
   animasi, CSS keyframe biasa CUKUP, TIDAK perlu Framer Motion utk ini).
7. **Chart draw-in**: `pathLength` animasi 0→1 durasi 600-800ms saat
   chart pertama masuk viewport (pertimbangkan `whileInView` Framer
   Motion utk trigger saat scroll, bukan cuma on-mount, relevan utk
   halaman laporan yang panjang).
8. **Status live/real-time** (job analisa gambar PROCESSING, prinsip
   "real-time data viz" dari riset owner): badge/progress yang benar-benar
   berdenyut mengikuti data BERUBAH (bukan animasi kosmetik loop terus-
   menerus) — REUSE pola `.pax-thinking` (sudah ada utk Engineering Chat),
   perluas ke context lain yang punya status job async (`analyze/status/
   {job_id}` sudah ada di backend, tinggal UI-nya dianimasikan).

---

## 7. Checklist sebelum mulai eksekusi (utk owner + Fable 5)

- [ ] **Pilih 1 dari 3 Arah palet (§3)** — atau minta Fable 5 membuat
  mockup kecil ketiganya dulu (1 halaman dashboard) sebelum commit ke
  satu arah, kalau owner masih ragu.
- [ ] **Kumpulkan referensi visual TAMBAHAN** kalau owner sudah condong
  ke satu arah tapi ingin contoh nyata lebih spesifik (mis. screenshot
  dashboard tertentu dari daftar riset yang paling dekat mood-nya) —
  mempercepat keselarasan sebelum Fable 5 mulai.
- [ ] **Putuskan radius/shape** (§4.3) — terikat ke pilihan Arah palet.
- [ ] **Setujui penambahan dependency Framer Motion** (§2) — satu-
  satunya perubahan `package.json` yang direkomendasikan dokumen ini.
- [ ] **Prioritaskan Skeleton loading state** sbg bagian redesign yang
  FUNGSIONAL (bukan cuma estetika) — jangan sampai terlewat krn kalah
  menarik dibanding animasi/warna.
- [ ] Baca `docs/plans/PAAX_FRONTEND_REDESIGN_MASTER_PLAN_2026-07-05.md`
  utk urutan eksekusi penuh (redesign visual digabung dgn pekerjaan
  fungsional yang masih tertunda).
