import { z } from "zod";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const ProjectStatusEnum = z.enum([
  "DRAFT",
  "ACTIVE",
  "ON_HOLD",
  "COMPLETED",
  "ARCHIVED",
]);

export const RABStatusEnum = z.enum([
  "DRAFT",
  "IN_REVIEW",
  "APPROVED",
  "REVISION_REQUESTED",
  "LOCKED",
]);

export const FileTypeEnum = z.enum([
  "DRAWING_PDF",
  "DRAWING_DWG",
  "DRAWING_IMAGE",
  "DOCUMENT_PDF",
  "SPREADSHEET",
  "BIM_MODEL",
  "PHOTO",
  "OTHER",
]);

export const WarningLevelEnum = z.enum([
  "INFO",
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);

export const DrawingTypeEnum = z.enum([
  "SITE_PLAN",
  "FLOOR_PLAN",
  "ELEVATION",
  "SECTION",
  "DETAIL",
  "STRUCTURAL",
  "MEP",
  "LANDSCAPE",
  "FOUNDATION",
  "ROOF_PLAN",
  "REBAR_SCHEDULE",
  "OTHER",
]);

export const ScheduleStatusEnum = z.enum([
  "NOT_STARTED",
  "IN_PROGRESS",
  "COMPLETED",
  "DELAYED",
  "ON_HOLD",
  "CANCELLED",
]);

export const ExportFormatEnum = z.enum([
  "PDF",
  "XLSX",
  "CSV",
  "JSON",
  "DOCX",
]);

export const ChatModeEnum = z.enum([
  "GENERAL",
  "RAB_ASSISTANT",
  "DRAWING_ANALYSIS",
  "SCHEDULE_ASSISTANT",
  "SITE_REPORT",
]);

export const ApprovalStatusEnum = z.enum([
  "PENDING",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
]);

export const CurrencyEnum = z.enum(["IDR", "USD", "SGD", "MYR"]);

export const UnitEnum = z.enum([
  "m",
  "m2",
  "m3",
  "kg",
  "ton",
  "liter",
  "unit",
  "ls",
  "set",
  "pcs",
  "roll",
  "sack",
  "trip",
  "day",
  "hour",
  "month",
]);

export const RoleEnum = z.enum([
  "OWNER",
  "ENGINEER",
  "ESTIMATOR",
  "SITE_ADMIN",
  "VIEWER",
]);

// ─── Core: User & Organization ───────────────────────────────────────────────

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().min(1).max(120),
  photoURL: z.string().url().optional(),
  role: RoleEnum,
  organizationId: z.string().uuid().optional(),
  phone: z.string().optional(),
  certifications: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
  lastLoginAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const OrganizationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  type: z.enum([
    "CONTRACTOR",
    "CONSULTANT",
    "OWNER_REP",
    "GOVERNMENT",
    "DEVELOPER",
  ]),
  address: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  country: z.string().default("ID"),
  npwp: z.string().optional(), // Indonesian tax ID
  siujk: z.string().optional(), // Construction business license
  logoURL: z.string().url().optional(),
  memberCount: z.number().int().nonnegative().default(0),
  plan: z.enum(["FREE", "PRO", "ENTERPRISE"]).default("FREE"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ─── Project ─────────────────────────────────────────────────────────────────

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(300),
  code: z.string().max(30).optional(), // e.g., "PRJ-2026-001"
  description: z.string().max(2000).optional(),
  status: ProjectStatusEnum,
  type: z.enum([
    "RESIDENTIAL",
    "COMMERCIAL",
    "INFRASTRUCTURE",
    "INDUSTRIAL",
    "GOVERNMENT",
    "MIXED_USE",
  ]),
  location: z
    .object({
      address: z.string().optional(),
      city: z.string().optional(),
      province: z.string().optional(),
      lat: z.number().min(-90).max(90).optional(),
      lng: z.number().min(-180).max(180).optional(),
    })
    .optional(),
  currency: CurrencyEnum.default("IDR"),
  totalBudget: z.number().nonnegative().optional(),
  totalArea: z.number().nonnegative().optional(), // m²
  numberOfFloors: z.number().int().nonnegative().optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  ownerId: z.string().uuid(),
  memberIds: z.array(z.string().uuid()).default([]),
  tags: z.array(z.string()).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ProjectFileSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  fileName: z.string().min(1),
  fileType: FileTypeEnum,
  storagePath: z.string(),
  downloadURL: z.string().url().optional(),
  fileSizeBytes: z.number().int().nonnegative(),
  mimeType: z.string(),
  uploadedById: z.string().uuid(),
  version: z.number().int().positive().default(1),
  parentFileId: z.string().uuid().optional(),
  metadata: z
    .object({
      pageCount: z.number().int().positive().optional(),
      dpi: z.number().positive().optional(),
      dimensions: z
        .object({
          width: z.number().positive(),
          height: z.number().positive(),
          unit: z.enum(["px", "mm", "in"]),
        })
        .optional(),
    })
    .optional(),
  isProcessed: z.boolean().default(false),
  processingStatus: z
    .enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED"])
    .default("PENDING"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ─── Drawing Extraction ──────────────────────────────────────────────────────

export const DrawingElementSchema = z.object({
  id: z.string().uuid(),
  type: z.enum([
    "DIMENSION",
    "TEXT_LABEL",
    "ROOM_LABEL",
    "COLUMN_GRID",
    "WALL",
    "DOOR",
    "WINDOW",
    "STAIR",
    "BEAM",
    "COLUMN",
    "SLAB",
    "FOOTING",
    "REBAR",
    "ELEVATION_MARK",
    "SECTION_MARK",
    "SYMBOL",
    "TABLE",
    "TITLE_BLOCK",
    "NOTE",
    "HATCH",
    "OTHER",
  ]),
  label: z.string().optional(),
  value: z.string().optional(),
  unit: UnitEnum.optional(),
  numericValue: z.number().optional(),
  boundingBox: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number().positive(),
      height: z.number().positive(),
    })
    .optional(),
  confidence: z.number().min(0).max(1),
  rawText: z.string().optional(),
  linkedElementIds: z.array(z.string().uuid()).default([]),
});

export const DrawingPageSchema = z.object({
  id: z.string().uuid(),
  fileId: z.string().uuid(),
  pageNumber: z.number().int().positive(),
  drawingType: DrawingTypeEnum,
  title: z.string().optional(),
  sheetNumber: z.string().optional(), // e.g., "A-01", "S-03"
  scale: z.string().optional(), // e.g., "1:100"
  scaleNumeric: z.number().positive().optional(), // e.g., 100
  imageStoragePath: z.string().optional(),
  thumbnailStoragePath: z.string().optional(),
  widthPx: z.number().int().positive().optional(),
  heightPx: z.number().int().positive().optional(),
  elements: z.array(DrawingElementSchema).default([]),
  extractionConfidence: z.number().min(0).max(1).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const DrawingExtractionSchema = z.object({
  id: z.string().uuid(),
  fileId: z.string().uuid(),
  projectId: z.string().uuid(),
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "FAILED"]),
  pages: z.array(DrawingPageSchema).default([]),
  totalPages: z.number().int().nonnegative(),
  processedPages: z.number().int().nonnegative().default(0),
  modelVersion: z.string().optional(),
  processingTimeMs: z.number().nonnegative().optional(),
  errors: z
    .array(
      z.object({
        page: z.number().int().optional(),
        code: z.string(),
        message: z.string(),
      })
    )
    .default([]),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
});

// ─── Drawing-to-Estimate Workflow ─────────────────────────────────────────

export const DrawingCandidateStatusEnum = z.enum([
  "CANDIDATE",
  "APPROVED",
  "REJECTED",
  "EDITED",
]);

export const QuantityCandidateSchema = z.object({
  id: z.string().uuid(),
  quantity_name: z.string(),
  unit: UnitEnum,
  value: z.number().nonnegative(),
  source: z.string(),
  confidence: z.number().min(0).max(1),
  needs_verification: z.boolean().default(true),
  linked_rab_category: z.string().optional(),
  source_page: z.number().int().positive().optional(),
  evidence_note: z.string().optional(),
  status: DrawingCandidateStatusEnum.default("CANDIDATE"),
  notes: z.string().optional(),
});

export const VerifiedDrawingQuantitySchema = z.object({
  id: z.string().uuid(),
  candidate_id: z.string().uuid(),
  quantity_name: z.string(),
  unit: UnitEnum,
  verified_value: z.number().nonnegative(),
  verified_by: z.string().uuid().optional(),
  verified_at: z.string().datetime(),
  notes: z.string().optional(),
});

export const BoqDraftItemSchema = z.object({
  id: z.string().uuid(),
  category: z.string(),
  item_name: z.string(),
  unit: UnitEnum,
  quantity: z.number().nonnegative(),
  source_candidate_ids: z.array(z.string().uuid()).default([]),
  confidence: z.number().min(0).max(1),
  status: z.enum(["DRAFT", "READY", "WARNING"]),
  warning: z.string().optional(),
});

export const DrawingWarningSchema = z.object({
  id: z.string().uuid(),
  message: z.string(),
  level: WarningLevelEnum,
  related_elements: z.array(z.string()).default([]),
});

export const DrawingAnalysisResultSchema = z.object({
  file_id: z.string().uuid(),
  classification: z.string(),
  rooms: z.array(z.string()).default([]),
  doors: z.array(z.string()).default([]),
  windows: z.array(z.string()).default([]),
  quantity_candidates: z.array(QuantityCandidateSchema).default([]),
  warnings: z.array(DrawingWarningSchema).default([]),
});

export const DrawingToRabContextSchema = z.object({
  project_id: z.string().uuid(),
  drawing_file: z.string(), // name or id
  analysis_result: DrawingAnalysisResultSchema.optional(),
  verified_quantities: z.array(QuantityCandidateSchema).default([]),
  boq_draft_items: z.array(BoqDraftItemSchema).default([]),
  confidence_summary: z.number().min(0).max(1).optional(),
  warnings: z.array(z.string()).default([]),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const DocumentIntelligenceHealthSchema = z.object({
  status: z.string(),
  service: z.string(),
  version: z.string(),
  mode: z.enum(["real_ai", "fallback_demo"]),
  ai_provider_configured: z.boolean(),
});

// ─── Cost Estimation: RAB / BOQ / HSP ────────────────────────────────────────

export const PriceComponentSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  category: z.enum(["MATERIAL", "LABOR", "EQUIPMENT", "SUBCONTRACTOR"]),
  name: z.string().min(1).max(300),
  specification: z.string().max(500).optional(),
  unit: UnitEnum,
  unitPrice: z.number().nonnegative(),
  currency: CurrencyEnum.default("IDR"),
  source: z.enum(["MANUAL", "HSPK_NATIONAL", "HSPK_LOCAL", "MARKET_SURVEY", "AI_ESTIMATED"]).optional(),
  region: z.string().optional(), // e.g., "DKI Jakarta", "Jawa Barat"
  validFrom: z.string().date().optional(),
  validUntil: z.string().date().optional(),
  supplierName: z.string().optional(),
  notes: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const HSPItemSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  code: z.string(), // SNI code, e.g., "A.4.1.1.1"
  name: z.string().min(1).max(500),
  unit: UnitEnum,
  components: z.array(
    z.object({
      priceComponentId: z.string().uuid(),
      name: z.string(),
      coefficient: z.number().nonnegative(), // e.g., 1.2 (koefisien)
      unit: UnitEnum,
      unitPrice: z.number().nonnegative(),
      subtotal: z.number().nonnegative(),
    })
  ),
  totalUnitPrice: z.number().nonnegative(),
  currency: CurrencyEnum.default("IDR"),
  source: z.enum(["SNI", "CUSTOM", "AI_GENERATED"]).default("CUSTOM"),
  sniReference: z.string().optional(),
  notes: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const BOQItemSchema = z.object({
  id: z.string().uuid(),
  rabVersionId: z.string().uuid(),
  parentId: z.string().uuid().optional(), // for nested sub-items
  sortOrder: z.number().int().nonnegative(),
  level: z.number().int().nonnegative().default(0), // depth in hierarchy
  code: z.string(), // e.g., "I.1.a"
  description: z.string().min(1).max(1000),
  unit: UnitEnum,
  quantity: z.number().nonnegative(),
  unitPrice: z.number().nonnegative(),
  totalPrice: z.number().nonnegative(),
  currency: CurrencyEnum.default("IDR"),
  hspItemId: z.string().uuid().optional(),
  drawingReference: z.string().optional(), // e.g., "Sheet S-01, Detail A"
  calculationNotes: z.string().optional(), // how quantity was derived
  isFromDrawing: z.boolean().default(false),
  confidence: z.number().min(0).max(1).optional(),
  warnings: z.array(z.string()).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const RABItemSchema = z.object({
  id: z.string().uuid(),
  rabVersionId: z.string().uuid(),
  chapter: z.string(), // "I", "II", "III", etc.
  chapterTitle: z.string(), // e.g., "Pekerjaan Persiapan"
  items: z.array(BOQItemSchema),
  subtotal: z.number().nonnegative(),
  currency: CurrencyEnum.default("IDR"),
});

export const RABVersionSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  version: z.number().int().positive(),
  name: z.string().optional(), // e.g., "Initial Estimate", "Revised after Tender"
  status: RABStatusEnum,
  chapters: z.array(RABItemSchema).default([]),
  subtotal: z.number().nonnegative().default(0),
  ppn: z.number().nonnegative().default(0), // PPN (VAT)
  ppnRate: z.number().min(0).max(1).default(0.11), // 11%
  overhead: z.number().nonnegative().default(0),
  overheadRate: z.number().min(0).max(1).default(0.1), // 10%
  profit: z.number().nonnegative().default(0),
  profitRate: z.number().min(0).max(1).default(0.05), // 5%
  grandTotal: z.number().nonnegative().default(0),
  currency: CurrencyEnum.default("IDR"),
  approvedById: z.string().uuid().optional(),
  approvedAt: z.string().datetime().optional(),
  notes: z.string().optional(),
  sourceDrawingIds: z.array(z.string().uuid()).default([]),
  createdById: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ─── Schedule ────────────────────────────────────────────────────────────────

export const ScheduleTaskSchema = z.object({
  id: z.string().uuid(),
  scheduleVersionId: z.string().uuid(),
  parentId: z.string().uuid().optional(),
  sortOrder: z.number().int().nonnegative(),
  wbsCode: z.string().optional(), // e.g., "1.2.3"
  name: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  status: ScheduleStatusEnum,
  startDate: z.string().date(),
  endDate: z.string().date(),
  durationDays: z.number().int().positive(),
  percentComplete: z.number().min(0).max(100).default(0),
  dependencies: z.array(
    z.object({
      taskId: z.string().uuid(),
      type: z.enum(["FS", "FF", "SS", "SF"]), // Finish-Start, etc.
      lagDays: z.number().int().default(0),
    })
  ).default([]),
  assigneeIds: z.array(z.string().uuid()).default([]),
  resources: z.array(
    z.object({
      name: z.string(),
      type: z.enum(["LABOR", "EQUIPMENT", "MATERIAL"]),
      quantity: z.number().positive(),
      unit: z.string(),
    })
  ).default([]),
  isMilestone: z.boolean().default(false),
  isCriticalPath: z.boolean().default(false),
  boqItemIds: z.array(z.string().uuid()).default([]),
  notes: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ScheduleVersionSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  version: z.number().int().positive(),
  name: z.string().optional(),
  status: z.enum(["DRAFT", "BASELINE", "REVISED", "APPROVED"]),
  tasks: z.array(ScheduleTaskSchema).default([]),
  projectStartDate: z.string().date(),
  projectEndDate: z.string().date(),
  totalDurationDays: z.number().int().positive(),
  calendarConfig: z
    .object({
      workDaysPerWeek: z.number().int().min(1).max(7).default(6),
      hoursPerDay: z.number().positive().default(8),
      holidays: z.array(z.string().date()).default([]),
    })
    .optional(),
  createdById: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ─── AI: Warnings, Assumptions, Evidence ─────────────────────────────────────

// method/reviewState selaras docs/specs/brain-v4.1/PAAX_BRAIN_01_PRINSIP_PENALARAN.txt
// §4.3 (Evidence contract) & §5 (lifecycle). rank_method (F-J01) menentukan
// urutan keandalan method saat menghitung confidence (F-J03) — lihat §Z TXT02.
export const EvidenceMethodEnum = z.enum([
  "GRID_TABLE_VECTOR", // grid/level/tabel/vektor — paling andal
  "TEXT_VECTOR",        // teks tertulis dari vektor PDF
  "OCR_LOCAL",
  "VISION_LLM",
  "MANUAL_INPUT",
  "CALCULATION",
  "REFERENCE_LOOKUP",
]);

export const ReviewStateEnum = z.enum([
  "EXTRACTED",
  "CORROBORATED",
  "NEEDS_REVIEW",
  "APPROVED",
  "LOCKED",
  "SUPERSEDED",
]);

export const EvidenceSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(["DRAWING_REGION", "DOCUMENT_TEXT", "CALCULATION", "REFERENCE", "USER_INPUT"]),
  sourceFileId: z.string().uuid().optional(),
  sourcePage: z.number().int().positive().optional(),
  sourceRegion: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number().positive(),
      height: z.number().positive(),
    })
    .optional(),
  excerpt: z.string().optional(),
  url: z.string().url().optional(),
  description: z.string(),
  // ── Diperkaya (brain TXT01 §4.3) — semua opsional/berdefault, tidak
  // mengubah bentuk data lama yang sudah ada. Belum diisi oleh pipeline
  // manapun sampai perception layer (v1.0) mulai dibangun.
  method: EvidenceMethodEnum.optional(),
  ruleId: z.string().optional(), // mis. "F-B01", "RULE-EXP-BETON"
  confidence: z.number().min(0).max(1).optional(), // F-J03
  corroboratedBy: z.array(z.string().uuid()).default([]),
  conflictsWith: z.array(z.string().uuid()).default([]),
  reviewState: ReviewStateEnum.default("EXTRACTED"),
  supersededBy: z.string().uuid().optional(),
  createdAt: z.string().datetime(),
});

export const WarningSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  level: WarningLevelEnum,
  category: z.enum([
    "QUANTITY_MISMATCH",
    "PRICE_ANOMALY",
    "MISSING_ITEM",
    "DUPLICATE_ITEM",
    "UNIT_INCONSISTENCY",
    "DRAWING_CONFLICT",
    "SCHEDULE_CONFLICT",
    "BUDGET_OVERRUN",
    "REGULATION_VIOLATION",
    "AI_CONFIDENCE_LOW",
    "OTHER",
  ]),
  title: z.string().min(1).max(300),
  message: z.string().min(1).max(2000),
  affectedItemId: z.string().uuid().optional(),
  affectedItemType: z.string().optional(), // e.g., "BOQItem", "ScheduleTask"
  evidence: z.array(EvidenceSchema).default([]),
  isResolved: z.boolean().default(false),
  resolvedById: z.string().uuid().optional(),
  resolvedAt: z.string().datetime().optional(),
  resolutionNote: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const AssumptionSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  category: z.enum([
    "MATERIAL_SPEC",
    "LABOR_RATE",
    "QUANTITY_CALCULATION",
    "DESIGN_INTENT",
    "SITE_CONDITION",
    "REGULATION",
    "TIMELINE",
    "OTHER",
  ]),
  statement: z.string().min(1).max(1000),
  rationale: z.string().max(2000).optional(),
  confidence: z.number().min(0).max(1),
  impact: z.enum(["LOW", "MEDIUM", "HIGH"]),
  evidence: z.array(EvidenceSchema).default([]),
  isAccepted: z.boolean().optional(),
  acceptedById: z.string().uuid().optional(),
  acceptedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ─── DRAFT (brain v4.1, BELUM DIPAKAI) — ElementType/Instance/WorkItem/Review ─
//
// Skeleton selaras docs/specs/brain-v4.1/PAAX_BRAIN_01_PRINSIP_PENALARAN.txt §4
// (model entitas TKG/reasoning). Inert — tidak direferensikan endpoint atau
// komponen manapun. Akan MENGGANTIKAN DrawingElementSchema/QuantityCandidateSchema
// (blok "Drawing-to-Estimate Workflow" v0.5 di atas) saat pipeline TKG (v1.0)
// mulai dibangun — JANGAN aktifkan/gunakan keduanya bersamaan (schema drift,
// lihat docs/BRAIN_ALIGNMENT.md §2). Sinkron ke Pydantic hanya saat diaktifkan.

export const ElementTypeSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  code: z.string(), // mis. "K1", "B1" — label tipe dari schedule/legenda
  category: z.enum(["KOLOM", "BALOK", "PELAT", "DINDING", "PONDASI", "ATAP", "KUSEN", "MEP", "LAIN"]),
  properties: z.record(z.unknown()).default({}), // dimensi & spesifikasi per schedule
  sourceEvidenceIds: z.array(z.string().uuid()).default([]),
  createdAt: z.string().datetime(),
});

export const ElementInstanceSchema = z.object({
  id: z.string(), // format id deterministik: {PRJ}.{REV}.{DISC}.{LEVEL}.{TYPE}.{SEQ}
  projectId: z.string().uuid(),
  elementTypeId: z.string().uuid(),
  level: z.string(), // mis. "LT1", "LT2"
  gridPosition: z.string().optional(), // mis. "A-1"
  count: z.number().int().positive().default(1),
  sourceEvidenceIds: z.array(z.string().uuid()).default([]),
  reviewState: ReviewStateEnum.default("EXTRACTED"),
  createdAt: z.string().datetime(),
});

export const WorkItemDraftSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  elementInstanceId: z.string().optional(), // kosong utk implied work (RULE-IMP)
  ruleId: z.string(), // mis. "RULE-EXP-BETON", "RULE-IMP-SMKK"
  workType: z.string(), // mis. "beton", "besi", "bekisting"
  quantity: z.number().nonnegative().optional(), // diisi ENGINE, bukan LLM (INV-01)
  unit: UnitEnum.optional(),
  ahspCode: z.string().optional(),
  sourceEvidenceIds: z.array(z.string().uuid()).default([]),
  reviewState: ReviewStateEnum.default("EXTRACTED"),
  createdAt: z.string().datetime(),
});

