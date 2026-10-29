import type { Router } from 'express';
import type { SandboxOrderBookService } from '../../application/market/SandboxOrderBookService';
import type { PortfolioService } from '../../application/market/PortfolioService';
import type { SdexMarketService } from '../../application/market/SdexMarketService';
import type { WalletService } from '../../application/account/WalletService';
import type { OnChainStatusService } from '../../application/offering/OnChainStatusService';
import { currentAccount, type AuthMiddleware } from '../middleware/AuthMiddleware';
import { body, bodyOf, params } from '../middleware/validate';
import { noStore, ok } from '../respond';
import { IdParam, ListingIdParam, SandboxOrderBody, SdexCancelBody, SdexOrderBody, TrustlinePrepareBody, XdrBody } from '../schemas';
import type { Controller } from './Controller';

/**
 * Secondary market: the sandbox book (`/api/orderbook/*`) for listings without
 * a real issuer, and the Stellar DEX (`/api/sdex/*`), where self-custody
 * orders come back as unsigned XDR for the wallet to sign.
 */
export class MarketController implements Controller {
  constructor(
    private readonly sandbox: SandboxOrderBookService,
    private readonly sdex: SdexMarketService,
    private readonly portfolio: PortfolioService,
    private readonly wallets: WalletService,
    private readonly chainStatus: OnChainStatusService,
    private readonly guard: AuthMiddleware,
  ) {}

  register(r: Router): void {
    const auth = this.guard.requireAuth;
    const listing = params(ListingIdParam);
    const listingId = (req: { params: Record<string, unknown> }) => String(req.params.listingId);

    r.get('/api/onchain/status', async (_req, res) => {
      ok(res, await this.chainStatus.status());
    });

    /* ------------------------------- sandbox book ------------------------------- */
    r.get('/api/orderbook/markets', (_req, res) => {
      ok(res, this.sandbox.markets());
    });
    r.get('/api/orderbook/:listingId', listing, (req, res) => {
      ok(res, this.sandbox.book(listingId(req), req.account?.id));
    });
    r.post('/api/orderbook/:listingId/orders', auth, listing, body(SandboxOrderBody), (req, res) => {
      const b = bodyOf(req, SandboxOrderBody);
      ok(res, this.sandbox.placeOrder(listingId(req), currentAccount(req).id, b.side, b.price, b.amount));
    });
    r.post('/api/orderbook/orders/:id/cancel', auth, params(IdParam), (req, res) => {
      ok(res, this.sandbox.cancelOrder(String(req.params.id), currentAccount(req).id));
    });

    /* ---------------------------------- SDEX ---------------------------------- */
    r.post('/api/sdex/submit', auth, body(XdrBody), async (req, res) => {
      ok(res, await this.sdex.submitSigned(currentAccount(req).id, bodyOf(req, XdrBody).xdr));
    });
    r.get('/api/sdex/:listingId', listing, async (req, res) => {
      ok(res, await this.sdex.book(listingId(req), req.account?.id));
    });
    r.post('/api/sdex/:listingId/orders/prepare', auth, listing, body(SdexOrderBody), async (req, res) => {
      ok(res, await this.sdex.prepareOrder({ listingId: listingId(req), accountId: currentAccount(req).id, ...bodyOf(req, SdexOrderBody) }));
    });
    /** One-shot path for custodial wallets: build, sign and submit. */
    r.post('/api/sdex/:listingId/orders', auth, listing, body(SdexOrderBody), async (req, res) => {
      ok(res, await this.sdex.placeCustodialOrder({ listingId: listingId(req), accountId: currentAccount(req).id, ...bodyOf(req, SdexOrderBody) }));
    });
    /** Custodial cancels are submitted; self-custody gets the XDR to sign. */
    r.post('/api/sdex/:listingId/orders/cancel', auth, listing, body(SdexCancelBody), async (req, res) => {
      const account = currentAccount(req);
      const b = bodyOf(req, SdexCancelBody);
      const cancel = { listingId: listingId(req), accountId: account.id, side: b.side, offerId: b.offerId, price: b.price, legacy: Boolean(b.legacy) };
      ok(res, account.custodyMode === 'CUSTODIAL' ? await this.sdex.cancelCustodialOrder(cancel) : await this.sdex.prepareCancel(cancel));
    });
    r.post('/api/sdex/:listingId/trustline/prepare', auth, listing, body(TrustlinePrepareBody), async (req, res) => {
      ok(res, await this.sdex.prepareTrustline({ listingId: listingId(req), accountId: currentAccount(req).id, limit: bodyOf(req, TrustlinePrepareBody).limit }));
    });

    /* -------------------------------- portfolio -------------------------------- */
    r.get('/api/portfolio', auth, async (req, res) => {
      const account = currentAccount(req);
      // Dashboard load heals the wallet: XLM refill, USDC grant when empty.
      await this.wallets.heal(account);
      noStore(res);
      ok(res, await this.portfolio.build(account.id));
    });
  }
}
