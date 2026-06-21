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
