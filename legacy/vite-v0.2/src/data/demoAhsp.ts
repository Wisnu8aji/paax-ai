import type { AhspTemplate, ProjectState } from "../types";

export const APP_VERSION = "0.2.0-demo";
export const APP_STAGE = "v0.2-demo";

export const DEFAULT_MODEL = "gemini-2.5-flash";

export const MATERIAL_LABELS: Record<string, string> = {
  semen: "Semen Portland",
  pasir_beton: "Pasir beton",
  pasir_pasang: "Pasir pasang",
  batu_belah: "Batu belah",
  kerikil: "Kerikil / split",
  besi_beton: "Besi beton polos",
  kawat_beton: "Kawat beton",
  kayu_bekisting: "Kayu bekisting",
  paku: "Paku",
  minyak_bekisting: "Minyak bekisting",
  bata_merah: "Bata merah",
};

export const LABOR_LABELS: Record<string, string> = {
  pekerja: "Pekerja",
  tukang_batu: "Tukang batu",
  tukang_kayu: "Tukang kayu",
  tukang_besi: "Tukang besi",
  kepala_tukang: "Kepala tukang",
  mandor: "Mandor",
};

export const DEFAULT_MATERIAL_PRICES: Record<string, number> = {
  semen: 1500,
  pasir_beton: 280000,
  pasir_pasang: 250000,
  batu_belah: 320000,
  kerikil: 350000,
  besi_beton: 14500,
  kawat_beton: 22000,
  kayu_bekisting: 3200000,
  paku: 20000,
  minyak_bekisting: 18000,
  bata_merah: 850,
};

export const DEFAULT_LABOR_PRICES: Record<string, number> = {
  pekerja: 120000,
  tukang_batu: 150000,
  tukang_kayu: 150000,
  tukang_besi: 150000,
  kepala_tukang: 170000,
  mandor: 180000,
};

