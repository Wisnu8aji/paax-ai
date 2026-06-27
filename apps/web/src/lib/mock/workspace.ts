/**
 * PAAX Workspace — presentational mock data for the redesigned UI.
 *
 * IMPORTANT: This is placeholder ("data contoh") content for the visual redesign
 * only. None of these numbers are computed by the deterministic engine. The real,
 * auditable RAB/HSP/Kurva-S path remains at /rab-tester (services/core-engine).
 * Do not treat any value here as an engine result.
 */

export type ProjectStatus = 'active' | 'review' | 'hold' | 'done';

export interface MockProject {
  id: string;
  name: string;
  location: string;
  client: string;
  type: string;
  status: ProjectStatus;
  statusLabel: string;
  description: string;
  rabValue: number;
  progress: number;
  warnings: number;
  health: number;
  lastActivity: string;
}

export const statusTone: Record<ProjectStatus, 'ok' | 'warn' | 'dng' | 'neutral'> = {
  active: 'ok',
  review: 'warn',
  hold: 'neutral',
  done: 'ok',
};

export const projects: MockProject[] = [
  {
    id: 'proj-001',
    name: 'Gedung Kuliah Terpadu UNS',
    location: 'Surakarta, Jawa Tengah',
    client: 'Universitas Sebelas Maret',
    type: 'Gedung',
    status: 'active',
    statusLabel: 'AKTIF',
    description: '4 lantai, struktur beton bertulang, luas ±3.200 m². Tahap konstruksi.',
    rabValue: 18_450_000_000,
    progress: 62,
    warnings: 3,
    health: 88,
    lastActivity: '2 jam lalu',
  },
  {
    id: 'proj-002',
    name: 'Jembatan Sungai Bengawan',
    location: 'Sragen, Jawa Tengah',
    client: 'Dinas PUPR Sragen',
    type: 'Infrastruktur',
    status: 'review',
    statusLabel: 'REVIEW',
    description: 'Bentang 45 m, gelagar beton prategang. Menunggu persetujuan RAB.',
    rabValue: 9_720_000_000,
    progress: 28,
    warnings: 5,
    health: 74,
    lastActivity: 'kemarin',
  },
  {
    id: 'proj-003',
    name: 'Renovasi Pasar Legi',
    location: 'Surakarta, Jawa Tengah',
    client: 'Pemkot Surakarta',
    type: 'Renovasi',
    status: 'hold',
    statusLabel: 'TERTUNDA',
    description: 'Revitalisasi 2 blok los pasar, atap baja ringan. Menunggu lahan.',
    rabValue: 4_310_000_000,
    progress: 12,
    warnings: 1,
    health: 91,
    lastActivity: '4 hari lalu',
  },
];

export const portfolioValue = projects.reduce((s, p) => s + p.rabValue, 0);

export interface StatTile {
  label: string;
  value: string;
  sub?: string;
  dot?: string;
}

export const dashStats: StatTile[] = [
  { label: 'Proyek Aktif', value: '3', sub: '1 menunggu review', dot: 'var(--ok-dot)' },
  { label: 'Warning Terbuka', value: '9', sub: '2 kritikal', dot: 'var(--warn-fg)' },
  { label: 'Rata-rata Health', value: '84%', sub: '+3% minggu ini', dot: 'var(--ok-dot)' },
];

export interface QuickAction {
  key: string;
  label: string;
  href: string;
}

export const quickActions: QuickAction[] = [
  { key: 'rab', label: 'Buat RAB Baru', href: '/proyek' },
  { key: 'gambar', label: 'Analisis Gambar', href: '/gambar-kerja-ai' },
  { key: 'jadwal', label: 'Susun Schedule', href: '/proyek' },
  { key: 'laporan', label: 'Export Laporan', href: '/laporan' },
];

export interface CriticalWarning {
  id: string;
  message: string;
  project: string;
  time: string;
  tone: 'warn' | 'dng';
}

export const criticalWarnings: CriticalWarning[] = [
  { id: 'w1', message: 'Harga semen melebihi SHSD wilayah +14%', project: 'Gedung UNS', time: '2 jam lalu', tone: 'dng' },
  { id: 'w2', message: 'Volume galian tanah belum diverifikasi dari gambar', project: 'Jembatan Bengawan', time: '5 jam lalu', tone: 'warn' },
  { id: 'w3', message: 'Item pembesian duplikat pada BOQ bab III', project: 'Gedung UNS', time: 'kemarin', tone: 'warn' },
];

export const proyekStats: StatTile[] = [
  { label: 'Total Proyek', value: '3', sub: 'di workspace' },
  { label: 'Nilai Portfolio', value: 'Rp 32,48 M', sub: 'gabungan RAB' },
  { label: 'Rata-rata Progress', value: '34%', sub: 'tertimbang' },
  { label: 'Tim Terlibat', value: '12', sub: '4 kolaborator aktif' },
];

export const drawingSummary: StatTile[] = [
  { label: 'Gambar Diunggah', value: '24', sub: '6 sheet baru' },
  { label: 'Sudah Dianalisis', value: '18', sub: 'AI fallback demo' },
  { label: 'Kandidat Kuantitas', value: '142', sub: 'menunggu verifikasi' },
  { label: 'Confidence Rata-rata', value: '0,81', sub: 'skala 0–1' },
];

