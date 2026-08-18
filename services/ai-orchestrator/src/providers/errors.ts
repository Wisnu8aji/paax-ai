export type ProviderErrorCode =
  | "provider_unavailable"
  | "provider_auth_failed"
  | "provider_configuration_invalid"
  | "provider_transport_unavailable"
  | "provider_response_invalid"
  | "provider_request_failed";

const SAFE_MESSAGE = /^[A-Za-z0-9][A-Za-z0-9 ._:-]{0,240}$/;

function safeMessage(value: string): string {
  const normalized = value.replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]").replace(/(api[_-]?key|secret|token|password)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]");
  return SAFE_MESSAGE.test(normalized) ? normalized : "provider request failed";
}

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly attempt?: number;

  constructor(code: ProviderErrorCode, message: string, status: number, retryable: boolean, attempt?: number) {
    super(safeMessage(message));
    this.name = "ProviderError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.attempt = attempt;
  }
}

export function providerErrorForStatus(status: number): ProviderError {
  if (status === 401 || status === 403) return new ProviderError("provider_auth_failed", "provider authentication failed", status, false);
  if (status === 408 || status === 429 || status >= 500) return new ProviderError("provider_unavailable", "provider is temporarily unavailable", status, true);
  return new ProviderError("provider_request_failed", "provider request failed", status, false);
}
