import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getListing, tradeableMarkets } from '../admin/listings';
import {
  addHolding,
  cashBalance,
  creditCash,
  debitCash,
  getAccount,
  hasTrustline,
  reduceHolding,
  requireApprovedTrader,
  tokenBalance,
  toPublic,
} from '../auth/accounts';

export type OrderSide = 'BUY' | 'SELL';
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

const DATA = path.join(__dirname, '..', '..', 'data', 'orderbook.json');

let orders: BookOrder[] = [];
let trades: Trade[] = [];

function load() {
  try {
    if (!fs.existsSync(DATA)) return;
    const raw = JSON.parse(fs.readFileSync(DATA, 'utf8')) as { orders?: BookOrder[]; trades?: Trade[] };
    orders = raw.orders || [];
    trades = raw.trades || [];
  } catch {
    orders = [];
    trades = [];
  }
}

function save() {
  fs.mkdirSync(path.dirname(DATA), { recursive: true });
  fs.writeFileSync(DATA, JSON.stringify({ orders, trades }, null, 2));
}

load();

function live(order: BookOrder) {
  return order.status === 'OPEN' || order.status === 'PARTIAL';
}

export function reservedCash(accountId: string) {
  return orders
    .filter((o) => o.accountId === accountId && o.side === 'BUY' && live(o))
    .reduce((s, o) => s + o.remaining * o.price, 0);
}

export function reservedTokens(accountId: string, listingId: string) {
  return orders
    .filter((o) => o.accountId === accountId && o.listingId === listingId && o.side === 'SELL' && live(o))
    .reduce((s, o) => s + o.remaining, 0);
}

function levels(listingId: string, side: OrderSide) {
  const liveOrders = orders.filter((o) => o.listingId === listingId && o.side === side && live(o));
  const map = new Map<number, number>();
  for (const o of liveOrders) {
    map.set(o.price, (map.get(o.price) || 0) + o.remaining);
  }
  const rows = [...map.entries()].map(([price, amount]) => ({
    price,
    amount,
    total: price * amount,
  }));
  rows.sort((a, b) => (side === 'SELL' ? b.price - a.price : b.price - a.price));
  if (side === 'SELL') rows.sort((a, b) => a.price - b.price);
  else rows.sort((a, b) => b.price - a.price);
  const max = Math.max(1, ...rows.map((r) => r.amount));
  return rows.map((r) => ({ ...r, depthPercent: Math.round((r.amount / max) * 100) }));
}

export function listMarkets() {
  return tradeableMarkets();
}

export function getBook(listingId: string, accountId?: string) {
  const listing = getListing(listingId);
  if (!listing) throw new Error('Mercado no encontrado');
  const asks = levels(listingId, 'SELL');
  const bids = levels(listingId, 'BUY');
  const last = trades.filter((t) => t.listingId === listingId).slice(-1)[0] || null;
  const bestAsk = asks[0]?.price;
  const bestBid = bids[0]?.price;
  const spread =
    bestAsk != null && bestBid != null ? Math.round((bestAsk - bestBid) * 100) / 100 : null;
  return {
    listingId,
    tokenTicker: listing.dossier.tokenTicker,
    legalName: listing.dossier.legalName,
    refPrice: listing.dossier.pricePerShareUsdc,
    lastPrice: last?.price ?? listing.dossier.pricePerShareUsdc,
    spread,
    asks,
    bids,
    trades: trades.filter((t) => t.listingId === listingId).slice(-20).reverse(),
    myOrders: accountId ? orders.filter((o) => o.listingId === listingId && o.accountId === accountId) : [],
    // Cash is reserved across every market, so the client cannot derive it from myOrders alone.
    reservedCash: accountId ? reservedCash(accountId) : 0,
    reservedTokens: accountId ? reservedTokens(accountId, listingId) : 0,
    sandbox: true,
  };
}

