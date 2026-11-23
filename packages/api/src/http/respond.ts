import type { Response } from 'express';
import type { ApiSuccess } from '@fractachain/shared';

/** `{ success: true, data }` — the envelope most endpoints use. */
export function ok<T>(res: Response, data: T, status = 200): Response {
  return res.status(status).json({ success: true, data } satisfies ApiSuccess<T>);
}

/** Responses that must never be cached by a browser or proxy (secrets, personal data). */
export function noStore(res: Response): Response {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  return res;
}