export const ReviewTaskSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  targetType: z.enum(["ELEMENT_INSTANCE", "WORK_ITEM", "EVIDENCE"]),
  targetId: z.string(),
  reason: z.string(), // mis. "confidence rendah", "konflik presedensi" (RULE-TRI-01)
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "DISMISSED"]).default("OPEN"),
  assignedToId: z.string().uuid().optional(),
  createdAt: z.string().datetime(),
  resolvedAt: z.string().datetime().optional(),
});

export const CorrectionSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  reviewTaskId: z.string().uuid().optional(),
  targetType: z.enum(["ELEMENT_INSTANCE", "WORK_ITEM", "EVIDENCE"]),
  targetId: z.string(),
  previousValue: z.record(z.unknown()).optional(),
  correctedValue: z.record(z.unknown()),
  correctedById: z.string().uuid(),
  createdAt: z.string().datetime(),
});

// ─── Export ──────────────────────────────────────────────────────────────────

export const ExportJobSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  type: z.enum(["RAB", "BOQ", "SCHEDULE", "REPORT", "DRAWING_SUMMARY"]),
  format: ExportFormatEnum,
  status: z.enum(["QUEUED", "PROCESSING", "COMPLETED", "FAILED"]),
  parameters: z
    .object({
      rabVersionId: z.string().uuid().optional(),
      scheduleVersionId: z.string().uuid().optional(),
      includeBreakdown: z.boolean().optional(),
      includeLogo: z.boolean().optional(),
      language: z.enum(["id", "en"]).optional(),
      paperSize: z.enum(["A4", "A3", "LETTER"]).optional(),
    })
    .optional(),
  outputStoragePath: z.string().optional(),
  outputDownloadURL: z.string().url().optional(),
  fileSizeBytes: z.number().int().nonnegative().optional(),
  requestedById: z.string().uuid(),
  errorMessage: z.string().optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
});

