import { rateLimit, type RateLimitRequestHandler } from 'express-rate-limit';
import type { ApiFailure } from '@fractachain/shared';

function limiter(windowMs: number, limit: number, message: string): RateLimitRequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { success: false, message, code: 'RATE_LIMITED' } satisfies ApiFailure,
  });
}

/**
 * Per-IP budgets. Login endpoints are the brute-force surface; secret export
 * and the faucets move value or key material, so they get the tightest caps.
 */
export class RateLimiters {
  readonly global = limiter(60_000, 300, 'Demasiadas solicitudes. Esperá un minuto.');
  readonly auth = limiter(15 * 60_000, 30, 'Demasiados intentos de ingreso. Probá de nuevo en 15 minutos.');
  readonly secretExport = limiter(60 * 60_000, 5, 'Límite de exportación de clave alcanzado. Probá en una hora.');
  readonly faucet = limiter(10 * 60_000, 20, 'Demasiados pedidos de fondeo. Esperá unos minutos.');
  readonly kycSubmit = limiter(60 * 60_000, 10, 'Demasiados envíos de KYC. Probá en una hora.');
  readonly heavyAdmin = limiter(10 * 60_000, 30, 'Demasiadas operaciones on-chain seguidas. Esperá unos minutos.');
}
