import type { NextFunction, Request, Response } from 'express';
import type { z, ZodType } from 'zod';
import { ValidationError } from '../../shared/errors';

function toValidationError(error: z.ZodError): ValidationError {
  const issues = error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  const first = issues[0];
  return new ValidationError(first ? `Dato inválido: ${first.path || 'body'} — ${first.message}` : 'Datos inválidos', issues);
}

/** Parses and replaces `req.body` with the schema output (unknown keys stripped). */
export function body<S extends ZodType>(schema: S) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) return next(toValidationError(parsed.error));
    req.body = parsed.data;
    next();
  };
}

/** Validates route params (ids, tickers) against a schema. */
export function params<S extends ZodType>(schema: S) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.params);
    if (!parsed.success) return next(toValidationError(parsed.error));
    next();
  };
}

/** Typed access to a body already validated by `body(schema)`. */
export function bodyOf<S extends ZodType>(req: Request, _schema: S): z.infer<S> {
  return req.body as z.infer<S>;
}