export interface DrawingItem {
  id: string;
  name: string;
  sheet: string;
  type: string;
  status: 'analyzed' | 'pending' | 'failed';
  confidence: number;
}

export const drawings: DrawingItem[] = [
  { id: 'd1', name: 'Denah Lantai 1', sheet: 'A-01', type: 'Floor Plan', status: 'analyzed', confidence: 0.88 },
  { id: 'd2', name: 'Potongan A-A', sheet: 'A-12', type: 'Section', status: 'analyzed', confidence: 0.79 },
  { id: 'd3', name: 'Detail Pondasi', sheet: 'S-03', type: 'Foundation', status: 'pending', confidence: 0 },
  { id: 'd4', name: 'Rebar Schedule', sheet: 'S-21', type: 'Rebar', status: 'failed', confidence: 0 },
];

// ── RAB & BOQ (PLACEHOLDER / data contoh — bukan hasil engine) ────────────────
export interface MockBoqLine {
  no: string;
  uraian: string;
  satuan: string;
  volume: number;
  hsp: number;
  jumlah: number;
  bobot: number;
}

export const rabChapter = 'III — Pekerjaan Struktur';

export const boqLines: MockBoqLine[] = [
  { no: '3.1', uraian: 'Pasangan dinding bata merah 1/2 batu', satuan: 'm²', volume: 1240, hsp: 145387, jumlah: 180_279_880, bobot: 28.4 },
  { no: '3.2', uraian: 'Plesteran 1 PC : 3 PP tebal 15 mm', satuan: 'm²', volume: 2480, hsp: 82845, jumlah: 205_455_600, bobot: 32.3 },
  { no: '3.3', uraian: "Beton mutu f'c 14,5 MPa (K-175)", satuan: 'm³', volume: 186, hsp: 1_284_500, jumlah: 238_917_000, bobot: 37.6 },
  { no: '3.4', uraian: 'Pemasangan lantai keramik 40×40 cm', satuan: 'm²', volume: 85, hsp: 122400, jumlah: 10_404_000, bobot: 1.6 },
];

export const rabSummary = {
  subtotal: 635_056_480,
  ppnRate: 0.11,
  ppn: 69_856_213,
  total: 704_912_693,
};

// ── Schedule / Kurva S (placeholder) ──────────────────────────────────────────
export interface SCurvePt {
  week: number;
  planned: number;
  cumulative: number;
}

export const sCurve: SCurvePt[] = [
  { week: 1, planned: 8, cumulative: 8 },
  { week: 2, planned: 12, cumulative: 20 },
  { week: 3, planned: 18, cumulative: 38 },
  { week: 4, planned: 22, cumulative: 60 },
  { week: 5, planned: 24, cumulative: 84 },
  { week: 6, planned: 16, cumulative: 100 },
];

export interface ScheduleTaskRow {
  wbs: string;
  name: string;
  start: string;
  end: string;
  days: number;
  progress: number;
}

export const scheduleTasks: ScheduleTaskRow[] = [
  { wbs: '1', name: 'Pekerjaan Persiapan', start: '01 Jul', end: '07 Jul', days: 7, progress: 100 },
  { wbs: '2', name: 'Pekerjaan Pondasi', start: '08 Jul', end: '22 Jul', days: 15, progress: 80 },
  { wbs: '3', name: 'Pekerjaan Struktur', start: '20 Jul', end: '18 Agu', days: 30, progress: 45 },
  { wbs: '4', name: 'Pekerjaan Arsitektur', start: '15 Agu', end: '20 Sep', days: 36, progress: 10 },
];

export const scenarios = [
  { key: 'hemat', label: 'Hemat', desc: 'Durasi lebih panjang, biaya alat minimal' },
  { key: 'normal', label: 'Normal', desc: 'Baseline rencana proyek' },
  { key: 'cepat', label: 'Cepat', desc: 'Paralel maksimal, tambahan shift' },
];

// ── Chat (placeholder) ────────────────────────────────────────────────────────
export interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  time: string;
}

export const chatMessages: ChatMsg[] = [
  { id: 'c1', role: 'user', text: 'Kenapa HSP pasangan bata lebih tinggi dari estimasi awal?', time: '09:12' },
  { id: 'c2', role: 'assistant', text: 'Angka berasal dari engine deterministik: koefisien AHSP × harga satuan wilayah Jawa Tengah, ditambah BUK 10%. Kenaikan utama dari harga semen yang di atas SHSD. (Contoh tampilan — angka final selalu dari engine.)', time: '09:12' },
];

// ── Site Agent (placeholder) ──────────────────────────────────────────────────
export interface SiteLogRow {
  date: string;
  weather: string;
  summary: string;
  manpower: number;
  progress: number;
}

