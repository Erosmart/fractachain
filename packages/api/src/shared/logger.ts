import pino from 'pino';

/**
 * Logging port. Services depend on this interface, never on pino directly,
 * so tests can pass a silent logger and the backend can be swapped later.
 */
export interface ILogger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): ILogger;
}

/**
 * Keys whose values must never reach a log line. pino's redaction runs on the
 * structured object, so a secret passed as metadata is masked even when a
 * caller forgets.
 */
const REDACT = [
  'password',
  'secret',
  'secretKey',
  'secretOnce',
  'token',
  'idToken',
  'authorization',
  'req.headers.authorization',
  '*.password',
  '*.secret',
  '*.secretKey',
  '*.token',
  '*.idToken',
];

export class PinoLogger implements ILogger {
  private constructor(private readonly impl: pino.Logger) {}

  static create(options: { level: string; pretty?: boolean; service: string }): PinoLogger {
    return new PinoLogger(
      pino({
        level: options.level,
        base: { service: options.service },
        redact: { paths: REDACT, censor: '[redacted]' },
        timestamp: pino.stdTimeFunctions.isoTime,
      }),
    );
  }

  debug(msg: string, meta?: Record<string, unknown>) {
    this.impl.debug(meta ?? {}, msg);
  }

  info(msg: string, meta?: Record<string, unknown>) {
    this.impl.info(meta ?? {}, msg);
  }

  warn(msg: string, meta?: Record<string, unknown>) {
    this.impl.warn(meta ?? {}, msg);
  }

  error(msg: string, meta?: Record<string, unknown>) {
    this.impl.error(meta ?? {}, msg);
  }

  child(bindings: Record<string, unknown>): ILogger {
    return new PinoLogger(this.impl.child(bindings));
  }
}

/** Logger for tests and scripts that should stay quiet. */
export class NullLogger implements ILogger {
  debug() {}
  info() {}
  warn() {}
  error() {}
  child(): ILogger {
    return this;
  }
}
