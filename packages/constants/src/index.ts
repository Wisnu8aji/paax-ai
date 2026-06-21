// ─── PAAX AI Shared Constants & Enums ─────────────────────────────────────────

// ─── Project ─────────────────────────────────────────────────────────────────

export const ProjectStatus = {
  DRAFT: "DRAFT",
  ACTIVE: "ACTIVE",
  ON_HOLD: "ON_HOLD",
  COMPLETED: "COMPLETED",
  ARCHIVED: "ARCHIVED",
} as const;
export type ProjectStatus = (typeof ProjectStatus)[keyof typeof ProjectStatus];

export const ProjectType = {
  RESIDENTIAL: "RESIDENTIAL",
  COMMERCIAL: "COMMERCIAL",
  INFRASTRUCTURE: "INFRASTRUCTURE",
  INDUSTRIAL: "INDUSTRIAL",
  GOVERNMENT: "GOVERNMENT",
  MIXED_USE: "MIXED_USE",
} as const;
export type ProjectType = (typeof ProjectType)[keyof typeof ProjectType];

// ─── RAB / Cost ──────────────────────────────────────────────────────────────

export const RABStatus = {
  DRAFT: "DRAFT",
  IN_REVIEW: "IN_REVIEW",
  APPROVED: "APPROVED",
  REVISION_REQUESTED: "REVISION_REQUESTED",
  LOCKED: "LOCKED",
} as const;
export type RABStatus = (typeof RABStatus)[keyof typeof RABStatus];

export const PriceSource = {
  MANUAL: "MANUAL",
  HSPK_NATIONAL: "HSPK_NATIONAL",
  HSPK_LOCAL: "HSPK_LOCAL",
  MARKET_SURVEY: "MARKET_SURVEY",
  AI_ESTIMATED: "AI_ESTIMATED",
} as const;
export type PriceSource = (typeof PriceSource)[keyof typeof PriceSource];

// ─── Files ───────────────────────────────────────────────────────────────────

export const FileType = {
  DRAWING_PDF: "DRAWING_PDF",
  DRAWING_DWG: "DRAWING_DWG",
  DRAWING_IMAGE: "DRAWING_IMAGE",
  DOCUMENT_PDF: "DOCUMENT_PDF",
  SPREADSHEET: "SPREADSHEET",
  BIM_MODEL: "BIM_MODEL",
  PHOTO: "PHOTO",
  OTHER: "OTHER",
} as const;
export type FileType = (typeof FileType)[keyof typeof FileType];

export const ProcessingStatus = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;
export type ProcessingStatus =
  (typeof ProcessingStatus)[keyof typeof ProcessingStatus];

// ─── Warnings ────────────────────────────────────────────────────────────────

export const WarningLevel = {
  INFO: "INFO",
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
} as const;
export type WarningLevel = (typeof WarningLevel)[keyof typeof WarningLevel];

export const WarningCategory = {
  QUANTITY_MISMATCH: "QUANTITY_MISMATCH",
  PRICE_ANOMALY: "PRICE_ANOMALY",
  MISSING_ITEM: "MISSING_ITEM",
  DUPLICATE_ITEM: "DUPLICATE_ITEM",
  UNIT_INCONSISTENCY: "UNIT_INCONSISTENCY",
  DRAWING_CONFLICT: "DRAWING_CONFLICT",
  SCHEDULE_CONFLICT: "SCHEDULE_CONFLICT",
  BUDGET_OVERRUN: "BUDGET_OVERRUN",
  REGULATION_VIOLATION: "REGULATION_VIOLATION",
  AI_CONFIDENCE_LOW: "AI_CONFIDENCE_LOW",
  OTHER: "OTHER",
} as const;
export type WarningCategory =
  (typeof WarningCategory)[keyof typeof WarningCategory];

// ─── Drawings ────────────────────────────────────────────────────────────────

export const DrawingType = {
  SITE_PLAN: "SITE_PLAN",
  FLOOR_PLAN: "FLOOR_PLAN",
  ELEVATION: "ELEVATION",
  SECTION: "SECTION",
  DETAIL: "DETAIL",
  STRUCTURAL: "STRUCTURAL",
  MEP: "MEP",
  LANDSCAPE: "LANDSCAPE",
  FOUNDATION: "FOUNDATION",
  ROOF_PLAN: "ROOF_PLAN",
  REBAR_SCHEDULE: "REBAR_SCHEDULE",
  OTHER: "OTHER",
} as const;
export type DrawingType = (typeof DrawingType)[keyof typeof DrawingType];

// ─── Schedule ────────────────────────────────────────────────────────────────

export const ScheduleStatus = {
  NOT_STARTED: "NOT_STARTED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  DELAYED: "DELAYED",
  ON_HOLD: "ON_HOLD",
  CANCELLED: "CANCELLED",
} as const;
export type ScheduleStatus =
  (typeof ScheduleStatus)[keyof typeof ScheduleStatus];