export const siteLogs: SiteLogRow[] = [
  { date: '24 Jun 2026', weather: 'Cerah', summary: 'Pengecoran kolom lantai 2 zona A', manpower: 24, progress: 62 },
  { date: '23 Jun 2026', weather: 'Berawan', summary: 'Pembesian balok lantai 2', manpower: 21, progress: 60 },
  { date: '22 Jun 2026', weather: 'Hujan', summary: 'Pekerjaan tertunda 3 jam karena hujan', manpower: 12, progress: 58 },
];

// ── Files (placeholder) ───────────────────────────────────────────────────────
export interface FileRow {
  id: string;
  name: string;
  type: string;
  size: string;
  updatedAt: string;
}

export const files: FileRow[] = [
  { id: 'f1', name: 'Gambar Struktur Rev.3.pdf', type: 'DRAWING_PDF', size: '14,2 MB', updatedAt: '24 Jun 2026' },
  { id: 'f2', name: 'RAB Gedung UNS.xlsx', type: 'SPREADSHEET', size: '320 KB', updatedAt: '23 Jun 2026' },
  { id: 'f3', name: 'Spesifikasi Teknis.docx', type: 'DOCUMENT_PDF', size: '1,1 MB', updatedAt: '20 Jun 2026' },
  { id: 'f4', name: 'Foto Progress Minggu 8.zip', type: 'PHOTO', size: '48,7 MB', updatedAt: '19 Jun 2026' },
];

// ── AHSP database (placeholder rows) ──────────────────────────────────────────
export interface AhspRow {
  code: string;
  name: string;
  unit: string;
  bidang: string;
}

export const ahspRows: AhspRow[] = [
  { code: 'AHSP.CK.001', name: 'Pasangan dinding bata merah 1/2 batu, 1 PC : 5 PP', unit: 'm²', bidang: 'Cipta Karya' },
  { code: 'AHSP.CK.002', name: 'Plesteran 1 PC : 3 PP, tebal 15 mm', unit: 'm²', bidang: 'Cipta Karya' },
  { code: 'AHSP.CK.003', name: "Beton mutu f'c 14,5 MPa (setara K-175)", unit: 'm³', bidang: 'Cipta Karya' },
  { code: 'AHSP.CK.004', name: 'Pemasangan lantai keramik 40×40 cm', unit: 'm²', bidang: 'Cipta Karya' },
];

// ── Reports / Export (placeholder) ────────────────────────────────────────────
export interface ReportCard {
  id: string;
  title: string;
  desc: string;
  formats: string[];
}

export const reports: ReportCard[] = [
  { id: 'r1', title: 'RAB Lengkap', desc: 'Rekap BOQ, HSP, subtotal, PPN, total dengan bobot.', formats: ['PDF', 'XLSX'] },
  { id: 'r2', title: 'Kurva S Rencana', desc: 'Progress rencana per periode + grafik kumulatif.', formats: ['PDF', 'XLSX'] },
  { id: 'r3', title: 'Laporan Audit Angka', desc: 'Jejak audit koefisien × harga untuk setiap item.', formats: ['PDF'] },
];

// ── Collaboration (placeholder) ───────────────────────────────────────────────
export interface Member {
  id: string;
  name: string;
  role: string;
  email: string;
  online: boolean;
}

export const members: Member[] = [
  { id: 'm1', name: 'Budi Andrean', role: 'Project Manager', email: 'pm@paax.id', online: true },
  { id: 'm2', name: 'Siti Rahmawati', role: 'Estimator', email: 'estimator@paax.id', online: true },
  { id: 'm3', name: 'Dimas Prakoso', role: 'Engineer', email: 'engineer@paax.id', online: false },
  { id: 'm4', name: 'Putri Lestari', role: 'Site Admin', email: 'site@paax.id', online: true },
];

// ── Notifications (placeholder) ───────────────────────────────────────────────
export interface NotifItem {
  id: string;
  title: string;
  body: string;
  time: string;
  tone: 'ok' | 'warn' | 'dng';
}

export const notifications: NotifItem[] = [
  { id: 'n1', title: 'RAB menunggu persetujuan', body: 'Jembatan Bengawan v2 dikirim untuk review.', time: '10 mnt lalu', tone: 'warn' },
  { id: 'n2', title: 'Analisis gambar selesai', body: '6 sheet baru menghasilkan 38 kandidat kuantitas.', time: '1 jam lalu', tone: 'ok' },
  { id: 'n3', title: 'Harga material anomali', body: 'Harga semen +14% di atas SHSD wilayah.', time: '2 jam lalu', tone: 'dng' },
];

export const connectedApps = [
  { id: 'a1', name: 'Google Drive', desc: 'Sinkron file & dokumen proyek', connected: true },
  { id: 'a2', name: 'Microsoft Excel', desc: 'Export RAB & BOQ', connected: true },
  { id: 'a3', name: 'WhatsApp Business', desc: 'Notifikasi tim lapangan', connected: false },
  { id: 'a4', name: 'Primavera P6', desc: 'Sinkron schedule', connected: false },
];

export const currentUser = {
  name: 'Budi Andrean',
  email: 'pm@paax.id',
  role: 'Project Manager',
  initials: 'BA',
};

export const aiCredits = { used: 670, total: 1000, pct: 67 };
