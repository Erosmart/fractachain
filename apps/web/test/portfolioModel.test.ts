import { describe, expect, it } from 'vitest';
import type { Pool, Portfolio, Position } from '@/core/api/types';
import { dailyCounts, describeOperation, type HorizonOperation } from '@/features/portfolio/model/activity';
import { byAsset, byType } from '@/features/portfolio/model/allocation';
import { pct, signed } from '@/features/portfolio/model/format';
import { poolPhase, positionPhase } from '@/core/market/phase';
import { offeringDay, positionsFrom } from '@/features/portfolio/model/positions';
import { pendingCount, tasksFor } from '@/features/portfolio/model/tasks';

const ME = 'GADCUHWTKGKVSXUOMGJ654BA76DHDKHJAWPBFOXOCVCJQ7IXMGGME4OD';

function position(over: Partial<Position> = {}): Position {
  return {
    listingId: 'L1',
    tokenTicker: 'TOK',
    legalName: 'Tok SA',
    shares: 10,
    tokens: 10,
    tokensOwed: 0,
    tokensOnChain: 10,
    sdex: true,
    costBasis: 100,
    marketPrice: 10,
    marketValue: 100,
    pnl: 0,
    pnlPct: 0,
    priceSourceLabel: 'Precio de la licitación',
    pendingDividendUsdc: 0,
    listingStatus: 'CLOSED_SUCCESS',
    ...over,
  };
}

const user = {
  authProvider: 'email',
  emailVerified: false,
  publicKey: ME,
  custodyMode: 'CUSTODIAL' as const,
  kycStatus: 'APPROVED' as const,
  twoFactorEnabled: false,
  trustlines: ['L1'],
};

const book = (over: Partial<Portfolio> = {}): Portfolio => ({
  cashUsdc: 0,
  usdcOnChain: 50,
  positions: [],
  totals: { costBasis: 0, marketValue: 0, pnl: 0, pnlPct: 0, pendingDividends: 0 },
  ...over,
});

describe('tasks', () => {
  it('lists position actions first, then open setup items, then done ones', () => {
    const positions = [
      position({ listingId: 'L2', tokenTicker: 'NEW' }),
      position({ pendingDividendUsdc: 3 }),
    ];
    const tasks = tasksFor(user, book(), positions);
    expect(tasks.map((t) => t.id)).toEqual(['trust-L2', 'div-L1', 'email', 'twoFa', 'wallet', 'kyc', 'usdc']);
    expect(tasks.find((t) => t.id === 'div-L1')).toMatchObject({
      action: 'dividend',
      amount: 3,
      done: false,
    });
    expect(pendingCount(tasks)).toBe(4);
  });

  it('offers a refund instead of anything else on a failed offering', () => {
    const tasks = tasksFor(user, book(), [position({ listingStatus: 'CLOSED_FAILED', canRefund: true })]);
    expect(tasks.filter((t) => t.listingId === 'L1').map((t) => t.kind)).toEqual(['refund']);
  });

  it('asks to fund USDC only once the book says the wallet is empty', () => {
    expect(tasksFor(user, null, []).some((t) => t.kind === 'usdc')).toBe(false);
    expect(tasksFor(user, book({ usdcOnChain: 0 }), []).find((t) => t.kind === 'usdc')).toMatchObject({
      done: false,
      action: 'fundUsdc',
    });
  });

  it('claims owed tokens and moves them on-chain when needed', () => {
    const tasks = tasksFor(user, book(), [position({ tokensOwed: 4, canClaim: true, tokensOnChain: 2 })]);
    expect(tasks.filter((t) => t.listingId === 'L1').map((t) => t.kind)).toEqual(['claim', 'receive']);
  });
});