// ─── Chat ────────────────────────────────────────────────────────────────────

export const ChatMessageSchema = z.object({
  id: z.string().uuid(),
  threadId: z.string().uuid(),
  role: z.enum(["USER", "ASSISTANT", "SYSTEM"]),
  content: z.string(),
  attachments: z
    .array(
      z.object({
        fileId: z.string().uuid().optional(),
        fileName: z.string(),
        fileType: z.string(),
        storagePath: z.string().optional(),
        url: z.string().url().optional(),
      })
    )
    .default([]),
  toolCalls: z
    .array(
      z.object({
        toolName: z.string(),
        input: z.record(z.unknown()),
        output: z.record(z.unknown()).optional(),
        status: z.enum(["PENDING", "RUNNING", "COMPLETED", "FAILED"]),
        durationMs: z.number().nonnegative().optional(),
      })
    )
    .default([]),
  citations: z
    .array(
      z.object({
        sourceFileId: z.string().uuid().optional(),
        page: z.number().int().positive().optional(),
        excerpt: z.string().optional(),
        url: z.string().url().optional(),
      })
    )
    .default([]),
  tokenCount: z
    .object({
      input: z.number().int().nonnegative().optional(),
      output: z.number().int().nonnegative().optional(),
    })
    .optional(),
  createdAt: z.string().datetime(),
});

export const ChatThreadSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  userId: z.string().uuid(),
  title: z.string().max(300).optional(),
  mode: ChatModeEnum,
  messages: z.array(ChatMessageSchema).default([]),
  contextFileIds: z.array(z.string().uuid()).default([]),
  isArchived: z.boolean().default(false),
  lastMessageAt: z.string().datetime().optional(),
  messageCount: z.number().int().nonnegative().default(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ─── Site & Operations ───────────────────────────────────────────────────────

export const SiteLogSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  date: z.string().date(),
  weather: z.enum(["SUNNY", "CLOUDY", "RAINY", "STORMY"]).optional(),
  temperature: z.number().optional(),
  reportedById: z.string().uuid(),
  summary: z.string().max(5000),
  workActivities: z
    .array(
      z.object({
        description: z.string(),
        location: z.string().optional(),
        workersCount: z.number().int().nonnegative().optional(),
        progress: z.number().min(0).max(100).optional(),
        boqItemId: z.string().uuid().optional(),
      })
    )
    .default([]),
  issues: z
    .array(
      z.object({
        description: z.string(),
        severity: WarningLevelEnum,
        isResolved: z.boolean().default(false),
      })
    )
    .default([]),
  photos: z
    .array(
      z.object({
        fileId: z.string().uuid(),
        caption: z.string().optional(),
        takenAt: z.string().datetime().optional(),
      })
    )
    .default([]),
  manpower: z
    .object({
      skilled: z.number().int().nonnegative().default(0),
      unskilled: z.number().int().nonnegative().default(0),
      supervisors: z.number().int().nonnegative().default(0),
    })
    .optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const UsageLogSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  organizationId: z.string().uuid().optional(),
  action: z.string(),
  resource: z.string(),
  resourceId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
  createdAt: z.string().datetime(),
});

