import { z } from "zod";
import {
  UserSchema,
  OrganizationSchema,
  ProjectSchema,
  ProjectFileSchema,
  DrawingPageSchema,
  DrawingExtractionSchema,
  DrawingElementSchema,
  RABItemSchema,
  RABVersionSchema,
  BOQItemSchema,
  HSPItemSchema,
  PriceComponentSchema,
  QuantityCandidateSchema,
  VerifiedDrawingQuantitySchema,
  BoqDraftItemSchema,
  DrawingWarningSchema,
  DrawingAnalysisResultSchema,
  DrawingToRabContextSchema,
  DocumentIntelligenceHealthSchema,
  ScheduleTaskSchema,
  ScheduleVersionSchema,
  WarningSchema,
  AssumptionSchema,
  EvidenceSchema,
  ExportJobSchema,
  ChatThreadSchema,
  ChatMessageSchema,
  SiteLogSchema,
  UsageLogSchema,
  ToolActionSchema,
  ApprovalRequestSchema,
  // Enums
  ProjectStatusEnum,
  RABStatusEnum,
  FileTypeEnum,
  WarningLevelEnum,
  DrawingTypeEnum,
  DrawingCandidateStatusEnum,
  ScheduleStatusEnum,
  ExportFormatEnum,
  ChatModeEnum,
  ApprovalStatusEnum,
  CurrencyEnum,
  UnitEnum,
  RoleEnum,
} from "@paax/schemas";

// ─── Core Types ──────────────────────────────────────────────────────────────

export type User = z.infer<typeof UserSchema>;
export type Organization = z.infer<typeof OrganizationSchema>;

// ─── Project Types ───────────────────────────────────────────────────────────

export type Project = z.infer<typeof ProjectSchema>;
export type ProjectFile = z.infer<typeof ProjectFileSchema>;

// ─── Drawing Types ───────────────────────────────────────────────────────────

export type DrawingPage = z.infer<typeof DrawingPageSchema>;
export type DrawingExtraction = z.infer<typeof DrawingExtractionSchema>;
export type DrawingElement = z.infer<typeof DrawingElementSchema>;
export type QuantityCandidate = z.infer<typeof QuantityCandidateSchema>;
export type VerifiedDrawingQuantity = z.infer<typeof VerifiedDrawingQuantitySchema>;
export type BoqDraftItem = z.infer<typeof BoqDraftItemSchema>;
export type DrawingWarning = z.infer<typeof DrawingWarningSchema>;
export type DrawingAnalysisResult = z.infer<typeof DrawingAnalysisResultSchema>;
export type DrawingToRabContext = z.infer<typeof DrawingToRabContextSchema>;
export type DocumentIntelligenceHealth = z.infer<typeof DocumentIntelligenceHealthSchema>;

// ─── Cost Estimation Types ───────────────────────────────────────────────────

export type RABItem = z.infer<typeof RABItemSchema>;
export type RABVersion = z.infer<typeof RABVersionSchema>;
export type BOQItem = z.infer<typeof BOQItemSchema>;
export type HSPItem = z.infer<typeof HSPItemSchema>;
export type PriceComponent = z.infer<typeof PriceComponentSchema>;

// ─── Schedule Types ──────────────────────────────────────────────────────────

export type ScheduleTask = z.infer<typeof ScheduleTaskSchema>;
export type ScheduleVersion = z.infer<typeof ScheduleVersionSchema>;

// ─── AI & Warning Types ──────────────────────────────────────────────────────

export type Warning = z.infer<typeof WarningSchema>;
export type Assumption = z.infer<typeof AssumptionSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;

// ─── Export Types ────────────────────────────────────────────────────────────

export type ExportJob = z.infer<typeof ExportJobSchema>;

// ─── Chat Types ──────────────────────────────────────────────────────────────

export type ChatThread = z.infer<typeof ChatThreadSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

// ─── Operations Types ────────────────────────────────────────────────────────

export type SiteLog = z.infer<typeof SiteLogSchema>;
export type UsageLog = z.infer<typeof UsageLogSchema>;
export type ToolAction = z.infer<typeof ToolActionSchema>;
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

// ─── Enum Types ──────────────────────────────────────────────────────────────

export type ProjectStatus = z.infer<typeof ProjectStatusEnum>;
export type RABStatus = z.infer<typeof RABStatusEnum>;
export type FileType = z.infer<typeof FileTypeEnum>;
export type WarningLevel = z.infer<typeof WarningLevelEnum>;
export type DrawingType = z.infer<typeof DrawingTypeEnum>;
export type DrawingCandidateStatus = z.infer<typeof DrawingCandidateStatusEnum>;
export type ScheduleStatus = z.infer<typeof ScheduleStatusEnum>;
export type ExportFormat = z.infer<typeof ExportFormatEnum>;
export type ChatMode = z.infer<typeof ChatModeEnum>;
export type ApprovalStatus = z.infer<typeof ApprovalStatusEnum>;
export type Currency = z.infer<typeof CurrencyEnum>;
export type Unit = z.infer<typeof UnitEnum>;
export type Role = z.infer<typeof RoleEnum>;

// ─── Utility Types ───────────────────────────────────────────────────────────

/** A type with `id` omitted — for creation payloads */
export type CreatePayload<T extends { id: string }> = Omit<
  T,
  "id" | "createdAt" | "updatedAt"
>;

/** Partial update payload — all fields optional except id */
export type UpdatePayload<T extends { id: string }> = Partial<T> &
  Pick<T, "id">;

/** Paginated response wrapper */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** API error response */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
}
