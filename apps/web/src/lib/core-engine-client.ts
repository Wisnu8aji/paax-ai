/**
 * PAAX Core Engine — base URL & error type.
 *
 * Hanya konfigurasi koneksi yang dipakai bersama oleh helper engine (lihat
 * `engine.ts`). Kontrak endpoint v0.6 yang sebenarnya (HSP/RAB/Kurva S)
 * didefinisikan di `engine.ts` + divalidasi Zod via `@paax/schemas`.
 *
 * Aturan emas: frontend tidak pernah menghitung angka RAB/HSP/Kurva S —
 * semuanya berasal dari services/core-engine.
 */
export const CORE_ENGINE_URL =
  process.env.NEXT_PUBLIC_CORE_ENGINE_URL || 'http://127.0.0.1:8081';

export class CoreEngineError extends Error {
  constructor(public message: string, public status?: number, public data?: unknown) {
    super(message);
    this.name = 'CoreEngineError';
  }
}