export const ToolActionSchema = z.object({
  id: z.string().uuid(),
  chatMessageId: z.string().uuid().optional(),
  toolName: z.string(),
  description: z.string(),
  input: z.record(z.unknown()),
  output: z.record(z.unknown()).optional(),
  status: z.enum(["PENDING", "RUNNING", "COMPLETED", "FAILED"]),
  errorMessage: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
  requiresApproval: z.boolean().default(false),
  approvalRequestId: z.string().uuid().optional(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
});

export const ApprovalRequestSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  type: z.enum([
    "RAB_APPROVAL",
    "SCHEDULE_APPROVAL",
    "EXPORT_APPROVAL",
    "CHANGE_ORDER",
    "BUDGET_INCREASE",
    "AI_ACTION",
  ]),
  status: ApprovalStatusEnum,
  title: z.string().min(1).max(300),
  description: z.string().max(2000),
  requestedById: z.string().uuid(),
  assignedToId: z.string().uuid(),
  relatedItemId: z.string().uuid().optional(),
  relatedItemType: z.string().optional(),
  decision: z.string().optional(),
  decisionNote: z.string().optional(),
  decidedAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ─── Core Engine v0.6: Deterministic RAB / HSP / Kurva S ─────────────────────
//
// Blok ini adalah SUMBER KEBENARAN tipe untuk output engine deterministik
// (services/core-engine). HARUS selaras 1:1 dengan
// services/core-engine/app/rab/models.py (Pydantic v2). Ubah keduanya bersamaan.
//
// Catatan v0.6: skema didefinisikan paralel di Zod & Pydantic. Rencana v0.7:
// generate keduanya dari satu JSON Schema. Skema v0.5 di atas dipertahankan
// agar apps/web tetap berfungsi — tidak ada tabrakan nama dengan blok ini.

export const Category = z.enum(["bahan", "upah", "alat"]);
export type Category = z.infer<typeof Category>;

export const Component = z.object({
  resource_code: z.string(),
  category: Category,
  coefficient: z.number(),
});

export const AHSPItem = z.object({
  code: z.string(),
  name: z.string(),
  unit: z.string(),
  bidang: z.string().default(""),
  source: z.string().default(""),
  overhead_profit: z.number().default(0.1),
  components: z.array(Component),
});
export type AHSPItem = z.infer<typeof AHSPItem>;

export const ResourcePrice = z.object({
  code: z.string(),
  name: z.string(),
  category: Category,
  unit: z.string(),
  price: z.number(),
});

export const ComponentCost = z.object({
  resource_code: z.string(),
  resource_name: z.string(),
  category: Category,
  unit: z.string(),
  coefficient: z.number(),
  unit_price: z.number(),
  subtotal: z.number(),
});

export const HSPBreakdown = z.object({
  ahsp_code: z.string(),
  name: z.string(),
  unit: z.string(),
  bahan: z.number(),
  upah: z.number(),
  alat: z.number(),
  base: z.number(),
  overhead_profit: z.number(),
  overhead_profit_value: z.number(),
  hsp: z.number(),
  components: z.array(ComponentCost),
});
export type HSPBreakdown = z.infer<typeof HSPBreakdown>;

export const RABLineInput = z.object({
  ahsp_code: z.string(),
  volume: z.number(),
  duration_days: z.number().int().optional(),
  description: z.string().optional(),
  section: z.string().nullish(),
});
export type RABLineInput = z.infer<typeof RABLineInput>;

export const RABLine = z.object({
  ahsp_code: z.string(),
  name: z.string(),
  unit: z.string(),
  volume: z.number(),
  hsp: z.number(),
  amount: z.number(),
  weight_pct: z.number(),
  tax_amount: z.number(),
  line_total: z.number(),
});

export const RABResult = z.object({
  region: z.string(),
  region_code: z.string(),
  lines: z.array(RABLine),
  subtotal: z.number(),
  ppn_rate: z.number(),
  ppn: z.number(),
  total: z.number(),
});
export type RABResult = z.infer<typeof RABResult>;

export const SCurvePoint = z.object({
  period: z.number().int(),
  day_start: z.number().int(),
  day_end: z.number().int(),
  planned_pct: z.number(),
  cumulative_pct: z.number(),
});

export const SCurveResult = z.object({
  total_days: z.number().int(),
  period_days: z.number().int(),
  mode: z.string(),
  points: z.array(SCurvePoint),
});
export type SCurveResult = z.infer<typeof SCurveResult>;

// ─── CPM Schedule (selaras app/rab/schedule.py) ──────────────────────────────

export const TaskInput = z.object({
  id: z.string(),
  name: z.string().optional(),
  duration_days: z.number().min(0),
  predecessors: z.array(z.string()).default([]),
  dep_type: z.string().default("FS").refine((value) => value === "FS", {
    message: "v0.9A hanya mendukung dependency FS",
  }),
  lag_days: z.number().default(0).refine((value) => value === 0, {
    message: "v0.9A hanya mendukung lag_days 0",
  }),
});
export type TaskInput = z.infer<typeof TaskInput>;

export const CPMRequest = z.object({
  tasks: z.array(TaskInput),
});
export type CPMRequest = z.infer<typeof CPMRequest>;

export const CPMTask = z.object({
  id: z.string(),
  name: z.string(),
  duration_days: z.number(),
  early_start: z.number(),
  early_finish: z.number(),
  late_start: z.number(),
  late_finish: z.number(),
  total_float: z.number(),
  is_critical: z.boolean(),
});
export type CPMTask = z.infer<typeof CPMTask>;

export const CPMResult = z.object({
  project_duration_days: z.number(),
  tasks: z.array(CPMTask),
  critical_path: z.array(z.string()),
});
export type CPMResult = z.infer<typeof CPMResult>;

export const CalendarConfig = z.object({
  working_weekdays: z.array(z.number().int()).default([0, 1, 2, 3, 4, 5]),
  holidays: z.array(z.string()).default([]),
});
export type CalendarConfig = z.infer<typeof CalendarConfig>;

export const PlanTaskInput = z.object({
  id: z.string(),
  name: z.string().nullable().default(null),
  duration_days: z.number(),
  predecessors: z.array(z.string()).default([]),
  weight_pct: z.number().nullable().default(null),
});
export type PlanTaskInput = z.infer<typeof PlanTaskInput>;

export const SchedulePlanRequest = z.object({
  project_start_date: z.string(),
  calendar: CalendarConfig.nullable().default(null),
  period_days: z.number().int().default(7),
  tasks: z.array(PlanTaskInput),
});
export type SchedulePlanRequest = z.infer<typeof SchedulePlanRequest>;

export const ScheduledTask = CPMTask.extend({
  start_date: z.string(),
  end_date: z.string(),
});
export type ScheduledTask = z.infer<typeof ScheduledTask>;

export const SchedulePlanResult = z.object({
  project_duration_days: z.number(),
  project_start_date: z.string(),
  project_end_date: z.string(),
  tasks: z.array(ScheduledTask),
  critical_path: z.array(z.string()),
  s_curve: SCurveResult.nullable().default(null),
});
export type SchedulePlanResult = z.infer<typeof SchedulePlanResult>;

// ─── Scenario Simulator (selaras app/scenario/models.py) ─────────────────────

export const ScenarioLineInput = z.object({
  ahsp_code: z.string(),
  volume: z.number(),
  workers: z.number().int().default(4),
});
export type ScenarioLineInput = z.infer<typeof ScenarioLineInput>;

export const ScenarioParams = z.object({
  crew_multiplier: z.number().gt(0).default(1.0),
  shifts: z.number().int().min(1).default(1),
  efficiency: z.number().gt(0).default(1.0),
  target_days: z.number().gt(0).nullable().default(null),
  shift_premium_rate: z.number().min(0).default(0.3),
});
export type ScenarioParams = z.infer<typeof ScenarioParams>;

export const ScenarioConfig = z.object({
  region_code: z.string().default("jateng"),
  ppn_rate: z.number().default(0.11),
  base_mode: z.enum(["sequential", "parallel"]).default("sequential"),
  crew_factor: z.number().default(2),
  overtime_speedup: z.number().default(1.25),
  overtime_cost_factor: z.number().default(1.4),
  params: ScenarioParams.nullable().default(null),
  lines: z.array(ScenarioLineInput),
});
export type ScenarioConfig = z.infer<typeof ScenarioConfig>;

export const ItemSchedule = z.object({
  ahsp_code: z.string(),
  name: z.string(),
  unit: z.string(),
  volume: z.number(),
  labor_oh_per_unit: z.number(),
  mandays: z.number(),
  workers: z.number().int(),
  duration_days: z.number(),
});

export const ScenarioCandidate = z.object({
  key: z.string(),
  label: z.string(),
  total_days: z.number(),
  total_cost: z.number(),
  delta_days: z.number(),
  delta_cost: z.number(),
  delta_days_pct: z.number(),
  delta_cost_pct: z.number(),
  note: z.string(),
});

export const CustomItemSchedule = z.object({
  ahsp_code: z.string(),
  name: z.string(),
  volume: z.number(),
  base_mandays: z.number(),
  effective_workers: z.number(),
  duration_days: z.number(),
});

export const CustomScenarioResult = z.object({
  applied_crew_multiplier: z.number(),
  shifts: z.number().int(),
  efficiency: z.number(),
  target_days: z.number().nullable(),
  resolved_from_target: z.boolean(),
  items: z.array(CustomItemSchedule),
  total_days: z.number(),
  subtotal: z.number(),
  labor_cost: z.number(),
  total_cost: z.number(),
  delta_days: z.number(),
  delta_cost: z.number(),
  delta_days_pct: z.number(),
  delta_cost_pct: z.number(),
  note: z.string(),
});

export const ScenarioResult = z.object({
  region: z.string(),
  region_code: z.string(),
  base_mode: z.string(),
  items: z.array(ItemSchedule),
  baseline_total_days: z.number(),
  baseline_total_cost: z.number(),
  baseline_labor_cost: z.number(),
  candidates: z.array(ScenarioCandidate),
  custom: CustomScenarioResult.nullable().default(null),
});
export type ScenarioResult = z.infer<typeof ScenarioResult>;

// ─── RAB Health Check (selaras app/rab/validate.py) ──────────────────────────

export const ValidationIssue = z.object({
  code: z.string(),
  severity: z.enum(["info", "warning", "error"]),
  message: z.string(),
  ahsp_code: z.string().nullish(),
});
export type ValidationIssue = z.infer<typeof ValidationIssue>;

export const ValidationResult = z.object({
  score: z.number().int(),
  ok: z.boolean(),
  items_count: z.number().int(),
  errors: z.number().int(),
  warnings: z.number().int(),
  infos: z.number().int(),
  issues: z.array(ValidationIssue),
});
export type ValidationResult = z.infer<typeof ValidationResult>;

// ─── Geometry → Volume (selaras app/geometry/models.py) ──────────────────────

export const VolumeRequest = z.object({
  element_type: z.string(),
  dims: z.record(z.number()),
});
export type VolumeRequest = z.infer<typeof VolumeRequest>;

export const VolumeResult = z.object({
  element_type: z.string(),
  unit: z.string(),
  volume: z.number(),
  formula: z.string(),
  detail: z.string(),
  inputs: z.record(z.number()),
});
export type VolumeResult = z.infer<typeof VolumeResult>;

// ─── TKG — Transkrip Kanonik Gambar (selaras app/tkg/models.py) ──────────────
//
// Skema per docs/specs/brain-v4.1/PAAX_BRAIN_00_EKSTRAKSI_GAMBAR_KERJA.txt §6.
// INV-TKG-05: TKG BUKAN RAB — tidak memuat harga/AHSP/ekspansi.
// INV-TKG-03: nilai raw disimpan berdampingan dengan nilai normal.

export const TkgUnitEnum = z.enum(["mm", "cm", "m"]);

export const GridAxisSchema = z.object({
  label: z.string(),
  posisi_mm: z.number().nullish(),
});

export const GridSpanSchema = z.object({
  dari: z.string(),
  ke: z.string(),
  nilai: z.number(),
  unit: TkgUnitEnum.default("mm"),
  raw: z.string().nullish(),
});

export const GridTotalSchema = z.object({
  dari: z.string(),
  ke: z.string(),
  nilai: z.number(),
  unit: TkgUnitEnum.default("mm"),
  raw: z.string().nullish(),
});

export const TkgGridSchema = z.object({
  sumbu_x: z.array(GridAxisSchema).default([]),
  sumbu_y: z.array(GridAxisSchema).default([]),
  bentang_x: z.array(GridSpanSchema).default([]),
  bentang_y: z.array(GridSpanSchema).default([]),
  total_x: GridTotalSchema.nullish(),
  total_y: GridTotalSchema.nullish(),
  offset_tepi: z.array(GridSpanSchema).default([]),
});

export const TkgLevelSchema = z.object({
  label_raw: z.string(),
  nilai_m: z.number(),
  lantai: z.string().nullish(),
});

export const RebarPosisiEnum = z.enum([
  "tul_atas", "tul_bawah", "tul_pinggang", "tul_utama", "tul_sebar_x",
  "tul_sebar_y", "sengkang", "sengkang_tumpuan", "sengkang_lapangan",
]);

export const RebarSpecSchema = z.object({
  posisi: RebarPosisiEnum,
  raw: z.string(),
  jumlah: z.number().int().nullish(),
  diameter_mm: z.number().nullish(),
  jarak_mm: z.number().nullish(),
  jenis: z.enum(["D", "O"]).default("D"),
});

export const TypeKategoriEnum = z.enum([
  "pondasi_telapak", "pondasi_menerus", "sloof", "kolom", "kolom_praktis",
  "balok", "ring_balok", "latei", "plat", "dinding_beton", "tangga",
  "kuda_kuda", "gording", "ikatan_angin", "trekstang", "lain",
]);

export const TypeRecordSchema = z.object({
  kode: z.string(),
  lantai: z.string().nullish(),
  kategori: TypeKategoriEnum.nullish(),
  dimensi: z.record(z.number()).default({}),
  satuan_dimensi: TkgUnitEnum.default("mm"),
  tulangan: z.array(RebarSpecSchema).default([]),
  mutu_beton: z.string().nullish(),
  keterangan: z.string().nullish(),
  raw_cells: z.record(z.string()).nullish(),
});

export const TkgTableSchema = z.object({
  judul: z.string(),
  records: z.array(TypeRecordSchema).default([]),
});

export const RuasGridSchema = z.object({
  sumbu: z.enum(["x", "y"]),
  dari: z.string(),
  ke: z.string(),
  pada: z.string().nullish(),
});

export const TkgElementInstanceSchema = z.object({
  kode: z.string(),
  alamat: z.string(),
  alamat_list: z.array(z.string()).default([]),
  alamat_needs_review: z.boolean().default(false),
  bentuk: z.enum(["titik", "ruas", "bidang"]).default("titik"),
  n: z.number().int().default(1),
  count_simbol: z.number().int().nullish(),
  count_label: z.number().int().nullish(),
  lantai: z.string().nullish(),
  ruas: RuasGridSchema.nullish(),
  panjang_m: z.number().nullish(),
});

export const TkgDimensionSchema = z.object({
  nilai: z.number(),
  unit: TkgUnitEnum.default("mm"),
  anchor: z.string(),
  raw: z.string().nullish(),
  target_kode: z.string().nullish(),
});

export const SheetJenisEnum = z.enum([
  "denah", "tabel", "detail", "potongan", "tampak", "denah_atap",
  "notes", "campuran",
]);

export const SheetMetaSchema = z.object({
  judul: z.string(),
  nomor: z.string().nullish(),
  skala: z.string().nullish(),
  disiplin: z.string().nullish(),
  zone: z.string().nullish(),
});

export const TkgUnclassifiedSchema = z.object({
  raw: z.string(),
  alasan: z.string(),
});

export const TkgSheetSchema = z.object({
  sheet_id: z.string(),
  jenis: SheetJenisEnum,
  meta: SheetMetaSchema,
  grid: TkgGridSchema.nullish(),
  levels: z.array(TkgLevelSchema).default([]),
  tables: z.array(TkgTableSchema).default([]),
  elements: z.array(TkgElementInstanceSchema).default([]),
  dimensions: z.array(TkgDimensionSchema).default([]),
  notes: z.array(z.string()).default([]),
  unclassified: z.array(TkgUnclassifiedSchema).default([]),
});

export const TkgDocumentSchema = z.object({
  prj_id: z.string(),
  rev_id: z.string().default("R0"),
  file_hash: z.string().nullish(),
  locale: z.string().default("id-ID"),
  satuan_default: TkgUnitEnum.default("mm"),
  generated_by: z.string().default("manual"),
  sheets: z.array(TkgSheetSchema).default([]),
});
export type TkgDocument = z.infer<typeof TkgDocumentSchema>;

// ─── DEM — Drawing Evidence Model (selaras app/transcription/models.py) ──────
//
// Skema per docs/plans/drawing intelligence/
// PAAX_DEM_PCKM_GRAPH_COMMAND_ROOM_PLAN_2026-07-14.md §6.
// DEM adalah transkrip evidence PER HALAMAN — tidak ada angka hasil kalkulasi
// di sini (Aturan Emas, CLAUDE.md §1). Setiap fakta wajib punya confidence +
// evidence_refs + status.

export const DemStatusEnum = z.enum([
  "extracted", "ai_interpreted", "ambiguous", "conflicting", "missing", "human_verified",
]);

export const DemSourceSchema = z.object({
  document_hash: z.string(),
  file_name: z.string(),
  page_index: z.number().int().nonnegative(),
  page_number: z.number().int().positive(),
  render_uri: z.string(),
  width_px: z.number().int().positive(),
  height_px: z.number().int().positive(),
});

export const DemGenerationSchema = z.object({
  provider: z.string(),
  model_alias: z.string(),
  prompt_version: z.string(),
  started_at: z.string(),
  completed_at: z.string().nullish(),
  continuation_count: z.number().int().nonnegative().default(0),
  temperature: z.number().default(0),
  status: z.enum(["complete", "partial", "failed"]).default("complete"),
});

export const ValueWithEvidenceSchema = z.object({
  value: z.string(),
  raw: z.string().nullish(),
  confidence: z.number().min(0).max(1),
  evidence_refs: z.array(z.string()).default([]),
});

export const InterpretedValueSchema = z.object({
  value: z.string(),
  confidence: z.number().min(0).max(1),
  status: DemStatusEnum.default("extracted"),
});

export const ScaleCandidateSchema = z.object({
  raw: z.string(),
  normalized: z.string(),
  confidence: z.number().min(0).max(1),
  evidence_refs: z.array(z.string()).default([]),
});

export const SheetIdentitySchema = z.object({
  sheet_number: ValueWithEvidenceSchema,
  title: ValueWithEvidenceSchema,
  discipline: InterpretedValueSchema,
  scale_candidates: z.array(ScaleCandidateSchema).default([]),
});

export const SheetViewSchema = z.object({
  view_id: z.string(),
  type: z.string(),
  title: z.string(),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  confidence: z.number().min(0).max(1),
});

export const ObservationValueSchema = z.object({
  raw: z.string(),
  normalized: z.string().nullish(),
  numeric_value: z.number().nullish(),
  unit: z.string().nullish(),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).nullish(),
  confidence: z.number().min(0).max(1),
  status: DemStatusEnum.default("extracted"),
  evidence_refs: z.array(z.string()).default([]),
});

