/**
 * Error hierarchy shared by every layer.
 *
 * Services throw these instead of bare `Error` so the HTTP layer can map them
 * to a status code in one place. Messages are user-facing (Spanish, like the
 * rest of the product); anything that is *not* an `AppError` is treated as a
 * bug and answered with a generic 500 so internals never leak to the client.
 */
export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'UPSTREAM_FAILED'
  | 'NOT_CONFIGURED'
  | 'INTERNAL';

export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: ErrorCode,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** A business rule refused the operation (wrong state, insufficient funds…). */
export class DomainError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'BAD_REQUEST', details);
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    readonly issues: { path: string; message: string }[] = [],
  ) {
    super(message, 400, 'VALIDATION_FAILED', issues);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = 'Iniciá sesión') {
    super(message, 401, 'UNAUTHENTICATED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'No tenés permiso para hacer esto') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'No encontrado') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

/** Horizon, Soroban RPC, Friendbot or another dependency failed. */
export class UpstreamError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 502, 'UPSTREAM_FAILED', details);
  }
}

/** The feature needs configuration the operator has not provided. */
export class NotConfiguredError extends AppError {
  constructor(message: string) {
    super(message, 503, 'NOT_CONFIGURED');
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
