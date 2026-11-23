/** Human-readable message of anything thrown (Error, ApiError, string, unknown). */
export function errorMessage(err: unknown, fallback = ''): string {
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === 'string') return err || fallback;
  return fallback;
}