export const DemObservationsSchema = z.object({
  texts: z.array(ObservationValueSchema).default([]),
  dimensions: z.array(ObservationValueSchema).default([]),
  grids: z.array(ObservationValueSchema).default([]),
  levels: z.array(ObservationValueSchema).default([]),
  spaces: z.array(ObservationValueSchema).default([]),
  element_labels: z.array(ObservationValueSchema).default([]),
  symbols: z.array(ObservationValueSchema).default([]),
  tables: z.array(ObservationValueSchema).default([]),
  materials: z.array(ObservationValueSchema).default([]),
  notes: z.array(ObservationValueSchema).default([]),
  references: z.array(ObservationValueSchema).default([]),
  patterns: z.array(ObservationValueSchema).default([]),
  geometry_descriptions: z.array(ObservationValueSchema).default([]),
});

export const EvidenceItemSchema = z.object({
  evidence_id: z.string(),
  kind: z.string(),
  raw: z.string(),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).nullish(),
  confidence: z.number().min(0).max(1),
});

export const SheetCompletionSchema = z.object({
  sections_expected: z.number().int(),
  sections_completed: z.number().int(),
  is_complete: z.boolean(),
  next_cursor: z.string().nullable(),
});

export const DrawingEvidenceSheetSchema = z.object({
  schema_version: z.literal("paax.dem.sheet.v1").default("paax.dem.sheet.v1"),
  run_id: z.string(),
  document_id: z.string(),
  project_id: z.string(),
  source: DemSourceSchema,
  generation: DemGenerationSchema,
  sheet_identity: SheetIdentitySchema,
  views: z.array(SheetViewSchema).default([]),
  observations: DemObservationsSchema.default({}),
  evidence: z.array(EvidenceItemSchema).default([]),
  ambiguities: z.array(z.string()).default([]),
  conflicts: z.array(z.string()).default([]),
  unclassified: z.array(z.string()).default([]),
  completion: SheetCompletionSchema,
});
export type DrawingEvidenceSheet = z.infer<typeof DrawingEvidenceSheetSchema>;

export const PageManifestEntrySchema = z.object({
  page_index: z.number().int().nonnegative(),
  status: z.enum(["queued", "rendering", "calling_model", "complete", "retry_wait", "failed"]),
  attempt_count: z.number().int().nonnegative().default(0),
  input_hash: z.string().nullish(),
  error: z.string().nullish(),
});

export const DocumentManifestSchema = z.object({
  document_id: z.string(),
  document_hash: z.string(),
  total_pages: z.number().int().positive(),
  pages: z.array(PageManifestEntrySchema).default([]),
});
export type DocumentManifest = z.infer<typeof DocumentManifestSchema>;

export const ContinuationPatchSchema = z.object({
  schema_version: z.literal("paax.dem.patch.v1").default("paax.dem.patch.v1"),
  run_id: z.string(),
  page_index: z.number().int().nonnegative(),
  base_result_hash: z.string(),
  cursor: z.string(),
  append: z.record(z.array(z.unknown())).default({}),
  is_complete: z.boolean(),
  next_cursor: z.string().nullish(),
});
export type ContinuationPatch = z.infer<typeof ContinuationPatchSchema>;

// PCKM - Project Construction Knowledge Model graph (selaras
// app/project_graph/models.py)
//
// Skema per docs/plans/drawing intelligence/
// PAAX_DEM_PCKM_GRAPH_COMMAND_ROOM_PLAN_2026-07-14.md Section 11. PCKM adalah
// model kanonik PROYEK - node/edge dibangun dari normalisasi DEM, tidak pernah
// menyimpan angka hasil kalkulasi baru (Aturan Emas, CLAUDE.md Section 1).

export const NodeTypeEnum = z.enum([
  "project", "document", "sheet", "view", "drawing_zone", "revision",
  "site", "building", "wing", "level", "zone", "grid_axis", "grid_intersection",
  "space", "room", "external_area",
  "system", "discipline", "element_type", "element_occurrence", "assembly",
  "material", "finish", "opening", "equipment", "fixture",
  "dimension", "specification", "note", "schedule_table", "detail_reference",
  "drawing_reference", "assumption", "conflict", "missing_information",
]);

export const VerificationStatusEnum = z.enum([
  "extracted", "ai_interpreted", "cross_sheet_inferred", "human_verified", "conflicting", "ambiguous",
]);

export const NodePropertySchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean()]),
  value_source: z.enum(["extracted", "ai_interpreted", "cross_sheet_inferred"]).default("extracted"),
  evidence_refs: z.array(z.string()).default([]),
});

export const NodeSourceRefSchema = z.object({
  document_id: z.string(),
  page_index: z.number().int().nonnegative(),
  sheet_id: z.string(),
  evidence_refs: z.array(z.string()).default([]),
});

export const ProjectGraphNodeSchema = z.object({
  node_id: z.string(),
  type: NodeTypeEnum,
  canonical_name: z.string(),
  aliases: z.array(z.string()).default([]),
  properties: z.record(NodePropertySchema).default({}),
  discipline: z.string(),
  verification_status: VerificationStatusEnum,
  confidence: z.number().min(0).max(1),
  source_refs: z.array(NodeSourceRefSchema).default([]),
});
export type ProjectGraphNode = z.infer<typeof ProjectGraphNodeSchema>;

export const EdgeRelationEnum = z.enum([
  "CONTAINS", "PART_OF", "LOCATED_ON", "LOCATED_IN", "ALIGNED_TO", "DEFINED_BY",
  "DEPICTED_IN", "REFERENCES", "SAME_AS", "POSSIBLY_SAME_AS", "USES_MATERIAL",
  "HAS_FINISH", "HAS_DIMENSION", "HAS_TYPE", "INSTANCE_OF", "SERVES",
  "CONNECTED_TO", "SUPPORTED_BY", "SUPPORTS", "ADJACENT_TO", "OPENS_TO",
  "CONFLICTS_WITH", "HAS_EVIDENCE", "DERIVED_FROM", "SUPERSEDES",
  "HAS_OPENING", "FILLED_BY",
]);

export const ConfidenceClassEnum = z.enum([
  "EXTRACTED", "AI_INTERPRETED", "CROSS_SHEET_INFERRED", "HUMAN_VERIFIED", "CONFLICTING", "AMBIGUOUS",
]);

export const EdgeResolverSchema = z.object({
  method: z.string(),
  model: z.string().nullish(),
});

export const ProjectGraphEdgeSchema = z.object({
  edge_id: z.string(),
  source: z.string(),
  target: z.string(),
  relation: EdgeRelationEnum,
  confidence_class: ConfidenceClassEnum,
  confidence: z.number().min(0).max(1),
  evidence_refs: z.array(z.string()).default([]),
  resolver: EdgeResolverSchema.nullish(),
});
export type ProjectGraphEdge = z.infer<typeof ProjectGraphEdgeSchema>;

export const TkgIssueSchema = z.object({
  code: z.string(),
  severity: z.enum(["error", "warning"]),
  sheet_id: z.string().nullish(),
  message: z.string(),
  subject: z.string().nullish(),
});

export const TkgValidationResultSchema = z.object({
  ok: z.boolean(),
  gate_passed: z.boolean(),
  n_errors: z.number().int(),
  n_warnings: z.number().int(),
  issues: z.array(TkgIssueSchema),
  type_index: z.record(z.record(z.array(z.string()))),
  orphans_tanpa_definisi: z.array(z.string()),
  orphans_tanpa_instance: z.array(z.string()),
});
export type TkgValidationResult = z.infer<typeof TkgValidationResultSchema>;

// ─── Takeoff dari TKG (selaras app/tkg/takeoff.py + params.py) ───────────────

export const TakeoffParamsSchema = z.object({
  tinggi_per_lantai_m: z.number().nullish(),
  beam_len_mode: z.string().default("as_as"),
  selimut_beton_m: z.number().default(0.04),
  k_hook_sengkang: z.number().default(6.0),
  // F-D02/F-D04/F-D08: kait pokok, lewatan, stok batang (None = tidak dihitung)
  k_hook_utama: z.number().nullish(),
  n_ld: z.number().nullish(),
  l_stock_m: z.number().nullish(),
  zona_tumpuan_fraksi: z.number().default(0.25),
  // F-D06/AP-16: waste "param" ATAU "bbs" (waste nyata) — tidak keduanya
  waste_mode: z.enum(["param", "bbs"]).default("param"),
  waste_besi: z.number().default(0.0),
  t_pelat_default_m: z.number().nullish(),
  h_kategori_perancah_m: z.number().nullish(),
  reuse_form: z.number().int().min(1).nullish(), // §Z: faktor pakai-ulang bekisting (metode)
  tol_grid: z.number().default(0.005),
});
export type TakeoffParams = z.infer<typeof TakeoffParamsSchema>;

export const ParamUsedSchema = z.object({
  nama: z.string(),
  nilai: z.union([z.number(), z.string()]),
  catatan: z.string(),
});

export const TakeoffItemSchema = z.object({
  kode: z.string(),
  lantai: z.string().nullish(),
  kategori: z.string(),
  work_type: z.enum(["beton", "bekisting", "besi"]),
  quantity: z.number().nullish(),   // null = needs_review, TIDAK ditebak
  unit: z.string(),
  formula: z.string(),
  detail: z.string(),
  needs_review: z.boolean().default(false),
  review_reason: z.string().nullish(),
  mutu_beton: z.string().nullish(),
  alamat: z.string().nullish(),
  rule_id: z.string(),
  usage_factor: z.number().int().default(1), // §Z reuse_form — anotasi pakai-ulang bekisting
});
export type TakeoffItem = z.infer<typeof TakeoffItemSchema>;

// F-D08: Bar Bending Schedule (selaras app/tkg/takeoff.py BbsResult)
export const BbsMarkSchema = z.object({
  mark: z.string(),
  kode: z.string(),
  posisi: z.string(),
  d_mm: z.number(),
  panjang_m: z.number(),
  jumlah: z.number().int(),
  berat_kg: z.number(),
});
export type BbsMark = z.infer<typeof BbsMarkSchema>;

export const BbsDiameterSummarySchema = z.object({
  d_mm: z.number(),
  n_potong: z.number().int(),
  total_panjang_m: z.number(),
  kebutuhan_stok_batang: z.number().int(),
  waste_kg: z.number(),
});

export const BbsResultSchema = z.object({
  l_stock_m: z.number(),
  marks: z.array(BbsMarkSchema),
  per_diameter: z.array(BbsDiameterSummarySchema),
  total_waste_kg: z.number(),
});
export type BbsResult = z.infer<typeof BbsResultSchema>;

export const TakeoffResultSchema = z.object({
  prj_id: z.string(),
  rev_id: z.string(),
  items: z.array(TakeoffItemSchema),
  assumptions: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  params_used: z.array(ParamUsedSchema).default([]),
  n_needs_review: z.number().int().default(0),
  bbs: BbsResultSchema.nullish(), // terisi hanya bila waste_mode="bbs" (F-D08)
});
export type TakeoffResult = z.infer<typeof TakeoffResultSchema>;

