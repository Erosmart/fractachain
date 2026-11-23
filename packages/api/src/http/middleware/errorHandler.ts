import type { NextFunction, Request, Response } from 'express';
import type { ApiFailure } from '@fractachain/shared';
import { AppError, ValidationError } from '../../shared/errors';
import type { ILogger } from '../../shared/logger';

interface BodyParserError {
  type?: string;
  status?: number;
  expose?: boolean;
}

/**
 * Single place where errors become HTTP responses.
 *
 * `AppError`s carry their status and a user-facing message. Anything else is
 * a bug: it is logged with the request id and answered with a generic 500,
 * so stack traces and upstream internals never reach the client.
 */
export function errorHandler(logger: ILogger) {
  return (err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const parserError = err as BodyParserError;
    if (parserError?.type === 'entity.too.large') {
      return res.status(413).json({
        success: false,
        message: 'El cuerpo de la solicitud es demasiado grande',
        code: 'BAD_REQUEST',
      } satisfies ApiFailure);
    }
    if (parserError?.type === 'entity.parse.failed') {
      return res
        .status(400)
        .json({ success: false, message: 'JSON inválido', code: 'BAD_REQUEST' } satisfies ApiFailure);
    }
    // http-errors raised by Express internals (send, body-parser): keep their 4xx.
    if (
      !(err instanceof AppError) &&
      parserError?.expose &&
      parserError.status &&
      parserError.status >= 400 &&
      parserError.status < 500
    ) {
      return res
        .status(parserError.status)
        .json({ success: false, message: 'Solicitud inválida', code: 'BAD_REQUEST' } satisfies ApiFailure);
    }
    if (err instanceof AppError) {
      if (err.status >= 500)
        logger.warn('error de dependencia', { requestId: req.requestId, path: req.path, err: err.message });
      const payload: ApiFailure = { success: false, message: err.message, code: err.code };
      if (err instanceof ValidationError && err.issues.length) payload.issues = err.issues;
      return res.status(err.status).json(payload);
    }
    logger.error('error no controlado', {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      err: err instanceof Error ? { message: err.message, stack: err.stack } : String(err),
    });
    return res.status(500).json({
      success: false,
      message: 'Error interno. Intentá de nuevo en unos minutos.',
      code: 'INTERNAL',
    } satisfies ApiFailure);
  };
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    message: `Ruta no encontrada: ${req.method} ${req.path}`,
    code: 'NOT_FOUND',
  } satisfies ApiFailure);
}
