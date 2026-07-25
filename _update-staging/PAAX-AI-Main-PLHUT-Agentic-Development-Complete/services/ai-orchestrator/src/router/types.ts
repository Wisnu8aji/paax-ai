/**
 * Runtime contracts — Fase 1, PLAN.md §7/§9 Fase 1
 * (skill command-room-intelligence PLAN.md).
 *
 * Skema di file ini persis blueprint §16 (G:\Skill\Blueprint skill.txt) --
 * PLAN.md §10 eksplisit tidak merevisi isi skema itu, hanya wujud teknisnya
 * (modul TypeScript di sini, bukan runtime agent -- lihat PLAN.md §1).
 *
 * Ini murni tipe data + konstanta enum. Belum ada logika Capability Router /
 * Intent Architect / Task Planner (itu Fase 3) -- file ini hanya mendefinisikan
 * "bahasa" yang dipakai bersama semua modul runtime supaya mereka bisa saling
 * lempar data dengan bentuk yang konsisten sejak awal, bukan diselaraskan belakangan.
 */

// ─── Plan depth (blueprint §5) ─────────────────────────────────────────────

export type PlanDepth = "direct" | "compact" | "structured" | "controlled";

// ─── Memory scope (blueprint §9.2) ─────────────────────────────────────────

export type MemoryScope = "global_user" | "organization" | "project" | "module" | "conversation" | "temporary_run";

// ─── Intent Frame (blueprint §6.2) ─────────────────────────────────────────

export interface IntentFrame {
  literal_request: string;
  objective: string;
  deliverable: string;
  scope: string;
  constraints: string[];
  context_required: string[];
  assumptions: string[];
  ambiguity: "low" | "medium" | "high";
  risk: "low" | "medium" | "high";
  plan_depth: PlanDepth;
}

// ─── Context Pack (blueprint §6.3 + §16) ───────────────────────────────────

export interface ContextEvidence {
  type: string;
  content: string;
  source: string;
  confidence: number;
}

export interface ContextPack {
  scope: MemoryScope;
  project_id?: string;
  user_context: Record<string, unknown>;
  project_context: Record<string, unknown>;
  memory_evidence: ContextEvidence[];
  file_evidence: ContextEvidence[];
  module_evidence: ContextEvidence[];
  conflicts: string[];
  missing: string[];
}

// ─── Execution Plan (blueprint §6.4 + §16) ─────────────────────────────────

export interface ExecutionStep {
  id: string;
  action: string;
  skill?: string;
  tool?: string;
  depends_on?: string[];
  output?: string;
}

export interface ExecutionPlan {
  goal: string;
  steps: ExecutionStep[];
  dependencies: string[];
  tools: string[];
  approval_points: string[];
  verification_rules: string[];
  completion_criteria: string[];
}

// ─── Skill Selection (blueprint §6.1 + §16) ────────────────────────────────

export interface SkillSelection {
  process_skills: string[];
  context_skills: string[];
  domain_skills: string[];
  artifact_skills: string[];
  verification_skills: string[];
  reason: string;
  confidence: number;
}

// ─── Verification Report / Evidence Gate (blueprint §6.6 + §16) ───────────

export type VerificationStatus =
  | "verified"
  | "partially_verified"
  | "inferred"
  | "unclear"
  | "conflicting"
  | "manual_review_required"
  | "not_available";

export interface VerificationClaim {
  claim: string;
  status: VerificationStatus;
  source_tool?: string;
  source_ref?: string;
}

export interface VerificationReport {
  status: VerificationStatus;
  claims: VerificationClaim[];
  sources: string[];
  conflicts: string[];
  uncertainties: string[];
  manual_review_required: boolean;
}

// ─── Memory Candidate (blueprint §6.8 + §9.5 provenance) ──────────────────

export type MemoryCandidateType = "decision" | "preference" | "constraint" | "correction" | "fact" | "open_task" | "artifact_reference";

export interface MemoryCandidate {
  type: MemoryCandidateType;
  scope: MemoryScope;
  content: string;
  entities: string[];
  importance: number;
  confidence: number;
  source_ids: string[];
  supersedes: string | null;
}

// ─── Run Preflight (PLAN.md §3 -- tambahan, tidak ada di blueprint §16) ────
// Blueprint menyebut "Run Preflight" di diagram alur §4 tapi tidak menjabarkan
// bentuk datanya. PLAN.md §3 menjadikannya modul eksplisit pertama sebelum
// Capability Router -- ini kontraknya.

export interface RunPreflightResult {
  run_id?: string;
  conversation_id?: string;
  project_id?: string;
  model_alias: "lucent" | "arete" | "noir";
  provider_ready: boolean;
  attachments: string[];
}