// Fase T (2026-07-13, rencana besar AI Estimator) — usulan AHSP per
// TakeoffItem. Mirror `app.mapping.takeoff_ahsp`. ATURAN EMAS: ini USULAN
// (token-overlap deterministik), bukan keputusan final — `ahsp_suggested`
// HARUS ditandai terpisah dari pilihan manual user, tidak pernah disamakan.
export const TakeoffAhspCandidateSchema = z.object({
  ahsp_code: z.string(),
  name: z.string(),
  unit: z.string(),
  score: z.number(),
});
export type TakeoffAhspCandidate = z.infer<typeof TakeoffAhspCandidateSchema>;

export const TakeoffAhspSuggestionSchema = z.object({
  kode: z.string(),
  lantai: z.string().nullish(),
  kategori: z.string(),
  work_type: z.string(),
  ahsp_code: z.string().default(""),
  ahsp_suggested: z.boolean().default(false),
  ahsp_candidates: z.array(TakeoffAhspCandidateSchema).default([]),
  reason: z.string().default(""),
});
export type TakeoffAhspSuggestion = z.infer<typeof TakeoffAhspSuggestionSchema>;

export const TakeoffAhspSuggestResultSchema = z.object({
  takeoff: TakeoffResultSchema,
  suggestions: z.array(TakeoffAhspSuggestionSchema),
});
export type TakeoffAhspSuggestResult = z.infer<typeof TakeoffAhspSuggestResultSchema>;

// ─── Manual Takeoff arsitektur/tanah (selaras app/takeoff/*) ─────────────────
// Brain §E (dinding/finishing), §F (tanah), §G (pondasi batu/lantai/atap).

export const TanahParamsSchema = z.object({
  w_kerja: z.number().default(0.3),
  f_gembur: z.number().default(1.2),
  f_susut: z.number().default(1.1),
  kap_truk: z.number().default(4.0),
  jarak_dekat_max_km: z.number().default(5.0),
  jarak_sedang_max_km: z.number().default(15.0),
});
export type TanahParams = z.infer<typeof TanahParamsSchema>;

export const DindingParamsSchema = z.object({
  deduct_mode: z.enum(["all", "threshold"]).default("all"),
  deduct_threshold: z.number().default(0.0),
  n_lapis_cat: z.number().int().default(1),
  L_maks_praktis: z.number().default(4.0),
  A_maks_praktis: z.number().default(12.0),
});
export type DindingParams = z.infer<typeof DindingParamsSchema>;

export const ArsitekturParamsSchema = z.object({
  h_pasang_keramik: z.number().default(1.5),
  h_upstand: z.number().default(0.2),
}).strict();
export type ArsitekturParams = z.infer<typeof ArsitekturParamsSchema>;

export const BajaParamsSchema = z.object({
  W_baja_waste: z.number().default(0.05),
  gamma_s: z.number().default(7850.0),
});
export type BajaParams = z.infer<typeof BajaParamsSchema>;

export const AtapParamsSchema = z.object({
  A_per_downpipe: z.number().default(50.0),
});
export type AtapParams = z.infer<typeof AtapParamsSchema>;

export const MepParamsSchema = z.object({
  L_pipa_per_fixture: z.number().nullish(),
});
export type MepParams = z.infer<typeof MepParamsSchema>;

export const TakeoffLineSchema = z.object({
  kode: z.string(),
  work: z.string(),
  quantity: z.number().nullish(), // null = needs_review, TIDAK ditebak
  unit: z.string(),
  formula: z.string(),
  detail: z.string(),
  needs_review: z.boolean().default(false),
  review_reason: z.string().nullish(),
  rule_id: z.string(),
});
export type TakeoffLine = z.infer<typeof TakeoffLineSchema>;

export const ManualTakeoffResultSchema = z.object({
  domain: z.enum(["tanah", "dinding", "arsitektur", "baja", "atap", "kusen", "mep", "smkk"]),
  items: z.array(TakeoffLineSchema).default([]),
  assumptions: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  params_used: z.array(ParamUsedSchema).default([]),
  n_needs_review: z.number().int().default(0),
});
export type ManualTakeoffResult = z.infer<typeof ManualTakeoffResultSchema>;

// Request bodies — §F tanah
export const GalianFootplatSchema = z.object({
  kode: z.string(),
  b_ft: z.number(),
  l_ft: z.number(),
  d_gali: z.number(),
  n: z.number().int().default(1),
  v_struktur_tertanam_per_lubang: z.number().nullish(),
});
export const GalianMenerusSchema = z.object({
  kode: z.string(),
  l_parit: z.number(),
  b_bawah: z.number(),
  b_atas: z.number().nullish(),
  d_gali: z.number(),
});
export const UruganLapisSchema = z.object({
  kode: z.string(),
  jenis: z.enum(["pasir", "sirtu", "tanah"]),
  a: z.number(),
  t_lapis: z.number(),
  material_sudah_padat: z.boolean().default(false),
});
export const PemadatanSchema = z.object({
  kode: z.string(),
  quantity_basis: z.enum(["area", "volume"]),
  area_m2: z.number().nullish(),
  volume_padat_m3: z.number().nullish(),
  jarak_angkut_km: z.number().nullish(),
  kelas_jarak_angkut: z.enum(["dekat", "sedang", "jauh"]).nullish(),
});
export const TanahRequestSchema = z.object({
  footplats: z.array(GalianFootplatSchema).default([]),
  galian_menerus: z.array(GalianMenerusSchema).default([]),
  urugan: z.array(UruganLapisSchema).default([]),
  pemadatan: z.array(PemadatanSchema).default([]),
  params: TanahParamsSchema.default({}),
});
export type TanahRequest = z.infer<typeof TanahRequestSchema>;

// Request bodies — §E dinding/finishing
export const BukaanSchema = z.object({
  nama: z.string(),
  lebar: z.number(),
  tinggi: z.number(),
  n: z.number().int().default(1),
});
export const DindingBidangSchema = z.object({
  kode: z.string(),
  l_dinding: z.number(),
  h_dinding: z.number(),
  bukaan: z.array(BukaanSchema).default([]),
  plester_sisi: z.number().int().default(0),
  acian: z.boolean().default(false),
  cat: z.boolean().default(false),
});
export const ScreedBidangSchema = z.object({
  kode: z.string(),
  a: z.number(),
  t: z.number(),
});
export const SponninganLineSchema = z.object({
  kode: z.string(),
  panjang_m: z.number(),
  jumlah: z.number().int().default(1),
});
export const PraktisPanelSchema = z.object({
  kode: z.string(),
  panjang_segmen_m: z.number(),
  tinggi_m: z.number(),
  luas_panel_m2: z.number().nullish(),
});
export const DindingRequestSchema = z.object({
  dinding: z.array(DindingBidangSchema).default([]),
  screed: z.array(ScreedBidangSchema).default([]),
  sponningan: z.array(SponninganLineSchema).default([]),
  praktis: z.array(PraktisPanelSchema).default([]),
  params: DindingParamsSchema.default({}),
});
export type DindingRequest = z.infer<typeof DindingRequestSchema>;

// Request bodies — §G arsitektur subset
export const PondasiBatuSchema = z.object({
  kode: z.string(),
  a_atas: z.number(),
  a_bawah: z.number(),
  h_pond: z.number(),
  l: z.number(),
});
export const PenutupLantaiSchema = z.object({
  kode: z.string(),
  panjang: z.number(),
  lebar: z.number(),
  lebar_pintu_total: z.number().default(0.0),
  plin: z.boolean().default(true),
});
export const AtapMiringSchema = z.object({
  kode: z.string(),
  a_proyeksi: z.number(),
  theta_deg: z.number(),
});
export const AanstampingSchema = z.object({
  kode: z.string(),
  a_bawah_m: z.number(),
  t_aanstamping_m: z.number(),
  panjang_m: z.number(),
});
export const KeramikDindingBasahSchema = z.object({
  kode: z.string(),
  keliling_basah_m: z.number(),
  h_pasang_m: z.number().nullish(),
  bukaan_m2: z.number().default(0.0),
});
export const PlafonBidangSchema = z.object({
  kode: z.string(),
  a_neto_m2: z.number(),
  keliling_tepi_m: z.number().default(0.0),
});
export const WaterproofingBidangSchema = z.object({
  kode: z.string(),
  a_bidang_m2: z.number(),
  keliling_upstand_m: z.number().default(0.0),
  h_upstand_m: z.number().nullish(),
});
export const ArsitekturRequestSchema = z.object({
  pondasi_batu: z.array(PondasiBatuSchema).default([]),
  lantai: z.array(PenutupLantaiSchema).default([]),
  atap: z.array(AtapMiringSchema).default([]),
  aanstamping: z.array(AanstampingSchema).default([]),
  keramik_dinding: z.array(KeramikDindingBasahSchema).default([]),
  plafon: z.array(PlafonBidangSchema).default([]),
  waterproofing: z.array(WaterproofingBidangSchema).default([]),
  params: ArsitekturParamsSchema.default({}),
});
export type ArsitekturRequest = z.infer<typeof ArsitekturRequestSchema>;

export const ProfileDataSchema = z.object({
  kg_per_m: z.number(),
  perimeter_m: z.number().nullish(),
});
export const BajaMemberSchema = z.object({
  kode: z.string(),
  designation: z.string(),
  length_m: z.number(),
  qty: z.number().int().default(1),
});
export const BuiltUpPlateSchema = z.object({
  kode: z.string(),
  t_m: z.number(),
  width_m: z.number(),
  length_m: z.number(),
  qty: z.number().int().default(1),
});
export const BajaRequestSchema = z.object({
  profile_table: z.record(ProfileDataSchema).default({}),
  members: z.array(BajaMemberSchema).default([]),
  builtup_plates: z.array(BuiltUpPlateSchema).default([]),
  paint_members: z.array(BajaMemberSchema).default([]),
  params: BajaParamsSchema.default({}),
});
export type BajaRequest = z.infer<typeof BajaRequestSchema>;

export const RoofLineSchema = z.object({
  kode: z.string(),
  work: z.enum(["nok", "lisplank", "talang"]),
  length_m: z.number(),
  qty: z.number().int().default(1),
});
export const GordingInputSchema = z.object({
  kode: z.string(),
  l_miring_sisi_m: z.number(),
  s_gording_m: z.number(),
  l_arah_gording_m: z.number(),
  n_sisi_atap: z.number().int().default(1),
});
export const TrekstangInputSchema = z.object({
  kode: z.string(),
  panjang_per_batang_m: z.number(),
  jumlah: z.number().int(),
});
export const IkatanAnginSchema = z.object({
  kode: z.string(),
  a_m: z.number(),
  b_m: z.number(),
  qty: z.number().int().default(1),
});
export const DownpipeAreaSchema = z.object({
  kode: z.string(),
  a_atap_m2: z.number(),
  count: z.number().int().nullish(),
});
export const AtapDetailRequestSchema = z.object({
  garis: z.array(RoofLineSchema).default([]),
  gording: z.array(GordingInputSchema).default([]),
  trekstang: z.array(TrekstangInputSchema).default([]),
  ikatan_angin: z.array(IkatanAnginSchema).default([]),
  downpipes: z.array(DownpipeAreaSchema).default([]),
  params: AtapParamsSchema.default({}),
});
export type AtapDetailRequest = z.infer<typeof AtapDetailRequestSchema>;

