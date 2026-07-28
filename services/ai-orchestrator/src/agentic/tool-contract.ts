import type { ProjectContextBinding } from './types';
import { assertSameProject, assertToolScope } from './project-binding';

export interface AgentApprovalToken {
  tokenId: string;
  projectId: string;
  toolName: string;
  approvedBy: string;
  expiresAt: string;
}

export interface AgentToolContract<Input, Output> {
  name: string;
  scope: string;
  sideEffect: 'none' | 'draft' | 'reversible_write' | 'authoritative_write';
  timeoutMs: number;
  execute(input: Input, binding: ProjectContextBinding): Promise<Output> | Output;
}

export class AgentToolRegistry {
  private readonly tools = new Map<string, AgentToolContract<unknown, unknown>>();

  register<I, O>(tool: AgentToolContract<I, O>): void {
    if (this.tools.has(tool.name)) throw new Error(`duplicate tool: ${tool.name}`);
    if (!Number.isFinite(tool.timeoutMs) || tool.timeoutMs <= 0) throw new Error(`invalid timeout: ${tool.name}`);
    this.tools.set(tool.name, tool as AgentToolContract<unknown, unknown>);
  }

  list(): string[] { return [...this.tools.keys()].sort(); }

  describe(name: string): Pick<AgentToolContract<unknown, unknown>, 'name' | 'scope' | 'sideEffect' | 'timeoutMs'> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`unknown tool: ${name}`);
    return { name: tool.name, scope: tool.scope, sideEffect: tool.sideEffect, timeoutMs: tool.timeoutMs };
  }

  async execute<I extends { projectId?: string }, O>(
    name: string,
    input: I,
    binding: ProjectContextBinding,
    approval?: AgentApprovalToken,
  ): Promise<O> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`unknown tool: ${name}`);
    assertSameProject(binding, input.projectId);
    assertToolScope(binding, tool.scope);
    if (tool.sideEffect === 'authoritative_write') this.assertApproval(approval, binding, name);
    const execution = Promise.resolve(tool.execute(input, binding));
    const timeout = new Promise<never>((_, reject) => {
      const handle = setTimeout(() => reject(new Error(`tool timeout: ${name}`)), tool.timeoutMs);
      execution.finally(() => clearTimeout(handle)).catch(() => undefined);
    });
    return await Promise.race([execution, timeout]) as O;
  }

  private assertApproval(token: AgentApprovalToken | undefined, binding: ProjectContextBinding, toolName: string): void {
    if (!token) throw new Error(`authoritative write requires an approval token: ${toolName}`);
    if (token.projectId !== binding.projectId || token.toolName !== toolName) throw new Error(`approval scope mismatch: ${toolName}`);
    if (!token.approvedBy.trim() || Number.isNaN(Date.parse(token.expiresAt)) || Date.parse(token.expiresAt) <= Date.now()) {
      throw new Error(`approval token is invalid or expired: ${toolName}`);
    }
  }
}