describe('activity', () => {
  const op = (over: Partial<HorizonOperation>): HorizonOperation => ({
    id: '1',
    type: 'payment',
    created_at: '2026-10-29T23:22:00Z',
    transaction_hash: 'abc',
    ...over,
  });

  it('describes operations from the wallet point of view', () => {
    const fmt = (raw: string) => String(Number(raw));
    expect(
      describeOperation(op({ to: ME, amount: '200.0000000', asset_code: 'USDC' }), ME, fmt),
    ).toMatchObject({
      key: 'received',
      vars: { amount: '200', asset: 'USDC' },
      direction: 'in',
    });
    expect(
      describeOperation(op({ from: ME, to: 'GX', amount: '1', asset_type: 'native' }), ME, fmt).vars.asset,
    ).toBe('XLM');
    expect(
      describeOperation(op({ type: 'change_trust', limit: '0.0000000', asset_code: 'TOK' }), ME, fmt).key,
    ).toBe('trustOff');
    expect(describeOperation(op({ type: 'invoke_host_function' }), ME, fmt).key).toBe('contract');
    expect(describeOperation(op({ type: 'bump_sequence' }), ME, fmt)).toMatchObject({
      key: 'other',
      vars: { type: 'bump sequence' },
    });
  });

  it('buckets operations per local day, oldest first, ending today', () => {
    const now = new Date(2026, 9, 30, 12);
    const rows = dailyCounts(
      [
        { created_at: new Date(2026, 9, 29, 20).toISOString() },
        { created_at: new Date(2026, 9, 29, 21).toISOString() },
        { created_at: new Date(2026, 9, 30, 9).toISOString() },
        { created_at: new Date(2026, 8, 1).toISOString() },
      ],
      now,
      7,
    );
    expect(rows).toHaveLength(7);
    expect(rows.at(-1)).toMatchObject({ key: '2026-10-30', count: 1 });
    expect(rows.at(-2)).toMatchObject({ key: '2026-10-29', count: 2 });
    expect(rows.reduce((s, r) => s + r.count, 0)).toBe(3);
  });
});

describe('allocation', () => {
  it('keeps up to four assets with stable slots and folds the rest', () => {
    const ps = ['DDD', 'AAA', 'CCC', 'BBB', 'EEE'].map((ticker, i) =>
      position({ listingId: ticker, tokenTicker: ticker, marketValue: 100 - i * 10 }),
    );
    const four = byAsset(ps.slice(0, 4), 'Otros');
    expect(four.map((s) => [s.label, s.slot])).toEqual([
      ['AAA', 1],
      ['BBB', 2],
      ['CCC', 3],
      ['DDD', 4],
    ]);
    const five = byAsset(ps, 'Otros');
    expect(five.map((s) => s.label)).toEqual(['AAA', 'CCC', 'DDD', 'Otros']);
    expect(five.at(-1)).toMatchObject({ slot: 'other', value: 70 + 60 });
  });

  it('splits tokens and cash, dropping empty parts', () => {
    expect(byType(0, 10, { tokens: 'T', cash: 'C' }).map((s) => s.key)).toEqual(['cash']);
  });
});

describe('positions and format', () => {
  it('never shows raw contract states as chips', () => {
    expect(positionPhase(position({ listingStatus: 'CLOSED_FAILED', canRefund: true }))).toBe(
      'refundAvailable',
    );
    expect(positionPhase(position({ listingStatus: 'CLOSED_FAILED' }))).toBe('failed');
    expect(positionPhase(position({ refundedAt: '2026-10-01' }))).toBe('refunded');
    const now = Date.now();
    const pool = { status: 'OPEN', raisedAmount: 10, softCap: 50, hardCap: 100, daysRemaining: 2 } as Pool;
    expect(poolPhase(pool, now)).toBe('closingSoon');
    // Same offering, same words on every screen: a successful close reads "Cerrada".
    expect(poolPhase({ ...pool, status: 'SUCCESSFUL', raisedAmount: 100 }, now)).toBe('closed');
  });

  it('falls back to session holdings priced at cost', () => {
    const rows = positionsFrom(
      null,
      [{ listingId: 'L', tokenTicker: 'T', usdcAmount: 50, tokens: 3, tokensOwed: 2 }],
      '…',
    );
    expect(rows[0]).toMatchObject({ shares: 5, costBasis: 50, marketValue: 50, canClaim: true });
  });

  it('tells the elapsed day of an offering', () => {
    const now = new Date('2026-10-30T12:00:00Z');
    expect(offeringDay('2026-10-19T12:00:00Z', 30, now)).toEqual({ day: 12, total: 30 });
    expect(offeringDay('2026-09-01T00:00:00Z', 21, now)).toEqual({ day: 21, total: 21 });
    expect(offeringDay(undefined, 30, now)).toBeNull();
  });

  it('formats signs and shares in es-AR', () => {
    expect(signed(12.5)).toBe('+12,50');
    expect(signed(-3)).toBe('−3,00');
    expect(signed(0)).toBe('0,00');
    expect(pct(0.074)).toBe('7 %');
    expect(pct(0.004)).toBe('0,4 %');
  });
});