export const AccessoryInputSchema = z.object({
  nama: z.string(),
  per_unit: z.number(),
  unit: z.string().default("bh"),
});
export const KusenScheduleItemSchema = z.object({
  kode: z.string(),
  tipe: z.string(),
  width_m: z.number(),
  height_m: z.number(),
  qty: z.number().int(),
  qty_counted: z.number().int().nullish(),
  hitung_kusen_perimeter: z.boolean().default(true),
  hitung_daun_area: z.boolean().default(false),
  hitung_kaca_area: z.boolean().default(false),
  accessories: z.array(AccessoryInputSchema).default([]),
});
export const KusenRequestSchema = z.object({
  items: z.array(KusenScheduleItemSchema).default([]),
});
export type KusenRequest = z.infer<typeof KusenRequestSchema>;

export const RailingLineSchema = z.object({
  kode: z.string(),
  length_m: z.number(),
  qty: z.number().int().default(1),
});
export const MepPointSchema = z.object({
  kode: z.string(),
  jenis: z.string(),
  count: z.number().int(),
});
export const PipeRouteSchema = z.object({
  kode: z.string(),
  length_m: z.number(),
  qty: z.number().int().default(1),
});
export const MepFixtureFallbackSchema = z.object({
  kode: z.string(),
  fixture_count: z.number().int(),
});
export const MepRequestSchema = z.object({
  railing: z.array(RailingLineSchema).default([]),
  points: z.array(MepPointSchema).default([]),
  pipe_routes: z.array(PipeRouteSchema).default([]),
  fixture_fallbacks: z.array(MepFixtureFallbackSchema).default([]),
  params: MepParamsSchema.default({}),
});
export type MepRequest = z.infer<typeof MepRequestSchema>;

// ─── RAB tersektor / WBS (selaras app/rab/sections.py) ───────────────────────

// Brain F0 data grounding coverage
export const ResourceCoverageLineSchema = z.object({
  resource_code: z.string(),
  resource_name: z.string().default(""),
  unit: z.string().default(""),
  used_by_ahsp: z.array(z.string()),
  has_price: z.boolean(),
  region_code: z.string(),
  source: z.string().default(""),
});
export const AhspCoverageLineSchema = z.object({
  ahsp_code: z.string(),
  description: z.string(),
  unit: z.string(),
  component_count: z.number().int(),
  priced_component_count: z.number().int(),
  missing_resource_codes: z.array(z.string()),
});
export const DataCoverageResultSchema = z.object({
  region_code: z.string(),
  ahsp_total: z.number().int(),
  ahsp_fully_priced: z.number().int(),
  resource_used_total: z.number().int(),
  resource_priced_total: z.number().int(),
  coverage_ratio: z.number(),
  missing_resources: z.array(ResourceCoverageLineSchema),
  ahsp: z.array(AhspCoverageLineSchema),
  warnings: z.array(z.string()).default([]),
});
export type DataCoverageResult = z.infer<typeof DataCoverageResultSchema>;

// Fase W (2026-07-14) — hasil grouping `document-intelligence`
// `app.perception.work_items`. Modul ini hanya menyalin volume dari
// TakeoffItem core-engine dan memberi status formula; tidak menghitung angka.
export const DrawingFormulaStatusEnum = z.enum([
  "dihitung",
  "belum_didukung",
  "perlu_review",
]);
export const DrawingWorkItemSchema = z.object({
  work_id: z.string(),
  kode: z.string(),
  kode_asli: z.array(z.string()).default([]),
  kategori: z.string(),
  work_type: z.string().nullish(),
  uraian: z.string(),
  wbs_section: z.string(),
  wbs_title: z.string(),
  formula_status: DrawingFormulaStatusEnum,
  unit: z.string().nullish(),
  volume: z.number().nullish(),
  formula: z.string().nullish(),
  rule_id: z.string().nullish(),
  source_pages: z.array(z.number().int()).default([]),
  element_refs: z.array(z.string()).default([]),
  needs_review: z.boolean().default(false),
  review_reason: z.string().nullish(),
});
export const DrawingWorkItemsResultSchema = z.object({
  work_items: z.array(DrawingWorkItemSchema).default([]),
  warnings: z.array(z.string()).default([]),
});
export type DrawingFormulaStatus = z.infer<typeof DrawingFormulaStatusEnum>;
export type DrawingWorkItem = z.infer<typeof DrawingWorkItemSchema>;
export type DrawingWorkItemsResult = z.infer<typeof DrawingWorkItemsResultSchema>;

// Fase X2 (2026-07-05) — mirror `document-intelligence`
// `app.perception.consolidated_models.AiDimensionSuggestion` /
// `AiZoneSuggestion`. Lapisan AI-assist klasifikasi/binding: LLM fallback
// paralel HANYA saat rule-based gagal, usulan sudah lolos validasi
// deterministik (anti-halusinasi + rentang wajar) di Python sebelum sampai
// ke sini — field ini TIDAK PERNAH dipakai sbg angka RAB final, murni
// kandidat menunggu review manusia. Detail: `SAYA.md` §1.1,
// `docs/plans/PAAX_ANALISA_RAB_DARI_GAMBAR_BIG_PLAN_2026-07-13.md` §X2.
export const AiDimensionSuggestionSchema = z.object({
  b_mm: z.number().nullish(),
  l_mm: z.number().nullish(),
  d_gali_mm: z.number().nullish(),
  confidence: z.number(),
  reasoning: z.string(),
  source_texts: z.array(z.string()).default([]),
  model: z.string(),
  generated_at: z.string(),
});
export const AiZoneSuggestionSchema = z.object({
  zone: z.string(),
  confidence: z.number(),
  reasoning: z.string(),
  model: z.string(),
  generated_at: z.string(),
});
export type AiDimensionSuggestion = z.infer<typeof AiDimensionSuggestionSchema>;
export type AiZoneSuggestion = z.infer<typeof AiZoneSuggestionSchema>;

// 2026-07-05 (lanjutan Fase X2) — mirror `AiDindingSuggestion`: dinding
// pasangan bata TIDAK PUNYA kode per-instance sama sekali (audit B0),
// usulan ini HANYA dari catatan teks eksplisit ttg panjang/tinggi dinding,
// bukan deteksi geometri garis gambar (di luar cakupan slice ini).
export const AiDindingSuggestionSchema = z.object({
  l_dinding_m: z.number().nullish(),
  h_dinding_m: z.number().nullish(),
  bukaan_total_m2: z.number().nullish(),
  plester_sisi: z.number().int().default(0),
  acian: z.boolean().default(false),
  cat: z.boolean().default(false),
  confidence: z.number(),
  reasoning: z.string(),
  source_texts: z.array(z.string()).default([]),
  model: z.string(),
  generated_at: z.string(),
});
export type AiDindingSuggestion = z.infer<typeof AiDindingSuggestionSchema>;

// 2026-07-05 (lanjutan Fase X2) — mirror `AiRoofFrameSuggestion`: rangka
// atap non-beton (gording/trekstang/ikatan_angin) SUDAH dikenali taksonomi
// tapi belum pernah dihitung (`app/tkg/takeoff.py` tidak punya cabang utk
// kategori ini). `fields` generik (bukan per-kategori terpisah) krn tiap
// kategori butuh set field numerik berbeda — lihat
// `app/perception/ai_assist/roof_frame_assist.py` utk field per kategori.
export const AiRoofFrameSuggestionSchema = z.object({
  kategori: z.string(),
  fields: z.record(z.number()).default({}),
  confidence: z.number(),
  reasoning: z.string(),
  source_texts: z.array(z.string()).default([]),
  model: z.string(),
  generated_at: z.string(),
});
export type AiRoofFrameSuggestion = z.infer<typeof AiRoofFrameSuggestionSchema>;

// 2026-07-05 (Task 02) - mirror `AiKudaKudaSuggestion`: rangka utama atap
// profil baja. `kg_per_m` wajib dari teks eksplisit gambar, bukan dari
// pengetahuan umum model.
export const AiKudaKudaSuggestionSchema = z.object({
  designation: z.string(),
  kg_per_m: z.number(),
  length_m: z.number(),
  qty: z.number().int(),
  confidence: z.number(),
  reasoning: z.string(),
  source_texts: z.array(z.string()).default([]),
  model: z.string(),
  generated_at: z.string(),
});
export type AiKudaKudaSuggestion = z.infer<typeof AiKudaKudaSuggestionSchema>;

// 2026-07-05 (Task 04) - mirror `AiArsitekturAreaSuggestion`: item
// arsitektur berbasis area/keliling tanpa kode per-instance.
export const AiArsitekturAreaSuggestionSchema = z.object({
  kategori: z.string(),
  fields: z.record(z.number()).default({}),
  confidence: z.number(),
  reasoning: z.string(),
  source_texts: z.array(z.string()).default([]),
  model: z.string(),
  generated_at: z.string(),
});
export type AiArsitekturAreaSuggestion = z.infer<typeof AiArsitekturAreaSuggestionSchema>;

// 2026-07-05 (lanjutan Fase X2) — mirror `AiKusenSuggestion`: SATU baris
// jadwal pintu/jendela. TIDAK PERNAH diikat ke kode asli gambar (kode tipe
// kusen spt "P1" sering bentrok dgn prefiks taksonomi lain seperti
// pondasi_telapak) — selalu entry sintetis berprefiks aman `KUSEN-AUTO-`.
export const AiKusenSuggestionSchema = z.object({
  tipe: z.string(),
  width_m: z.number().nullish(),
  height_m: z.number().nullish(),
  qty: z.number().int().nullish(),
  confidence: z.number(),
  reasoning: z.string(),
  source_texts: z.array(z.string()).default([]),
  model: z.string(),
  generated_at: z.string(),
});
export type AiKusenSuggestion = z.infer<typeof AiKusenSuggestionSchema>;

// 2026-07-05 (lanjutan Fase X2, slice TERAKHIR rangkaian dinding→atap→
// kusen→MEP) — mirror `AiMepSuggestion`: SATU jenis titik MEP (lampu/stop
// kontak/saklar/dll), HANYA dari catatan jumlah eksplisit di teks —
// deteksi simbol/ikon dari piksel TIDAK dicoba (vision-on-pixel tetap
// dihindari, `SAYA.md` §1.1).
export const AiMepSuggestionSchema = z.object({
  jenis: z.string(),
  count: z.number().int().nullish(),
  confidence: z.number(),
  reasoning: z.string(),
  source_texts: z.array(z.string()).default([]),
  model: z.string(),
  generated_at: z.string(),
});
export type AiMepSuggestion = z.infer<typeof AiMepSuggestionSchema>;

