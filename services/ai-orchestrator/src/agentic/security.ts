import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ProjectContextBinding } from './types';

export interface SignedProjectBinding { binding: ProjectContextBinding; signature: string; }

function canonical(binding: ProjectContextBinding): string {
  return JSON.stringify({
    tenantId: binding.tenantId, projectId: binding.projectId, snapshotId: binding.snapshotId ?? '',
    documentRevisionId: binding.documentRevisionId ?? '', actorId: binding.actorId,
    conversationId: binding.conversationId, allowedToolScopes: [...binding.allowedToolScopes].sort(), issuedAt: binding.issuedAt,
  });
}

export function signProjectBinding(binding: ProjectContextBinding, secret: string): SignedProjectBinding {
  if (secret.length < 24) throw new Error('binding secret must be at least 24 characters');
  return { binding, signature: createHmac('sha256', secret).update(canonical(binding)).digest('hex') };
}

export function verifySignedProjectBinding(signed: SignedProjectBinding, secret: string, maxAgeMs = 60 * 60_000): ProjectContextBinding {
  const expected = createHmac('sha256', secret).update(canonical(signed.binding)).digest('hex');
  const a = Uint8Array.from(Buffer.from(expected)), b = Uint8Array.from(Buffer.from(signed.signature));
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('project binding signature is invalid');
  const issued = Date.parse(signed.binding.issuedAt);
  if (!Number.isFinite(issued) || Date.now() - issued > maxAgeMs || issued > Date.now() + 60_000) throw new Error('project binding is expired or invalid');
  return signed.binding;
}

const INJECTION = [/ignore (all|previous|prior) instructions/i, /system prompt/i, /bypass (approval|policy|security)/i, /reveal (secret|token|password|key)/i];
export function scanUntrustedContent(text: string): string[] { return INJECTION.filter((p) => p.test(text)).map((p) => p.source); }
