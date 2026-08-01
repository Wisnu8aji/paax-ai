import type { ProjectContextBinding } from './types';

export interface ToolDefinition {
  toolName: string;
  description: string;
  riskTier: 'low' | 'medium' | 'high' | 'critical';
  requiresApproval: boolean;
  handler: (input: unknown, binding: ProjectContextBinding) => Promise<unknown>;
}

export class ScopedToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.toolName)) {
      throw new Error(`Duplicate tool registration rejected: ${tool.toolName}`);
    }
    this.tools.set(tool.toolName, tool);
  }

  get(toolName: string): ToolDefinition {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Arbitrary/unregistered tool rejected: ${toolName}`);
    }
    return tool;
  }

  has(toolName: string): boolean {
    return this.tools.has(toolName);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  async execute(
    toolName: string,
    input: unknown,
    binding: ProjectContextBinding
  ): Promise<unknown> {
    const tool = this.get(toolName);
    if (!binding || !binding.projectId) {
      throw new Error('Tool execution rejected: missing required project binding');
    }
    return await tool.handler(input, binding);
  }
}

export function createDefaultScopedToolRegistry(): ScopedToolRegistry {
  const registry = new ScopedToolRegistry();

  registry.register({
    toolName: 'project_graph.read_active_sheet',
    description: 'Read sheet semantic profile and evidence for active sheet in project.',
    riskTier: 'low',
    requiresApproval: false,
    handler: async (input: unknown, binding: ProjectContextBinding) => {
      const payload = (input as Record<string, unknown>) ?? {};
      if (payload.projectId && payload.projectId !== binding.projectId) {
        throw new Error(`Project binding mismatch: expected ${binding.projectId}, got ${payload.projectId}`);
      }
      return {
        projectId: binding.projectId,
        activeSheetId: payload.sheetId ?? 'active-sheet-001',
        status: 'read_success',
      };
    },
  });

  registry.register({
    toolName: 'drawing.review_proposal',
    description: 'Write an advisory recommendation for human review; never resolve a proposal.',
    riskTier: 'medium',
    requiresApproval: true,
    handler: async (input: unknown, binding: ProjectContextBinding) => {
      const payload = (input as Record<string, unknown>) ?? {};
      if (payload.projectId && payload.projectId !== binding.projectId) {
        throw new Error(`Project binding mismatch: expected ${binding.projectId}, got ${payload.projectId}`);
      }
      const proposalId = String(payload.proposalId ?? '').trim();
      if (!proposalId) throw new Error('proposalId is required for human review recommendation');
      const decision = payload.decision === 'reject' ? 'recommend_reject' : payload.decision === 'approve' ? 'recommend_accept' : 'needs_human_review';
      return { projectId: binding.projectId, proposalId, recommendation: decision, status: 'pending_human_review' };
    },
  });

  return registry;
}
