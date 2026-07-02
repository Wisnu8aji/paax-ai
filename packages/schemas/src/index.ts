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
  "balok", "ring_balok", "latei", "plat", "tangga", "kuda_kuda", "gording",
  "ikatan_angin", "trekstang", "lain",
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

// ─── Manual Takeoff arsitektur/tanah (selaras app/takeoff/*) ─────────────────
// Brain §E (dinding/finishing), §F (tanah), §G (pondasi batu/lantai/atap).

export const TanahParamsSchema = z.object({
  w_kerja: z.number().default(0.3),
  f_gembur: z.number().default(1.2),
  f_susut: z.number().default(1.1),
  kap_truk: z.number().default(4.0),
});
export type TanahParams = z.infer<typeof TanahParamsSchema>;

export const DindingParamsSchema = z.object({
  deduct_mode: z.enum(["all", "threshold"]).default("all"),
  deduct_threshold: z.number().default(0.0),
  n_lapis_cat: z.number().int().default(1),
});
export type DindingParams = z.infer<typeof DindingParamsSchema>;

export const ArsitekturParamsSchema = z.object({}).strict();
export type ArsitekturParams = z.infer<typeof ArsitekturParamsSchema>;

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
  domain: z.enum(["tanah", "dinding", "arsitektur"]),
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
export const TanahRequestSchema = z.object({
  footplats: z.array(GalianFootplatSchema).default([]),
  galian_menerus: z.array(GalianMenerusSchema).default([]),
  urugan: z.array(UruganLapisSchema).default([]),
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
export const DindingRequestSchema = z.object({
  dinding: z.array(DindingBidangSchema).default([]),
  screed: z.array(ScreedBidangSchema).default([]),
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
export const ArsitekturRequestSchema = z.object({
  pondasi_batu: z.array(PondasiBatuSchema).default([]),
  lantai: z.array(PenutupLantaiSchema).default([]),
  atap: z.array(AtapMiringSchema).default([]),
  params: ArsitekturParamsSchema.default({}),
});
export type ArsitekturRequest = z.infer<typeof ArsitekturRequestSchema>;

// ─── RAB tersektor / WBS (selaras app/rab/sections.py) ───────────────────────

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
