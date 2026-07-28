import type { AgentPlan, ProjectContextBinding } from './types';

export type MatureRunStatus =
  | 'queued' | 'planning' | 'running' | 'waiting_tool' | 'waiting_approval'
  | 'blocked' | 'paused' | 'failed' | 'completed' | 'cancelled';

export interface GoalSpec {
  goalId: string;
  request: string;
  constraints: string[];
  deliverables: string[];
  assumptions: string[];
  riskTier: 'low' | 'medium' | 'high' | 'critical';
  completionCriteria: string[];
  binding: ProjectContextBinding;
}

export interface ToolInvocationRecord {
  invocationId: string;
  taskId: string;
  toolName: string;
  input: unknown;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'timed_out';
  startedAt?: string;
  completedAt?: string;
  output?: unknown;
  error?: string;
  idempotencyKey?: string;
}

export interface AgentObservation {
  observationId: string;
  taskId: string;
  source: 'tool' | 'human' | 'event' | 'engine';
  summary: string;
  evidenceRefs: string[];
  createdAt: string;
}

export interface AgentArtifact {
  artifactId: string;
  artifactType: string;
  title: string;
  status: 'draft' | 'verified' | 'approved' | 'stale';
  evidenceRefs: string[];
  payload: unknown;
}

export interface MatureAgentRun {
  runId: string;
  goalSpec: GoalSpec;
  plan: AgentPlan;
  status: MatureRunStatus;
  activeTaskId?: string;
  completedTaskIds: string[];
  failedTaskIds: string[];
  invocations: ToolInvocationRecord[];
  observations: AgentObservation[];
  artifacts: AgentArtifact[];
  pendingApprovalIds: string[];
  branchOfRunId?: string;
  replayOfRunId?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  failure?: string;
  budget?: { maxToolCalls: number; maxTokens: number; maxCostUsd: number; maxDurationMs: number };
  budgetUsage?: { toolCalls: number; tokens: number; costUsd: number; startedAtMs: number };
  auditTimeline?: Array<{ eventId: string; type: string; message: string; createdAt: string; data?: unknown }>;
}
