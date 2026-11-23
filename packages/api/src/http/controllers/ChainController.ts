import type { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { ApiFailure } from '@fractachain/shared';
import type { ChainReadService } from '../../application/chain/ChainReadService';
import { noStore, ok } from '../respond';
import type { Controller } from './Controller';

const query = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

/**
 * Read-only chain views (Instaward 1, Deliverable 3). Public: they only expose
 * what anyone can already read from the ledger.
 */
export class ChainController implements Controller {
  /** Each request fans out into several Soroban simulations. */
  private readonly limit = rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      success: false,
      message: 'Demasiadas lecturas de la red. Esperá un minuto.',
      code: 'RATE_LIMITED',
    } satisfies ApiFailure,
  });

  constructor(private readonly chain: ChainReadService) {}

  register(r: Router): void {
    r.get('/api/chain/network', this.limit, async (_req, res) => {
      ok(noStore(res), await this.chain.network());
    });

    r.get('/api/chain/tenders/:contractId', this.limit, async (req, res) => {
      ok(noStore(res), await this.chain.tender(String(req.params.contractId), query(req.query.holder)));
    });

    r.get('/api/chain/portfolio/:address', this.limit, async (req, res) => {
      ok(noStore(res), await this.chain.portfolio(String(req.params.address)));
    });

    r.get('/api/chain/forwards', this.limit, async (_req, res) => {
      ok(noStore(res), await this.chain.forwards());
    });

    r.get('/api/chain/warrants', this.limit, async (_req, res) => {
      ok(noStore(res), await this.chain.warrants());
    });

    r.get('/api/chain/stocks', this.limit, async (req, res) => {
      ok(noStore(res), await this.chain.stocks(query(req.query.holder)));
    });
  }
}
