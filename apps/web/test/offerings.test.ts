import { describe, expect, it } from 'vitest';
import type { Pool } from '@/core/api/types';
import {
  checkAmount,
  companyName,
  money,
  offeringPhase,
  percentOf,
  poolPhase,
  subscriptionCurve,
  timeLeft,
  tokensFor,
} from '@/features/market/model';

const NOW = Date.UTC(2026, 9, 30, 12);
const DAY = 86_400_000;
const base = { status: 'LISTED' as const, raised: 10, softCap: 100, hardCap: 200, now: NOW };

describe('offering phase', () => {
  it('maps open offerings by progress and time left', () => {
    expect(offeringPhase({ ...base, deadlineMs: NOW + 10 * DAY })).toBe('open');
    expect(offeringPhase({ ...base, deadlineMs: NOW + 2 * DAY })).toBe('closingSoon');
    expect(offeringPhase({ ...base, raised: 120, deadlineMs: NOW + 2 * DAY })).toBe('minReached');
    expect(offeringPhase({ ...base, raised: 200, deadlineMs: NOW + 10 * DAY })).toBe('capFilled');
    expect(offeringPhase({ ...base, deadlineMs: NOW - DAY })).toBe('expired');
    expect(offeringPhase({ ...base, raised: 150, deadlineMs: NOW - DAY })).toBe('minReached');
  });

  it('never shows raw contract states', () => {
    expect(offeringPhase({ ...base, status: 'CLOSED_SUCCESS' })).toBe('closed');
    expect(offeringPhase({ ...base, stateName: 'Terminated' })).toBe('closed');
    expect(offeringPhase({ ...base, status: 'CLOSED_SUCCESS', hasDividends: true })).toBe('payingIncome');
    expect(offeringPhase({ ...base, stateName: 'Failed' })).toBe('failed');
    expect(offeringPhase({ ...base, status: 'CLOSED_FAILED', hasRefundableContribution: true })).toBe(
      'refundAvailable',
    );
    expect(offeringPhase({ ...base, status: 'TOKENS_MINTED' })).toBe('upcoming');
  });

  it('reads catalog rows', () => {
    const pool = {
      status: 'OPEN',
      raisedAmount: 0,
      softCap: 100,
      hardCap: 200,
      daysRemaining: 1,
    } as Pool;
    expect(poolPhase(pool, NOW)).toBe('closingSoon');
    expect(poolPhase({ ...pool, status: 'FAILED' }, NOW)).toBe('failed');
    expect(poolPhase({ ...pool, status: 'SUCCESSFUL' }, NOW)).toBe('closed');
  });
});

describe('offering helpers', () => {
  it('formats money the es-AR way', () => {
    expect(money(1234.5, 'USDC')).toBe('US$ 1.234,50');
    expect(money(200, 'USDC')).toBe('US$ 200');
    expect(money(20, 'XLM')).toBe('20 XLM');
  });

  it('extracts the company name from the catalog', () => {
    expect(
      companyName({ producerName: 'Sur S.A. (CUIT 30-1-4)', title: 'Oferta primaria T · Sur S.A.' }),
    ).toBe('Sur S.A.');
    expect(companyName({ producerName: '', title: 'Oferta primaria T · Sur S.A.' })).toBe('Sur S.A.');
  });

  it('validates a subscription amount', () => {
    expect(checkAmount(0, { min: 20, capacity: 100 })).toEqual({ ok: false, error: 'empty' });
    expect(checkAmount(10, { min: 20, capacity: 100 })).toEqual({ ok: false, error: 'belowMin' });
    expect(checkAmount(120, { min: 20, capacity: 100 })).toEqual({ ok: false, error: 'aboveCapacity' });
    expect(checkAmount(50, { min: 20, capacity: 100, balance: 40 })).toEqual({
      ok: false,
      error: 'aboveBalance',
    });
    expect(checkAmount(50, { min: 20, capacity: 100 })).toEqual({ ok: true });
  });

  it('computes tokens, percentages and time left', () => {
    expect(tokensFor(100, 10)).toBe(10);
    expect(tokensFor(10, 3)).toBe(3.3333);
    expect(tokensFor(10, 0)).toBe(0);
    expect(percentOf(50, 200)).toBe(25);
    expect(percentOf(300, 200)).toBe(100);
    expect(percentOf(1, 0)).toBe(0);
    expect(timeLeft(NOW + DAY + 3 * 3_600_000 + 60_000, NOW)).toEqual({
      days: 1,
      hours: 3,
      minutes: 1,
      done: false,
    });
    expect(timeLeft(NOW - 1, NOW).done).toBe(true);
  });
});

describe('subscription curve', () => {
  it('accumulates per calendar day, filling quiet days and starting from undated money', () => {
    const curve = subscriptionCurve(
      [
        { date: '2026-10-27', usdc: 50 },
        { date: '2026-10-29', usdc: 30 },
        { date: '2026-10-29', usdc: 20 },
      ],
      { undated: 100, until: Date.UTC(2026, 9, 30, 15) },
    );
    expect(curve.map((p) => [p.date, p.cumulative])).toEqual([
      ['2026-10-27', 150],
      ['2026-10-28', 150],
      ['2026-10-29', 200],
      ['2026-10-30', 200],
    ]);
    expect(subscriptionCurve([], { until: NOW })).toEqual([]);
    expect(subscriptionCurve([{ date: '2026-10-01', usdc: 1 }], { until: NOW, maxDays: 5 })).toHaveLength(5);
  });
});