export const DEMO_AHSP_TEMPLATES: AhspTemplate[] = [
  {
    code: "SNI.2835.6.1",
    name: "Galian tanah biasa kedalaman 1m",
    unit: "m3",
    category: "Pekerjaan Galian & Pondasi",
    materials: [],
    labor: [
      { key: "pekerja", name: "Pekerja", coefficient: 0.75, unit: "OH" },
      { key: "mandor", name: "Mandor", coefficient: 0.025, unit: "OH" },
    ],
  },
  {
    code: "SNI.2835.6.3",
    name: "Buang tanah hasil galian jarak kurang dari 150m",
    unit: "m3",
    category: "Pekerjaan Galian & Pondasi",
    materials: [],
    labor: [
      { key: "pekerja", name: "Pekerja", coefficient: 0.33, unit: "OH" },
      { key: "mandor", name: "Mandor", coefficient: 0.011, unit: "OH" },
    ],
  },
  {
    code: "SNI.2836.6.2",
    name: "Pondasi batu belah campuran 1SP : 4PP",
    unit: "m3",
    category: "Pekerjaan Galian & Pondasi",
    materials: [
      { key: "batu_belah", name: "Batu belah", coefficient: 1.2, unit: "m3" },
      { key: "semen", name: "Semen Portland", coefficient: 163, unit: "kg" },
      { key: "pasir_pasang", name: "Pasir pasang", coefficient: 0.52, unit: "m3" },
    ],
    labor: [
      { key: "pekerja", name: "Pekerja", coefficient: 1.5, unit: "OH" },
      { key: "tukang_batu", name: "Tukang batu", coefficient: 0.75, unit: "OH" },
      { key: "kepala_tukang", name: "Kepala tukang", coefficient: 0.075, unit: "OH" },
      { key: "mandor", name: "Mandor", coefficient: 0.075, unit: "OH" },
    ],
  },
  {
    code: "SNI.7394.6.1",
    name: "Beton K-175 / f'c 14.5 MPa",
    unit: "m3",
    category: "Pekerjaan Struktur Beton",
    materials: [
      { key: "semen", name: "Semen Portland", coefficient: 326, unit: "kg" },
      { key: "pasir_beton", name: "Pasir beton", coefficient: 0.512, unit: "m3" },
      { key: "kerikil", name: "Kerikil / split", coefficient: 0.732, unit: "m3" },
    ],
    labor: [
      { key: "pekerja", name: "Pekerja", coefficient: 1.65, unit: "OH" },
      { key: "tukang_batu", name: "Tukang batu", coefficient: 0.275, unit: "OH" },
      { key: "kepala_tukang", name: "Kepala tukang", coefficient: 0.028, unit: "OH" },
      { key: "mandor", name: "Mandor", coefficient: 0.083, unit: "OH" },
    ],
  },
  {
    code: "SNI.7394.6.2",
    name: "Beton K-225 / f'c 19.3 MPa",
    unit: "m3",
    category: "Pekerjaan Struktur Beton",
    materials: [
      { key: "semen", name: "Semen Portland", coefficient: 371, unit: "kg" },
      { key: "pasir_beton", name: "Pasir beton", coefficient: 0.493, unit: "m3" },
      { key: "kerikil", name: "Kerikil / split", coefficient: 0.748, unit: "m3" },
    ],
    labor: [
      { key: "pekerja", name: "Pekerja", coefficient: 1.65, unit: "OH" },
      { key: "tukang_batu", name: "Tukang batu", coefficient: 0.275, unit: "OH" },
      { key: "kepala_tukang", name: "Kepala tukang", coefficient: 0.028, unit: "OH" },
      { key: "mandor", name: "Mandor", coefficient: 0.083, unit: "OH" },
    ],
  },
  {
    code: "SNI.7394.6.17",
    name: "Pembesian besi beton polos",
    unit: "kg",
    category: "Pekerjaan Bekisting & Besi",
    materials: [
      { key: "besi_beton", name: "Besi beton polos", coefficient: 1.05, unit: "kg" },
      { key: "kawat_beton", name: "Kawat beton", coefficient: 0.015, unit: "kg" },
    ],
    labor: [
      { key: "pekerja", name: "Pekerja", coefficient: 0.007, unit: "OH" },
      { key: "tukang_besi", name: "Tukang besi", coefficient: 0.007, unit: "OH" },
      { key: "kepala_tukang", name: "Kepala tukang", coefficient: 0.0007, unit: "OH" },
      { key: "mandor", name: "Mandor", coefficient: 0.0004, unit: "OH" },
    ],
  },
  {
    code: "SNI.7394.6.24",
    name: "Bekisting sloof beton",
    unit: "m2",
    category: "Pekerjaan Bekisting & Besi",
    materials: [
      { key: "kayu_bekisting", name: "Kayu bekisting", coefficient: 0.04, unit: "m3" },
      { key: "paku", name: "Paku", coefficient: 0.3, unit: "kg" },
      { key: "minyak_bekisting", name: "Minyak bekisting", coefficient: 0.1, unit: "liter" },
    ],
    labor: [
      { key: "pekerja", name: "Pekerja", coefficient: 0.52, unit: "OH" },
      { key: "tukang_kayu", name: "Tukang kayu", coefficient: 0.26, unit: "OH" },
      { key: "kepala_tukang", name: "Kepala tukang", coefficient: 0.026, unit: "OH" },
      { key: "mandor", name: "Mandor", coefficient: 0.026, unit: "OH" },
    ],
  },
  {
    code: "SNI.7394.6.25",
    name: "Bekisting kolom beton",
    unit: "m2",
    category: "Pekerjaan Bekisting & Besi",
    materials: [
      { key: "kayu_bekisting", name: "Kayu bekisting", coefficient: 0.04, unit: "m3" },
      { key: "paku", name: "Paku", coefficient: 0.4, unit: "kg" },
      { key: "minyak_bekisting", name: "Minyak bekisting", coefficient: 0.2, unit: "liter" },
    ],
    labor: [
      { key: "pekerja", name: "Pekerja", coefficient: 0.66, unit: "OH" },
      { key: "tukang_kayu", name: "Tukang kayu", coefficient: 0.33, unit: "OH" },
      { key: "kepala_tukang", name: "Kepala tukang", coefficient: 0.033, unit: "OH" },
      { key: "mandor", name: "Mandor", coefficient: 0.033, unit: "OH" },
    ],
  },
  {
    code: "SNI.15.50774",
    name: "Pasangan bata merah 1/2 batu 1:4",
    unit: "m2",
    category: "Pekerjaan Dinding & Arsitektur",
    materials: [
      { key: "bata_merah", name: "Bata merah", coefficient: 70, unit: "buah" },
      { key: "semen", name: "Semen Portland", coefficient: 11.5, unit: "kg" },
      { key: "pasir_pasang", name: "Pasir pasang", coefficient: 0.043, unit: "m3" },
    ],
    labor: [
      { key: "pekerja", name: "Pekerja", coefficient: 0.3, unit: "OH" },
      { key: "tukang_batu", name: "Tukang batu", coefficient: 0.1, unit: "OH" },
      { key: "kepala_tukang", name: "Kepala tukang", coefficient: 0.01, unit: "OH" },
      { key: "mandor", name: "Mandor", coefficient: 0.015, unit: "OH" },
    ],
  },
  {
    code: "SNI.2837.6.4",
    name: "Plesteran dinding 15mm 1:4",
    unit: "m2",
    category: "Pekerjaan Dinding & Arsitektur",
    materials: [
      { key: "semen", name: "Semen Portland", coefficient: 6.24, unit: "kg" },
      { key: "pasir_pasang", name: "Pasir pasang", coefficient: 0.024, unit: "m3" },
    ],
    labor: [
      { key: "pekerja", name: "Pekerja", coefficient: 0.3, unit: "OH" },
      { key: "tukang_batu", name: "Tukang batu", coefficient: 0.15, unit: "OH" },
      { key: "kepala_tukang", name: "Kepala tukang", coefficient: 0.015, unit: "OH" },
      { key: "mandor", name: "Mandor", coefficient: 0.015, unit: "OH" },
    ],
  },
];

