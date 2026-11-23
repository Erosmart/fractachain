import type { OrderSide } from '@fractachain/shared';

export type { OrderSide };
export type OrderStatus = 'OPEN' | 'PARTIAL' | 'FILLED' | 'CANCELLED';

export interface BookOrder {
  id: string;
  listingId: string;
  tokenTicker: string;
  accountId: string;
  side: OrderSide;
  price: number;
  amount: number;
  remaining: number;
  status: OrderStatus;
  createdAt: string;
}

export interface Trade {
  id: string;
  listingId: string;
  tokenTicker: string;
  price: number;
  amount: number;
  buyOrderId: string;
  sellOrderId: string;
  buyerId: string;
  sellerId: string;
  createdAt: string;
}

export interface SandboxBookState {
  orders: BookOrder[];
  trades: Trade[];
}

export interface ISandboxBookRepository {
  load(): SandboxBookState;
  save(state: SandboxBookState): void;
}

export interface BookLevel {
  price: number;
  amount: number;
  total: number;
  depthPercent: number;
}

export function isLive(order: BookOrder): boolean {
  return order.status === 'OPEN' || order.status === 'PARTIAL';
}

/** One cross the matching engine decided on; the service settles the cash/token legs. */
export interface MatchStep {
  /** The resting order on the other side of the book. */
  counter: BookOrder;
  quantity: number;
  /** Always the resting order's price. */
  price: number;
}

/**
 * Price-time priority matcher for the sandbox book.
 *
 * Pure: it only decides which resting orders an incoming order crosses and at
 * what price (always the resting order's). Moving USDC and tokens between
 * accounts is the caller's job, which keeps this class trivially testable.
 */
export class SandboxMatchingEngine {
  static levels(orders: BookOrder[], listingId: string, side: OrderSide): BookLevel[] {
    const byPrice = new Map<number, number>();
    for (const o of orders) {
      if (o.listingId !== listingId || o.side !== side || !isLive(o)) continue;
      byPrice.set(o.price, (byPrice.get(o.price) || 0) + o.remaining);
    }
    const rows = [...byPrice.entries()].map(([price, amount]) => ({ price, amount, total: price * amount }));
    rows.sort((a, b) => (side === 'SELL' ? a.price - b.price : b.price - a.price));
    const max = Math.max(1, ...rows.map((r) => r.amount));
    return rows.map((r) => ({ ...r, depthPercent: Math.round((r.amount / max) * 100) }));
  }

  /** Returns the fills for `incoming`, best price first; self-trades are skipped. */
  static match(orders: BookOrder[], incoming: BookOrder): MatchStep[] {
    const resting = orders.filter(
      (o) =>
        o.id !== incoming.id &&
        o.listingId === incoming.listingId &&
        isLive(o) &&
        o.side !== incoming.side &&
        o.accountId !== incoming.accountId,
    );
    const buying = incoming.side === 'BUY';
    resting.sort((a, b) =>
      buying
        ? a.price - b.price || a.createdAt.localeCompare(b.createdAt)
        : b.price - a.price || a.createdAt.localeCompare(b.createdAt),
    );
    const fills: MatchStep[] = [];
    let remaining = incoming.remaining;
    for (const counter of resting) {
      if (remaining <= 1e-8) break;
      if (buying ? counter.price > incoming.price : counter.price < incoming.price) break;
      const quantity = Math.min(remaining, counter.remaining);
      fills.push({ quantity, price: counter.price, counter });
      remaining -= quantity;
    }
    return fills;
  }

  /** Applies a fill's quantity to both orders and updates their status. */
  static applyFill(buy: BookOrder, sell: BookOrder, quantity: number): void {
    for (const order of [buy, sell]) {
      order.remaining = Math.round((order.remaining - quantity) * 1e8) / 1e8;
      if (order.remaining <= 1e-8) {
        order.remaining = 0;
        order.status = 'FILLED';
      } else {
        order.status = 'PARTIAL';
      }
    }
  }
}
