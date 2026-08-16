const SECRET_KEY = /(^|[_-])(api[-_]?key|access[-_]?key|secret|token|password|passwd|cookie|authorization|credential|private[-_]?key|client[-_]?secret|refresh[-_]?token)($|[_-])/i;
const SECRET_VALUE = /bearer\s+[a-z0-9._~+/=-]+|-----begin(?: rsa| ec| openpgp)? private key-----[\s\S]*?-----end(?: rsa| ec| openpgp)? private key-----/i;

function capString(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 1))}…`;
}

function redact(value: unknown, maxChars: number, key?: string): unknown {
  if (key && SECRET_KEY.test(key)) return undefined;
  if (typeof value === "string") {
    if (SECRET_VALUE.test(value)) return "[redacted]";
    return capString(value, maxChars);
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => redact(item, maxChars))
      .filter((item) => item !== undefined);
  }
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      const safeValue = redact(childValue, maxChars, childKey);
      if (safeValue !== undefined) output[childKey] = safeValue;
    }
    return output;
  }
  return value;
}

export function redactWorkPayload(value: unknown, maxChars = 4_000): unknown {
  const bounded = Number.isFinite(maxChars) && maxChars > 0 ? Math.floor(maxChars) : 4_000;
  return redact(value, bounded);
}