export const INITIAL_PROJECT: ProjectState = {
  id: "paax-demo-rumah-tinggal",
  name: "Demo RAB Rumah Tinggal Tipe 70",
  location: "Bandung",
  description:
    "Dataset demo untuk estimasi awal rumah tinggal sederhana. Nilai tidak mewakili dokumen proyek nyata.",
  overheadPercentage: 10,
  materialsPrices: { ...DEFAULT_MATERIAL_PRICES },
  laborPrices: { ...DEFAULT_LABOR_PRICES },
  workItems: [
    {
      id: "wi-galian",
      category: "Pekerjaan Galian & Pondasi",
      name: "Galian tanah biasa jalur pondasi",
      volume: 42,
      unit: "m3",
      ahspCode: "SNI.2835.6.1",
    },
    {
      id: "wi-pondasi",
      category: "Pekerjaan Galian & Pondasi",
      name: "Pondasi batu belah 1:4",
      volume: 28,
      unit: "m3",
      ahspCode: "SNI.2836.6.2",
    },
    {
      id: "wi-beton",
      category: "Pekerjaan Struktur Beton",
      name: "Beton struktur K-225",
      volume: 12,
      unit: "m3",
      ahspCode: "SNI.7394.6.2",
    },
    {
      id: "wi-besi",
      category: "Pekerjaan Bekisting & Besi",
      name: "Pembesian besi beton polos",
      volume: 1250,
      unit: "kg",
      ahspCode: "SNI.7394.6.17",
    },
    {
      id: "wi-dinding",
      category: "Pekerjaan Dinding & Arsitektur",
      name: "Pasangan bata merah 1/2 batu 1:4",
      volume: 110,
      unit: "m2",
      ahspCode: "SNI.15.50774",
    },
  ],
  schedules: [
    {
      id: "sch-1",
      taskName: "Galian tanah biasa jalur pondasi",
      startDate: "2026-06-16",
      durationDays: 5,
      progress: 100,
      dependencies: [],
    },
    {
      id: "sch-2",
      taskName: "Pondasi batu belah 1:4",
      startDate: "2026-06-21",
      durationDays: 8,
      progress: 60,
      dependencies: ["sch-1"],
    },
    {
      id: "sch-3",
      taskName: "Pembesian besi beton polos",
      startDate: "2026-06-25",
      durationDays: 6,
      progress: 30,
      dependencies: ["sch-1"],
    },
  ],
};

export const DEMO_DRAWING_ITEMS = [
  {
    name: "Kolom beton K-225 C1",
    volume: 0.58,
    unit: "m3",
    matchedAHSP: "SNI.7394.6.2",
  },
  {
    name: "Pembesian kolom C1",
    volume: 95,
    unit: "kg",
    matchedAHSP: "SNI.7394.6.17",
  },
  {
    name: "Bekisting kolom beton C1",
    volume: 8.4,
    unit: "m2",
    matchedAHSP: "SNI.7394.6.25",
  },
];
