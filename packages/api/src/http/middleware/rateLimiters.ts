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
  readonly secretExport = limiter(
    60 * 60_000,
    5,
    'Límite de exportación de clave alcanzado. Probá en una hora.',
  );
  readonly faucet = limiter(10 * 60_000, 20, 'Demasiados pedidos de fondeo. Esperá unos minutos.');
  /** Contact form: public, so spam-limited. */
  readonly support = limiter(60 * 60_000, 5, 'Ya nos escribiste varias veces. Probá de nuevo en una hora.');
  readonly accountExport = limiter(60 * 60_000, 10, 'Demasiadas descargas de datos. Probá en una hora.');
  readonly kycSubmit = limiter(60 * 60_000, 10, 'Demasiados envíos de KYC. Probá en una hora.');
  /** Each new hosted session is a billable verification at the provider. */
  readonly kycVerificationStart = limiter(
    60 * 60_000,
    10,
    'Demasiados intentos de verificación. Probá en una hora.',
  );
  /** Each sync is a call to the identity provider's API. */
  readonly kycSync = limiter(10 * 60_000, 40, 'Demasiadas consultas de verificación. Esperá unos minutos.');
  readonly heavyAdmin = limiter(
    10 * 60_000,
    30,
    'Demasiadas operaciones on-chain seguidas. Esperá unos minutos.',
  );
}
