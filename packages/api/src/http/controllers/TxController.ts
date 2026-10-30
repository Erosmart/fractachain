import type { Response, Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { ApiFailure } from '@fractachain/shared';
import type { TxService } from '../../application/tx/TxService';
import type { Explorer } from '../../infrastructure/stellar/Explorer';
import { AppError } from '../../shared/errors';
import { bodyField, type AuditMiddleware } from '../middleware/AuditMiddleware';
import { currentAccount, type AuthMiddleware } from '../middleware/AuthMiddleware';
import { body, bodyOf, params } from '../middleware/validate';
import { noStore, ok } from '../respond';
import { TxBuildBody, TxHashParam, TxSubmitBody } from '../schemas';
import type { Controller } from './Controller';

/** Each build simulates on Soroban RPC (and may whitelist the wallet on the tender). */
const buildLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Demasiadas transacciones armadas seguidas. Esperá unos minutos.',
    code: 'RATE_LIMITED',
  } satisfies ApiFailure,
});

/**
 * Non-custodial signing (Instaward 1, Deliverable 2): build → the investor
 * signs in Freighter → submit. Custodial accounts keep the server-signed
 * endpoints under /api/listings as the fallback.
 */
export class TxController implements Controller {
  constructor(
    private readonly tx: TxService,
    private readonly guard: AuthMiddleware,
    private readonly audit: AuditMiddleware,
    private readonly explorer: Explorer,
  ) {}

  register(r: Router): void {
    r.post(
      '/api/tx/build',
      this.guard.requireAuth,
      buildLimiter,
      this.audit.route('tx.build', bodyField('action')),
      body(TxBuildBody),
      async (req, res) => {
        const built = await this.tx.build(currentAccount(req), bodyOf(req, TxBuildBody));
        ok(noStore(res), built);
      },
    );

    r.post(
      '/api/tx/submit',
      this.guard.requireAuth,
      this.audit.route('tx.submit', bodyField('buildId')),
      body(TxSubmitBody),
      async (req, res) => {
        const { buildId, signedXdr } = bodyOf(req, TxSubmitBody);
        try {
          const result = await this.tx.submit(currentAccount(req), buildId, signedXdr);
          ok(noStore(res), result, result.status === 'PENDING' ? 202 : 200);
        } catch (err) {
          if (!this.failedOnChain(res, err)) throw err;
        }
      },
    );

    r.get('/api/tx/:hash', params(TxHashParam), async (req, res) => {
      ok(noStore(res), await this.tx.status(String(req.params.hash)));
    });
  }

  /** A transaction the network executed and failed: answer with its hash so the UI can link it. */
  private failedOnChain(res: Response, err: unknown): boolean {
    if (!(err instanceof AppError) || err.code !== 'TX_FAILED') return false;
    const hash = (err.details as { hash?: string } | undefined)?.hash ?? null;
    noStore(res)
      .status(err.status)
      .json({ success: false, message: err.message, code: err.code, hash, explorer: this.explorer.tx(hash) });
    return true;
  }
}