export const DependencyType = {
  FS: "FS", // Finish-to-Start
  FF: "FF", // Finish-to-Finish
  SS: "SS", // Start-to-Start
  SF: "SF", // Start-to-Finish
} as const;
export type DependencyType =
  (typeof DependencyType)[keyof typeof DependencyType];

// ─── Export ──────────────────────────────────────────────────────────────────

export const ExportFormat = {
  PDF: "PDF",
  XLSX: "XLSX",
  CSV: "CSV",
  JSON: "JSON",
  DOCX: "DOCX",
} as const;
export type ExportFormat = (typeof ExportFormat)[keyof typeof ExportFormat];

// ─── Chat ────────────────────────────────────────────────────────────────────

export const ChatMode = {
  GENERAL: "GENERAL",
  RAB_ASSISTANT: "RAB_ASSISTANT",
  DRAWING_ANALYSIS: "DRAWING_ANALYSIS",
  SCHEDULE_ASSISTANT: "SCHEDULE_ASSISTANT",
  SITE_REPORT: "SITE_REPORT",
} as const;
export type ChatMode = (typeof ChatMode)[keyof typeof ChatMode];

// ─── Approval ────────────────────────────────────────────────────────────────

export const ApprovalStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  EXPIRED: "EXPIRED",
} as const;
export type ApprovalStatus =
  (typeof ApprovalStatus)[keyof typeof ApprovalStatus];

export const ApprovalType = {
  RAB_APPROVAL: "RAB_APPROVAL",
  SCHEDULE_APPROVAL: "SCHEDULE_APPROVAL",
  EXPORT_APPROVAL: "EXPORT_APPROVAL",
  CHANGE_ORDER: "CHANGE_ORDER",
  BUDGET_INCREASE: "BUDGET_INCREASE",
  AI_ACTION: "AI_ACTION",
} as const;
export type ApprovalType = (typeof ApprovalType)[keyof typeof ApprovalType];

// ─── Units ───────────────────────────────────────────────────────────────────

export const Unit = {
  m: "m",
  m2: "m2",
  m3: "m3",
  kg: "kg",
  ton: "ton",
  liter: "liter",
  unit: "unit",
  ls: "ls", // lump sum
  set: "set",
  pcs: "pcs",
  roll: "roll",
  sack: "sack",
  trip: "trip",
  day: "day",
  hour: "hour",
  month: "month",
} as const;
export type Unit = (typeof Unit)[keyof typeof Unit];

/** Human-readable labels for units (Indonesian convention) */
export const UNIT_LABELS: Record<Unit, string> = {
  m: "meter",
  m2: "m²",
  m3: "m³",
  kg: "kilogram",
  ton: "ton",
  liter: "liter",
  unit: "unit",
  ls: "lump sum",
  set: "set",
  pcs: "buah",
  roll: "roll",
  sack: "zak",
  trip: "trip",
  day: "hari",
  hour: "jam",
  month: "bulan",
};

// ─── Currency ────────────────────────────────────────────────────────────────

export const Currency = {
  IDR: "IDR",
  USD: "USD",
  SGD: "SGD",
  MYR: "MYR",
} as const;
export type Currency = (typeof Currency)[keyof typeof Currency];

export const CURRENCY_CONFIG: Record<
  Currency,
  { symbol: string; locale: string; decimals: number }
> = {
  IDR: { symbol: "Rp", locale: "id-ID", decimals: 0 },
  USD: { symbol: "$", locale: "en-US", decimals: 2 },
  SGD: { symbol: "S$", locale: "en-SG", decimals: 2 },
  MYR: { symbol: "RM", locale: "ms-MY", decimals: 2 },
};

// ─── Roles ───────────────────────────────────────────────────────────────────

export const UserRole = {
  OWNER: "OWNER",
  ENGINEER: "ENGINEER",
  ESTIMATOR: "ESTIMATOR",
  SITE_ADMIN: "SITE_ADMIN",
  VIEWER: "VIEWER",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

// ─── Indonesian Standard Chapters ────────────────────────────────────────────

/** Standard RAB chapter ordering (Indonesian civil engineering convention) */
export const RAB_CHAPTERS = [
  { code: "I", title: "Pekerjaan Persiapan" },
  { code: "II", title: "Pekerjaan Tanah" },
  { code: "III", title: "Pekerjaan Pondasi" },
  { code: "IV", title: "Pekerjaan Beton / Struktur" },
  { code: "V", title: "Pekerjaan Dinding & Plester" },
  { code: "VI", title: "Pekerjaan Kusen & Daun Pintu/Jendela" },
  { code: "VII", title: "Pekerjaan Atap" },
  { code: "VIII", title: "Pekerjaan Plafond" },
  { code: "IX", title: "Pekerjaan Lantai" },
  { code: "X", title: "Pekerjaan Sanitasi" },
  { code: "XI", title: "Pekerjaan Instalasi Listrik" },
  { code: "XII", title: "Pekerjaan Pengecatan" },
  { code: "XIII", title: "Pekerjaan Lain-lain" },
] as const;