function settle(buy: BookOrder, sell: BookOrder, qty: number, price: number) {
  const usdc = Math.round(qty * price * 1e6) / 1e6;
  debitCash(buy.accountId, usdc);
  creditCash(sell.accountId, usdc);
  reduceHolding(sell.accountId, sell.listingId, qty);
  addHolding(buy.accountId, {
    listingId: buy.listingId,
    tokenTicker: buy.tokenTicker,
    usdcAmount: usdc,
    tokens: qty,
    tokensOwed: 0,
  });
  buy.remaining = Math.round((buy.remaining - qty) * 1e8) / 1e8;
  sell.remaining = Math.round((sell.remaining - qty) * 1e8) / 1e8;
  buy.status = buy.remaining <= 1e-8 ? 'FILLED' : 'PARTIAL';
  sell.status = sell.remaining <= 1e-8 ? 'FILLED' : 'PARTIAL';
  if (buy.remaining <= 1e-8) buy.remaining = 0;
  if (sell.remaining <= 1e-8) sell.remaining = 0;
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

function matchIncoming(incoming: BookOrder) {
  const rest = orders.filter(
    (o) =>
      o.id !== incoming.id &&
      o.listingId === incoming.listingId &&
      live(o) &&
      o.side !== incoming.side &&
      o.accountId !== incoming.accountId
  );
  if (incoming.side === 'BUY') {
    rest.sort((a, b) => a.price - b.price || a.createdAt.localeCompare(b.createdAt));
    for (const ask of rest) {
      if (incoming.remaining <= 1e-8) break;
      if (ask.price > incoming.price) break;
      const qty = Math.min(incoming.remaining, ask.remaining);
      settle(incoming, ask, qty, ask.price);
    }
  } else {
    rest.sort((a, b) => b.price - a.price || a.createdAt.localeCompare(b.createdAt));
    for (const bid of rest) {
      if (incoming.remaining <= 1e-8) break;
      if (bid.price < incoming.price) break;
      const qty = Math.min(incoming.remaining, bid.remaining);
      settle(bid, incoming, qty, bid.price);
    }
  }
}

export function placeOrder(
  listingId: string,
  accountId: string,
  side: OrderSide,
  price: number,
  amount: number
) {
  const account = getAccount(accountId);
  if (!account) throw new Error('Inversor no encontrado');
  requireApprovedTrader(account);
  const listing = getListing(listingId);
  if (!listing) throw new Error('Mercado no encontrado');
  if (listing.status !== 'LISTED' && listing.status !== 'CLOSED_SUCCESS' && listing.tokensMinted <= 0) {
    throw new Error('Este token todavía no se puede negociar');
  }
  if (price <= 0 || amount <= 0) throw new Error('Precio o cantidad inválidos');
  if (side === 'BUY') {
    if (!hasTrustline(accountId, listingId)) {
      throw new Error('Aprobá el token (trustline) para poder recibirlo');
    }
    const need = amount * price;
    if (cashBalance(accountId) - reservedCash(accountId) + 1e-9 < need) {
      throw new Error('USDC insuficiente (saldo sandbox menos órdenes abiertas)');
    }
  } else {
    const free = tokenBalance(accountId, listingId) - reservedTokens(accountId, listingId);
    if (free + 1e-9 < amount) {
      throw new Error('No tenés tokens libres para vender');
    }
  }
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
  orders.push(order);
  matchIncoming(order);
  save();
  return {
    order,
    book: getBook(listingId, accountId),
    user: toPublic(getAccount(accountId)!),
  };
}

export function cancelOrder(orderId: string, accountId: string) {
  const order = orders.find((o) => o.id === orderId);
  if (!order) throw new Error('Orden no encontrada');
  if (order.accountId !== accountId) throw new Error('No es tu orden');
  if (!live(order)) throw new Error('La orden ya no está abierta');
  order.status = 'CANCELLED';
  save();
  return { order, book: getBook(order.listingId, accountId), user: toPublic(getAccount(accountId)!) };
}
