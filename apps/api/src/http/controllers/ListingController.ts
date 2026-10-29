import type { Router } from 'express';
import type { DemoDossierService } from '../../application/demo/DemoDossierService';
import type { IssuanceWorkflowService } from '../../application/listing/IssuanceWorkflowService';
import type { ListingLedger } from '../../application/listing/ListingLedger';
import type { ListingPresenter } from '../../application/listing/ListingPresenter';
import type { DividendService } from '../../application/market/DividendService';
import type { OfferingService } from '../../application/offering/OfferingService';
import type { SettlementService } from '../../application/settlement/SettlementService';
import { NotFoundError } from '../../shared/errors';
import { currentAccount, type AuthMiddleware } from '../middleware/AuthMiddleware';
import type { RateLimiters } from '../middleware/rateLimiters';
import { body, bodyOf, params } from '../middleware/validate';
import { ok } from '../respond';
import {
  ContributeBody,
  ContributeSubmitBody,
  DividendBody,
  DossierBody,
  IdParam,
  MintBody,
  ProceedsWalletBody,
  SettleBody,
  XdrBody,
} from '../schemas';
import type { Controller } from './Controller';

/** Offerings: admin issuance pipeline, public reads and investor actions. */
export class ListingController implements Controller {
  constructor(
    private readonly ledger: ListingLedger,
    private readonly presenter: ListingPresenter,
    private readonly issuance: IssuanceWorkflowService,
    private readonly offerings: OfferingService,
    private readonly settlement: SettlementService,
    private readonly dividends: DividendService,
    private readonly demo: DemoDossierService,
    private readonly guard: AuthMiddleware,
    private readonly limits: RateLimiters,
  ) {}

  register(r: Router): void {
    const id = params(IdParam);
    const admin = this.guard.requireAdmin;
    const auth = this.guard.requireAuth;
    const listingId = (req: { params: Record<string, unknown> }) => String(req.params.id);

    /* ----------------------------------- reads ----------------------------------- */
    r.get('/api/listings', admin, (_req, res) => {
      ok(res, this.ledger.list());
    });

    r.get('/api/listings/:id', id, async (req, res) => {
      const payload = await this.offerings.detail(listingId(req), req.account?.publicKey);
      if (!payload) throw new NotFoundError('Listing no encontrado');
      res.json({ success: true, data: { ...payload.listing, onChain: payload.onChain }, validation: payload.validation });
    });

    r.get('/api/listings/:id/validation', id, (req, res) => {
      ok(res, this.presenter.validationPack(this.ledger.require(listingId(req))));
    });

    r.get('/api/market/pools', (_req, res) => {
      ok(res, this.presenter.pools());
    });

    /* ------------------------------ admin: issuance ------------------------------ */
    r.post('/api/admin/demo-dossier', admin, this.limits.heavyAdmin, async (_req, res) => {
      ok(res, await this.demo.build());
    });

    r.post('/api/listings', admin, body(DossierBody), async (req, res) => {
      ok(res, await this.issuance.create(bodyOf(req, DossierBody)), 201);
    });

    r.post('/api/listings/:id/deploy', admin, this.limits.heavyAdmin, id, async (req, res) => {
      ok(res, await this.issuance.deploy(listingId(req)));
    });

    r.post('/api/listings/:id/mint', admin, this.limits.heavyAdmin, id, body(MintBody), async (req, res) => {
      ok(res, await this.issuance.mint(listingId(req), bodyOf(req, MintBody).amount));
    });

    r.post('/api/listings/:id/licitacion', admin, this.limits.heavyAdmin, id, body(SettleBody), async (req, res) => {
      ok(res, await this.issuance.openLicitacion(listingId(req), bodyOf(req, SettleBody)));
    });

    r.post('/api/listings/:id/settle', admin, id, body(SettleBody), (req, res) => {
      ok(res, this.issuance.setSettle(listingId(req), bodyOf(req, SettleBody)));
    });

    r.post('/api/listings/:id/proceeds-wallet', admin, id, body(ProceedsWalletBody), async (req, res) => {
      ok(res, await this.issuance.setProceedsWallet(listingId(req), bodyOf(req, ProceedsWalletBody).wallet));
    });

    r.post('/api/listings/:id/close', admin, id, async (req, res) => {
      ok(res, await this.settlement.finalize(listingId(req)));
    });

    r.post('/api/listings/:id/withdraw-proceeds', admin, this.limits.heavyAdmin, id, async (req, res) => {
      ok(res, await this.offerings.withdrawProceeds(listingId(req)));
    });

    r.post('/api/listings/:id/dividends', admin, id, body(DividendBody), (req, res) => {
      const b = bodyOf(req, DividendBody);
      ok(res, this.dividends.deposit(listingId(req), Number(b.amountUsdc ?? b.amount)), 201);
    });

    r.get('/api/listings/:id/dividends', id, (req, res) => {
      ok(res, this.dividends.list(listingId(req)));
    });

    /* ------------------------------- investor actions ------------------------------- */
    /** Permissionless on-chain `finalize()`; the contract gates it on hard cap or deadline. */
    r.post('/api/listings/:id/finalize', auth, id, async (req, res) => {
      ok(res, await this.offerings.finalizeByInvestor(listingId(req)));
    });

    r.post('/api/listings/:id/contribute', auth, id, body(ContributeBody), async (req, res) => {
      ok(res, await this.offerings.contribute(listingId(req), currentAccount(req).id, bodyOf(req, ContributeBody).usdcAmount));
    });

    r.post('/api/listings/:id/contribute/prepare', auth, id, body(ContributeBody), async (req, res) => {
      ok(res, await this.offerings.prepareContribute(listingId(req), currentAccount(req).id, bodyOf(req, ContributeBody).usdcAmount));
    });

    /** `usdcAmount` in the body is ignored: the booked amount is read from the contract. */
    r.post('/api/listings/:id/contribute/submit', auth, id, body(ContributeSubmitBody), async (req, res) => {
      ok(res, await this.offerings.submitContribute(listingId(req), currentAccount(req).id, bodyOf(req, ContributeSubmitBody).xdr));
    });

    r.post('/api/listings/:id/refund', auth, id, async (req, res) => {
      ok(res, await this.offerings.refund(listingId(req), currentAccount(req).id));
    });

    r.post('/api/listings/:id/refund/prepare', auth, id, async (req, res) => {
      ok(res, await this.offerings.prepareRefund(listingId(req), currentAccount(req).id));
    });

    r.post('/api/listings/:id/refund/submit', auth, id, body(XdrBody), async (req, res) => {
      ok(res, await this.offerings.submitRefund(listingId(req), currentAccount(req).id, bodyOf(req, XdrBody).xdr));
    });

    r.post('/api/listings/:id/trustline', auth, id, async (req, res) => {
      ok(res, await this.offerings.approveToken(listingId(req), currentAccount(req).id));
    });

    r.post('/api/listings/:id/claim', auth, id, async (req, res) => {
      ok(res, await this.offerings.claim(listingId(req), currentAccount(req).id));
    });

    /** Idempotent retry of the on-ledger payout of already-claimed tokens. */
    r.post('/api/listings/:id/distribute', auth, id, async (req, res) => {
      ok(res, await this.offerings.distribute(listingId(req), currentAccount(req).id));
    });

    r.post('/api/listings/:id/dividends/claim', auth, id, (req, res) => {
      ok(res, this.dividends.claim(currentAccount(req).id, listingId(req)));
    });
  }
}
