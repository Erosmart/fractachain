import { describe, expect, it } from 'vitest';
import { buildCandles, fromSdex } from '@/features/orderbook/model';
import { normalizeStock } from '@/features/stocks/model';
import type { SdexBook } from '@/core/api/types';

describe('orderbook model', () => {
  it('folds an SDEX book into the shared view model', () => {
    const sdex: SdexBook = {
      listingId: 'L',
      tokenTicker: 'TKN',
      legalName: 'Co',
      refPrice: 10,
      lastPrice: 11,
      spread: 1,
      bids: [{ price: 10, amount: 2, total: 2 }],
      asks: [
        { price: 11, amount: 4, total: 4 },
        { price: 12, amount: 1, total: 5 },
      ],
      trades: [],
      myOffers: [
        {
          id: '1',
          selling: { asset_code: 'TKN', asset_type: 'credit_alphanum4' },
          buying: { asset_type: 'credit_alphanum4' },
          amount: 3,
          price: 11,
        },
        {
          id: '2',
          selling: { asset_code: 'USDC', asset_type: 'credit_alphanum4' },
          buying: { asset_type: 'credit_alphanum4' },
          amount: 20,
          price: 0.1,
        },
      ],
      authorized: true,
      needsTrustline: false,
      tokenBalance: 1,
      usdcBalance: 2,
      usdcTotal: 3,
      tokenTotal: 4,
    };
    const book = fromSdex(sdex);
    expect(book.venue).toBe('sdex');
    expect(book.asks.map((a) => a.depthPercent)).toEqual([100, 25]);
    expect(book.bids[0].total).toBe(20);
    expect(book.myOrders.map((o) => [o.side, o.price])).toEqual([
      ['SELL', 11],
      ['BUY', 10],
    ]);
  });

  it('builds a continuous candle series anchored at the reference price', () => {
    const empty = buildCandles([], 10, 1_000_000);
    expect(empty).toHaveLength(44);
    expect(empty.every((c) => c.o === 10 && c.c === 10)).toBe(true);

    const t0 = Date.parse('2026-10-01T00:00:00Z');
    const candles = buildCandles(
      [
        { price: 12, amount: 1, createdAt: new Date(t0).toISOString() },
        { price: 9, amount: 2, createdAt: new Date(t0 + 3_600_000).toISOString() },
      ],
      10,
    );
    expect(candles[candles.length - 1].c).toBe(9);
    expect(Math.max(...candles.map((c) => c.h))).toBe(12);
    expect(candles.reduce((s, c) => s + c.v, 0)).toBe(3);
  });
});

describe('normalizeStock', () => {
  it('accepts both the legacy custody shape and MervalStock rows', () => {
    expect(
      normalizeStock({
        tokenTicker: 'tYPF',
        ticker: 'YPFD',
        priceUsdc: 24.5,
        change24hPct: 3.4,
        custodiedSharesInCajaDeValores: 5,
      }),
    ).toMatchObject({
      symbol: 'tYPF',
      tickerMerval: 'YPFD',
      priceUsd: 24.5,
      change24h: 3.4,
      totalSharesInCustody: 5,
      backingRatio: 1,
    });
    expect(normalizeStock({ symbol: '' })).toBeNull();
    expect(normalizeStock(null)).toBeNull();
  });
});
