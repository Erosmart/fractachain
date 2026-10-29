import { describe, expect, it } from 'vitest';
import {
  canFinalizeFromSnapshot,
  expectedCloseStatus,
  parseLicitacionState,
} from '../../src/domain/licitacion/LicitacionState';
import { settlementAction } from '../../src/domain/licitacion/SettlementRules';
import { SandboxMatchingEngine, type BookOrder } from '../../src/domain/market/SandboxBook';
import { DossierValidator } from '../../src/domain/listing/Listing';
import { GafiPolicy } from '../../src/domain/kyc/KycRecord';
import { ValidationError } from '../../src/shared/errors';

const order = (
  id: string,
  side: 'BUY' | 'SELL',
  price: number,
  amount: number,
  accountId = id,
  createdAt = '2026-01-01T00:00:00Z',
): BookOrder => ({
  id,
  listingId: 'L',
  tokenTicker: 'TKN',
  accountId,
  side,
  price,
  amount,
  remaining: amount,
  status: 'OPEN',
  createdAt,
});

describe('licitación lifecycle', () => {
  it('parses every state encoding the SDK may return', () => {
    expect(parseLicitacionState(1)).toBe(1);
    expect(parseLicitacionState(2n)).toBe(2);
    expect(parseLicitacionState('Failed')).toBe(2);
    expect(parseLicitacionState({ tag: 'Successful' })).toBe(1);
    expect(parseLicitacionState(null)).toBe(-1);
  });

  it('finalizes only on hard cap or deadline (soft cap alone never closes)', () => {
    const base = { state: 0, hardCap: 100, deadlineMs: 2_000, nowMs: 1_000 };
    expect(canFinalizeFromSnapshot({ ...base, raised: 50 })).toEqual({
      canFinalize: false,
      reason: 'waiting',
    });
    expect(canFinalizeFromSnapshot({ ...base, raised: 100 }).reason).toBe('hard_cap');
    expect(canFinalizeFromSnapshot({ ...base, raised: 1, nowMs: 3_000 }).reason).toBe('deadline');
    expect(canFinalizeFromSnapshot({ ...base, state: 1, raised: 100 }).reason).toBe('already_closed');
  });

  it('maps the closing state', () => {
    expect(expectedCloseStatus({ state: 1, raised: 0, softCap: 10 })).toBe('CLOSED_SUCCESS');
    expect(expectedCloseStatus({ state: 0, raised: 5, softCap: 10 })).toBe('CLOSED_FAILED');
  });

  it('only checks the chain for open on-chain offerings', () => {
    expect(settlementAction({ status: 'CLOSED_SUCCESS', onChain: false })).toBe('settle_holders');
    expect(settlementAction({ status: 'LISTED', onChain: true })).toBe('check_chain');
    expect(settlementAction({ status: 'LISTED', onChain: false })).toBe('skip');
  });
});

describe('SandboxMatchingEngine', () => {
  it('crosses at the resting price with price-time priority and skips self-trades', () => {
    const asks = [
      order('a1', 'SELL', 11, 5, 'seller1', '2026-01-01T00:00:02Z'),
      order('a2', 'SELL', 10, 3, 'seller2', '2026-01-01T00:00:03Z'),
      order('a3', 'SELL', 10, 4, 'seller3', '2026-01-01T00:00:01Z'),
      order('self', 'SELL', 9, 10, 'buyer'),
    ];
    const bid = order('b', 'BUY', 10.5, 6, 'buyer');
    const steps = SandboxMatchingEngine.match([...asks, bid], bid);
    expect(steps.map((s) => [s.counter.id, s.quantity, s.price])).toEqual([
      ['a3', 4, 10],
      ['a2', 2, 10],
    ]);
  });

  it('aggregates levels with depth', () => {
    const levels = SandboxMatchingEngine.levels(
      [order('x', 'BUY', 10, 2), order('y', 'BUY', 10, 3), order('z', 'BUY', 9, 5)],
      'L',
      'BUY',
    );
    expect(levels.map((l) => [l.price, l.amount, l.depthPercent])).toEqual([
      [10, 5, 100],
      [9, 5, 100],
    ]);
  });
});

describe('policies', () => {
  it('rejects dossiers whose payout wallet is invalid or is the issuer', () => {
    const dossier = {
      legalName: 'X SA',
      tradeName: 'X',
      cuit: '30-12345678-9',
      jurisdiction: 'AR',
      sector: 'Agro',
      ticker: 'X',
      tokenTicker: 'TX',
      isin: 'ARX',
      authorizedShares: 1,
      sharesToTokenize: 1,
      pricePerShareUsdc: 1,
      cajaSubaccount: 'CV',
      custodianCuit: '30',
      cnvRecordId: 'CNV',
      bymaRequestId: '',
      legalTermsUri: 'https://x',
      estatutoHash: 'h',
      auditor: 'a',
      issuerPublicKey: 'GAGPWEIFYS54Y5WY3WJ6IWXK4YAPSNRVOEWEGBL7W3BKR6YL4VUYE653',
      proceedsWallet: 'GNOTAKEY',
      paymentKind: 'USDC' as const,
      offeringSoftCapUsdc: 1,
      offeringHardCapUsdc: 2,
      offeringDays: 1,
      tnaUsd: 0,
      useOfProceeds: '',
    };
    expect(() => DossierValidator.assertComplete(dossier)).toThrow(ValidationError);
    expect(() =>
      DossierValidator.assertComplete({ ...dossier, proceedsWallet: dossier.issuerPublicKey }),
    ).toThrow(/emisora/);
  });

  it('blocks FATF high-risk jurisdictions', () => {
    expect(GafiPolicy.isBlacklisted(408)).toBe(true);
    expect(GafiPolicy.isBlacklisted(32)).toBe(false);
  });
});