export const WbsDivisionSchema = z.object({
  code: z.string(),
  title: z.string(),
});
export const WorkItemSchema = z.object({
  work_id: z.string(),
  divisi: z.string(),
  work_type: z.string(),
  uraian_kanonik: z.string(),
  satuan: z.string(),
  asal: z.enum(["expanded", "implied", "derived"]).default("expanded"),
  rule_id: z.string(),
  rationale: z.string(),
  element_refs: z.array(z.string()).default([]),
  needs_review: z.boolean().default(false),
});
export const WorkItemsResultSchema = z.object({
  workitems: z.array(WorkItemSchema),
  warnings: z.array(z.string()).default([]),
});
export const ElementSeedSchema = z.object({
  element_id: z.string(),
  kind: z.enum(["beton", "dinding", "lantai", "atap"]),
  code: z.string(),
  length_m: z.number().nullish(),
  height_m: z.number().nullish(),
  wet_area: z.boolean().default(false),
});
export const WbsCompletenessRequestSchema = z.object({
  existing_divisions: z.array(z.string()).default([]),
  not_applicable: z.array(z.string()).default([]),
});
export const WbsCompletenessResultSchema = z.object({
  present_divisions: z.array(z.string()),
  missing_relevant: z.array(z.string()),
  not_applicable: z.array(z.string()),
  warnings: z.array(z.string()).default([]),
});
export const ImpliedRequestSchema = z.object({
  prj_id: z.string(),
  government_project: z.boolean().default(false),
  concrete_pour_volume_m3: z.number().nullish(),
  V_pompa_min: z.number().default(30.0),
});
export type WbsDivision = z.infer<typeof WbsDivisionSchema>;
export type WorkItem = z.infer<typeof WorkItemSchema>;
export type WorkItemsResult = z.infer<typeof WorkItemsResultSchema>;
export type ElementSeed = z.infer<typeof ElementSeedSchema>;
export type WbsCompletenessRequest = z.infer<typeof WbsCompletenessRequestSchema>;
export type WbsCompletenessResult = z.infer<typeof WbsCompletenessResultSchema>;
export type ImpliedRequest = z.infer<typeof ImpliedRequestSchema>;

export const AhspSearchRequestSchema = z.object({
  query: z.string(),
  unit: z.string().nullish(),
  top_k: z.number().int().default(5),
});
export const AhspCandidateSchema = z.object({
  ahsp_code: z.string(),
  name: z.string(),
  unit: z.string(),
  score: z.number(),
  unit_ok: z.boolean(),
  reason: z.string(),
});
export const AhspSearchResultSchema = z.object({
  candidates: z.array(AhspCandidateSchema),
});
export const WorkItemForMappingSchema = z.object({
  work_id: z.string(),
  uraian: z.string(),
  unit: z.string(),
  work_type: z.string().default(""),
});
export const AhspMapRequestSchema = z.object({
  workitem: WorkItemForMappingSchema,
  sibling_work_types: z.array(z.string()).default([]),
  top_k: z.number().int().default(5),
});
export const AhspMapResultSchema = z.object({
  work_id: z.string(),
  candidates: z.array(AhspCandidateSchema),
  warnings: z.array(z.string()).default([]),
});
export const PriceBindRequestSchema = z.object({
  ahsp_code: z.string(),
  region_code: z.string(),
});
export const PriceBindingLineSchema = z.object({
  resource_code: z.string(),
  coefficient: z.number(),
  has_price: z.boolean(),
  unit_price: z.number().nullish(),
});
export const PriceBindingResultSchema = z.object({
  ahsp_code: z.string(),
  region_code: z.string(),
  lines: z.array(PriceBindingLineSchema),
  missing_resources: z.array(z.string()),
  coverage_ratio: z.number(),
});
export type AhspSearchRequest = z.infer<typeof AhspSearchRequestSchema>;
export type AhspSearchResult = z.infer<typeof AhspSearchResultSchema>;
export type WorkItemForMapping = z.infer<typeof WorkItemForMappingSchema>;
export type AhspMapRequest = z.infer<typeof AhspMapRequestSchema>;
export type AhspMapResult = z.infer<typeof AhspMapResultSchema>;
export type PriceBindRequest = z.infer<typeof PriceBindRequestSchema>;
export type PriceBindingResult = z.infer<typeof PriceBindingResultSchema>;

// Brain audit primitives: ProjectContext, confidence, QA, BOE
export const ProjectContextSchema = z.object({
  prj_id: z.string(),
  mode: z.string(),
  tipe_bangunan: z.string().default(""),
  wilayah: z.string().default(""),
  periode_harga: z.string().default(""),
  ahsp_edisi: z.string().default(""),
  precedence_order: z.array(z.string()).default([]),
  param_snapshot: z.record(z.string(), z.unknown()).default({}),
  disclaimer_flags: z.array(z.string()).default([]),
});
export type ProjectContext = z.infer<typeof ProjectContextSchema>;

export const BrainParamSnapshotSchema = z.object({
  values: z.record(z.string(), z.unknown()).default({}),
  sources: z.record(z.string(), z.string()).default({}),
});
export const BrainAssumptionSchema = z.object({
  id: z.string(),
  kategori: z.string(),
  deskripsi: z.string(),
  param_ref: z.string().nullish(),
  sumber: z.string().default(""),
  dampak: z.string().default(""),
  objek_ref: z.string().nullish(),
});
export const BrainWarningSchema = z.object({
  kode: z.string(),
  pesan: z.string(),
  objek_ref: z.string().nullish(),
  severity: z.string().default("warning"),
});
export const BrainReviewTaskSchema = z.object({
  id: z.string(),
  target_ref: z.string(),
  alasan: z.array(z.string()),
  prioritas: z.number(),
  status: z.string().default("open"),
});
export const ConfidenceResultSchema = z.object({
  method: z.string(),
  s_source: z.number(),
  s_corrob: z.number(),
  s_quality: z.number(),
  confidence: z.number(),
  needs_review: z.boolean(),
  reasons: z.array(z.string()).default([]),
});
export const ConfidenceRequestSchema = z.object({
  method: z.string(),
  quality_score: z.number(),
  corroborations: z.number().int().default(0),
  conflicts: z.number().int().default(0),
  critical: z.boolean().default(false),
  weights: z.record(z.string(), z.number()).nullish(),
  ambang_conf: z.number().default(0.7),
});
export type ConfidenceRequest = z.infer<typeof ConfidenceRequestSchema>;
export type ConfidenceResult = z.infer<typeof ConfidenceResultSchema>;

export const QaIssueSchema = z.object({
  code: z.string(),
  message: z.string(),
  severity: z.string().default("error"),
  objek_ref: z.string().nullish(),
});
export const QaRequestSchema = z.object({
  weights_pct: z.array(z.number()).default([]),
  tol_bobot: z.number().default(0.1),
  price_coverage_ratio: z.number().nullish(),
  work_ids: z.array(z.string()).default([]),
  unit_pairs: z.array(z.record(z.string(), z.string())).default([]),
  revision_ids: z.array(z.string()).default([]),
  sanity_checks: z.array(z.record(z.string(), z.unknown())).default([]),
  boe_exists: z.boolean().default(true),
});
export const QaResultSchema = z.object({
  passed: z.boolean(),
  issues: z.array(QaIssueSchema).default([]),
});
export type QaRequest = z.infer<typeof QaRequestSchema>;
export type QaResult = z.infer<typeof QaResultSchema>;

export const BrainBoeRequestSchema = z.object({
  project_context: ProjectContextSchema,
  param_snapshot: BrainParamSnapshotSchema.default({ values: {}, sources: {} }),
  assumptions: z.array(BrainAssumptionSchema).default([]),
  missing: z.array(z.string()).default([]),
  warnings: z.array(BrainWarningSchema).default([]),
  data_coverage_summary: z.record(z.string(), z.unknown()).default({}),
});
export const BrainBoeSchema = z.object({
  project_context: ProjectContextSchema,
  assumptions: z.array(BrainAssumptionSchema),
  missing: z.array(z.string()),
  warnings: z.array(BrainWarningSchema),
  param_snapshot: BrainParamSnapshotSchema,
  data_coverage_summary: z.record(z.string(), z.unknown()).default({}),
});
export type BrainBoeRequest = z.infer<typeof BrainBoeRequestSchema>;
export type BrainBoe = z.infer<typeof BrainBoeSchema>;

export const ReviewTargetTypeEnum = z.enum(["work_item", "element", "evidence", "boe", "tkg", "rab"]);
export const ReviewCandidateSchema = z.object({
  target_ref: z.string(),
  target_type: ReviewTargetTypeEnum.default("work_item"),
  impact_score: z.number().min(0).max(1),
  uncertainty_score: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1).nullish(),
  cost_rank_pct: z.number().min(0).max(1).nullish(),
  p_pareto: z.number().min(0).max(1).nullish(),
  corroborations: z.number().int().default(0),
  implied_high_impact: z.boolean().default(false),
  precedence_conflict: z.boolean().default(false),
});
export const ReviewTaskAuditSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  target_ref: z.string(),
  target_type: ReviewTargetTypeEnum,
  reasons: z.array(z.string()),
  priority: z.number(),
  impact_score: z.number(),
  uncertainty_score: z.number(),
  status: z.enum(["open", "in_progress", "resolved", "dismissed"]).default("open"),
});
export const ReviewTriageRequestSchema = z.object({
  project_id: z.string(),
  ambang_conf: z.number().min(0).max(1).default(0.7),
  candidates: z.array(ReviewCandidateSchema).default([]),
});
export const ReviewTriageResultSchema = z.object({
  project_id: z.string(),
  tasks: z.array(ReviewTaskAuditSchema),
});
export const CorrectionLogRequestSchema = z.object({
  project_id: z.string(),
  target_ref: z.string(),
  field: z.string(),
  old: z.unknown().nullish(),
  new: z.unknown().nullish(),
  reason: z.string(),
  user: z.string(),
  timestamp: z.string().nullish(),
});
export const CorrectionRecordSchema = CorrectionLogRequestSchema.extend({
  id: z.string(),
  timestamp: z.string(),
});
export type ReviewCandidate = z.infer<typeof ReviewCandidateSchema>;
export type ReviewTaskAudit = z.infer<typeof ReviewTaskAuditSchema>;
export type ReviewTriageRequest = z.input<typeof ReviewTriageRequestSchema>;
export type ReviewTriageResult = z.infer<typeof ReviewTriageResultSchema>;
export type CorrectionLogRequest = z.input<typeof CorrectionLogRequestSchema>;
export type CorrectionRecord = z.infer<typeof CorrectionRecordSchema>;

export const EvalCaseSchema = z.object({
  id: z.string(),
  actual: z.number().nullish(),
  expected: z.number().nullish(),
  tolerance: z.number().min(0).default(0),
  actual_json: z.unknown().nullish(),
  expected_json: z.unknown().nullish(),
});
export const EvalRunRequestSchema = z.object({
  cases: z.array(EvalCaseSchema).default([]),
});
export const EvalCaseResultSchema = z.object({
  id: z.string(),
  passed: z.boolean(),
  delta: z.number().nullish(),
  reason: z.string(),
});
export const EvalRunResultSchema = z.object({
  results: z.array(EvalCaseResultSchema),
  summary: z.object({
    total: z.number().int(),
    passed: z.number().int(),
    failed: z.number().int(),
  }),
});
export type EvalCase = z.infer<typeof EvalCaseSchema>;
export type EvalRunRequest = z.input<typeof EvalRunRequestSchema>;
export type EvalRunResult = z.infer<typeof EvalRunResultSchema>;

export const BoeExportPayloadSchema = z.object({
  format: z.literal("json"),
  kind: z.literal("boe"),
  boe: BrainBoeSchema,
});
export const BbsExportPayloadSchema = z.object({
  format: z.literal("json"),
  kind: z.literal("bbs"),
  bbs: BbsResultSchema,
});
export type BoeExportPayload = z.infer<typeof BoeExportPayloadSchema>;
export type BbsExportPayload = z.infer<typeof BbsExportPayloadSchema>;

export const RABSection = z.object({
  code: z.string(),
  title: z.string(),
  lines: z.array(RABLine),
  subtotal: z.number(),
  weight_pct: z.number(),
});
export type RABSection = z.infer<typeof RABSection>;

export const SectionedRABResult = z.object({
  region: z.string(),
  region_code: z.string(),
  sections: z.array(RABSection),
  subtotal: z.number(),
  ppn_rate: z.number(),
  ppn: z.number(),
  total: z.number(),
});
export type SectionedRABResult = z.infer<typeof SectionedRABResult>;
