import { createHash } from 'node:crypto';

export type IdempotencyClaimStatus = 'new' | 'replay' | 'conflict';

export interface IdempotencyRecord {
  key: string;
  inputHash: string;
  outputHash?: string;
  output?: unknown;
  createdAt: string;
}

export interface IdempotencyClaim {
  status: IdempotencyClaimStatus;
  record?: IdempotencyRecord;
  storedResult?: unknown;
}

export function hashPayload(payload: unknown): string {
  const canonical = JSON.stringify(payload ?? null, Object.keys(payload && typeof payload === 'object' ? payload : {}).sort());
  return createHash('sha256').update(canonical).digest('hex');
}

export class IdempotencyRegistry {
  private readonly records = new Map<string, IdempotencyRecord>();

  claim(key: string, inputHash: string): IdempotencyClaim {
    if (!key || !key.trim()) {
      throw new Error('idempotency key cannot be empty');
    }
    const existing = this.records.get(key);
    if (!existing) {
      const record: IdempotencyRecord = {
        key,
        inputHash,
        createdAt: new Date().toISOString(),
      };
      this.records.set(key, record);
      return { status: 'new', record };
    }

    if (existing.inputHash === inputHash) {
      return {
        status: 'replay',
        record: existing,
        storedResult: existing.output,
      };
    }

    return { status: 'conflict' };
  }

  complete(key: string, output: unknown): void {
    const record = this.records.get(key);
    if (!record) {
      throw new Error(`cannot complete unregistered idempotency key: ${key}`);
    }
    record.output = output;
    record.outputHash = hashPayload(output);
  }

  get(key: string): IdempotencyRecord | undefined {
    return this.records.get(key);
  }
}
