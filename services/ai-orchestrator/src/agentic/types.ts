export type AgentRunStatus = 'planned' | 'running' | 'waiting_approval' | 'completed' | 'failed' | 'cancelled';
export type AgentTaskStatus = 'pending' | 'ready' | 'running' | 'blocked' | 'completed' | 'failed';

export interface ProjectContextBinding {
  tenantId: string;
  projectId: string;
  snapshotId?: string;
  documentRevisionId?: string;
  actorId: string;
  conversationId: string;
  allowedToolScopes: string[];
  issuedAt: string;
}

export interface AgentTask {
  id: string;
  title: string;
  capability: string;
  dependencies: string[];
  status: AgentTaskStatus;
  requiresApproval?: boolean;
}

export interface AgentPlan {
  planId: string;
  version: number;
  goal: string;
  binding: ProjectContextBinding;
  tasks: AgentTask[];
  stopConditions: string[];
}

export interface AgentRun {
  runId: string;
  plan: AgentPlan;
  status: AgentRunStatus;
  currentTaskId?: string;
  completedTaskIds: string[];
  failure?: string;
}
