import crypto from 'crypto';
import { TraderPolicy } from '../../domain/account/Account';
import {
  SandboxMatchingEngine,
  isLive,
  type BookOrder,
  type ISandboxBookRepository,
  type OrderSide,
} from '../../domain/market/SandboxBook';
import { DomainError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors';
import { EPSILON, round6 } from '../../shared/numbers';
import type { AccountService } from '../account/AccountService';
import type { ListingLedger } from '../listing/ListingLedger';
import type { ListingPresenter } from '../listing/ListingPresenter';

/**
 * In-memory CLOB for listings without a real issuer (demo without funded
 * testnet accounts). Cash and tokens move on the platform ledger only.
 */
export class SandboxOrderBookService {
  constructor(
    private readonly repo: ISandboxBookRepository,
    private readonly accounts: AccountService,
    private readonly listings: ListingLedger,
    private readonly presenter: ListingPresenter,
  ) {}

  markets() {
    return this.presenter.tradeableMarkets();
  }

  reservedCash(accountId: string): number {
    return this.repo
      .load()
      .orders.filter((o) => o.accountId === accountId && o.side === 'BUY' && isLive(o))
      .reduce((s, o) => s + o.remaining * o.price, 0);
  }

  reservedTokens(accountId: string, listingId: string): number {
    return this.repo
      .load()
      .orders.filter((o) => o.accountId === accountId && o.listingId === listingId && o.side === 'SELL' && isLive(o))
      .reduce((s, o) => s + o.remaining, 0);
  }

  book(listingId: string, accountId?: string) {
    const listing = this.listings.get(listingId);
    if (!listing) throw new NotFoundError('Mercado no encontrado');
    const { orders, trades } = this.repo.load();
    const asks = SandboxMatchingEngine.levels(orders, listingId, 'SELL');
    const bids = SandboxMatchingEngine.levels(orders, listingId, 'BUY');
    const marketTrades = trades.filter((t) => t.listingId === listingId);
    const last = marketTrades[marketTrades.length - 1] || null;
    const bestAsk = asks[0]?.price;
    const bestBid = bids[0]?.price;
    return {
      listingId,
      tokenTicker: listing.dossier.tokenTicker,
      legalName: listing.dossier.legalName,
      refPrice: listing.dossier.pricePerShareUsdc,
      lastPrice: last?.price ?? listing.dossier.pricePerShareUsdc,
      spread: bestAsk != null && bestBid != null ? Math.round((bestAsk - bestBid) * 100) / 100 : null,
      asks,
      bids,
      trades: marketTrades.slice(-20).reverse(),
      myOrders: accountId ? orders.filter((o) => o.listingId === listingId && o.accountId === accountId) : [],
      // Cash is reserved across every market, so the client cannot derive it from myOrders.
      reservedCash: accountId ? this.reservedCash(accountId) : 0,
      reservedTokens: accountId ? this.reservedTokens(accountId, listingId) : 0,
      sandbox: true as const,
    };
  }

  placeOrder(listingId: string, accountId: string, side: OrderSide, price: number, amount: number) {
    const account = this.accounts.require(accountId);
    TraderPolicy.assertCanTrade(account);
    const listing = this.listings.get(listingId);
    if (!listing) throw new NotFoundError('Mercado no encontrado');
    if (listing.status !== 'LISTED' && listing.status !== 'CLOSED_SUCCESS' && listing.tokensMinted <= 0) {
      throw new DomainError('Este token todavía no se puede negociar');
    }
    if (side !== 'BUY' && side !== 'SELL') throw new ValidationError('Lado de orden inválido');
    if (!(price > 0) || !(amount > 0) || !Number.isFinite(price) || !Number.isFinite(amount)) {
      throw new ValidationError('Precio o cantidad inválidos');
    }
    if (side === 'BUY') {
      if (!this.accounts.hasTrustline(accountId, listingId)) throw new DomainError('Aprobá el token (trustline) para poder recibirlo');
      if (this.accounts.cashBalance(accountId) - this.reservedCash(accountId) + EPSILON < amount * price) {
        throw new DomainError('USDC insuficiente (saldo sandbox menos órdenes abiertas)');
      }
    } else if (this.accounts.tokenBalance(accountId, listingId) - this.reservedTokens(accountId, listingId) + EPSILON < amount) {
      throw new DomainError('No tenés tokens libres para vender');
    }

    const state = this.repo.load();
    const order: BookOrder = {
      id: `ord_${crypto.randomBytes(5).toString('hex')}`,
      listingId,
      tokenTicker: listing.dossier.tokenTicker,
      accountId,
      side,
      price: Math.round(price * 100) / 100,
      amount,
      remaining: amount,
      status: 'OPEN',
      createdAt: new Date().toISOString(),
    };
    state.orders.push(order);
    for (const step of SandboxMatchingEngine.match(state.orders, order)) {
      const [buy, sell] = side === 'BUY' ? [order, step.counter] : [step.counter, order];
      this.settleFill(buy, sell, step.quantity, step.price, state.trades);
    }
    this.repo.save(state);
    return { order, book: this.book(listingId, accountId), user: this.accounts.publicById(accountId) };
  }

  cancelOrder(orderId: string, accountId: string) {
    const state = this.repo.load();
    const order = state.orders.find((o) => o.id === orderId);
    if (!order) throw new NotFoundError('Orden no encontrada');
    if (order.accountId !== accountId) throw new ForbiddenError('No es tu orden');
    if (!isLive(order)) throw new DomainError('La orden ya no está abierta');
    order.status = 'CANCELLED';
    this.repo.save(state);
    return { order, book: this.book(order.listingId, accountId), user: this.accounts.publicById(accountId) };
  }

  /** Moves the cash and token legs of one cross between the two accounts. */
  private settleFill(buy: BookOrder, sell: BookOrder, qty: number, price: number, trades: ReturnType<ISandboxBookRepository['load']>['trades']) {
    const usdc = round6(qty * price);
    this.accounts.debitCash(buy.accountId, usdc);
    this.accounts.creditCash(sell.accountId, usdc);
    this.accounts.reduceHolding(sell.accountId, sell.listingId, qty);
    this.accounts.addHolding(buy.accountId, {
      listingId: buy.listingId,
      tokenTicker: buy.tokenTicker,
      usdcAmount: usdc,
      tokens: qty,
      tokensOwed: 0,
    });
    SandboxMatchingEngine.applyFill(buy, sell, qty);
    trades.push({
      id: `trd_${crypto.randomBytes(4).toString('hex')}`,
      listingId: buy.listingId,
      tokenTicker: buy.tokenTicker,
      price,
      amount: qty,
      buyOrderId: buy.id,
      sellOrderId: sell.id,
      buyerId: buy.accountId,
      sellerId: sell.accountId,
      createdAt: new Date().toISOString(),
    });
  }
}
