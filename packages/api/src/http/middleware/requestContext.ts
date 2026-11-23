import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import type { ILogger } from '../../shared/logger';

/** Request id (echoed as `X-Request-Id`) and one access-log line per request. */
export function requestContext(logger: ILogger) {
  return (req: Request, res: Response, next: NextFunction) => {
    const incoming = req.headers['x-request-id'];
    req.requestId =
      typeof incoming === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      const meta = {
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Math.round(ms),
      };
      if (res.statusCode >= 500) logger.error('request', meta);
      else if (req.path !== '/health') logger.info('request', meta);
    });
    next();
  };
}
