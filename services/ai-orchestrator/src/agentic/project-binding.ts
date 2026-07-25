import type { ProjectContextBinding } from './types';

export class ProjectBindingError extends Error {}

export function validateProjectBinding(binding: ProjectContextBinding): ProjectContextBinding {
  const required: Array<keyof ProjectContextBinding> = ['tenantId','projectId','actorId','conversationId','issuedAt'];
  for (const key of required) if (!String(binding[key] ?? '').trim()) throw new ProjectBindingError(`missing project binding field: ${key}`);
  if (!Array.isArray(binding.allowedToolScopes)) throw new ProjectBindingError('allowedToolScopes must be an array');
  if (Number.isNaN(Date.parse(binding.issuedAt))) throw new ProjectBindingError('issuedAt must be ISO-8601');
  return Object.freeze({ ...binding, allowedToolScopes: Object.freeze([...new Set(binding.allowedToolScopes)]) as unknown as string[] });
}

export function assertSameProject(binding: ProjectContextBinding, requestedProjectId?: string): void {
  if (!requestedProjectId || requestedProjectId !== binding.projectId) {
    throw new ProjectBindingError(`project scope mismatch: bound=${binding.projectId}, requested=${requestedProjectId ?? 'none'}`);
  }
}

export function assertToolScope(binding: ProjectContextBinding, scope: string): void {
  if (!binding.allowedToolScopes.includes(scope)) throw new ProjectBindingError(`tool scope not permitted: ${scope}`);
}
