import { describe, expect, it } from 'vitest';
import type { ChainAsset, ChainPortfolio } from '@fractachain/shared';
import type { Pool, Portfolio, Position } from '@/core/api/types';
import { dailyCounts, describeOperation, type HorizonOperation } from '@/features/portfolio/model/activity';
import { byAsset, byType } from '@/features/portfolio/model/allocation';
import {
  holdingPhase,
  holdingsFromChain,
  valueByCode,
  valueIn,
  walletFromChain,
  type ChainHolding,
  type ChainWallet,
} from '@/features/portfolio/model/chain';
import { pct, signed } from '@/features/portfolio/model/format';
import { poolPhase, positionPhase } from '@/core/market/phase';
import { offeringDay } from '@/features/portfolio/model/positions';
import { pendingCount, tasksFor } from '@/features/portfolio/model/tasks';

const ME = 'GADCUHWTKGKVSXUOMGJ654BA76DHDKHJAWPBFOXOCVCJQ7IXMGGME4OD';
const TENDER = 'CBXPBRQTENDERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const USDC: ChainAsset = {
  code: 'USDC',
  issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  contractId: 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
  decimals: 7,
  explorer:
    'https://stellar.expert/explorer/testnet/contract/CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
};
const XLM: ChainAsset = {
  code: 'XLM',
  issuer: null,
  contractId: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
  decimals: 7,
  explorer: '',
};

function holding(over: Partial<ChainHolding> = {}): ChainHolding {
  return {
    listingId: 'L1',
    contractId: TENDER,
    explorer: `https://stellar.expert/explorer/testnet/contract/${TENDER}`,
    ticker: 'TOK',
    title: 'Tok SA',
    units: 20,
    price: 10,
    value: 200,
    code: 'USDC',
    asset: USDC,
    stateName: 'Successful',
    tokens: 0,
    tokensOwed: 0,
    tokensOnChain: 0,
    sdex: false,
    finalizeHash: null,
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

const wallet = (usdc: Partial<NonNullable<ChainWallet['usdc']>> | null = {}): ChainWallet => ({
  address: ME,
  readAt: '2026-10-30T12:00:00Z',
  xlm: 9999,
  usdc: usdc === null ? null : { asset: USDC, balance: 50, trustline: true, ...usdc },
});

describe('holdings from the chain', () => {
  const chain: ChainPortfolio = {
    address: ME,
    readAt: '2026-10-30T12:00:00Z',
    xlm: 9999.5,
    usdc: { asset: USDC, balance: 80, trustline: true },
    positions: [
      {
        tender: { contractId: TENDER, explorer: 'x' },
        listingId: 'L1',
        title: 'Sur SA',
        state: 'Successful',
        rwaBalance: 20,
        pricePerUnit: 10,
        paymentToken: USDC,
      },
      {
        tender: { contractId: 'CXLM', explorer: 'y' },
        listingId: null,
        title: null,
        state: 'Open',
        rwaBalance: 3,
        pricePerUnit: 5,
        paymentToken: XLM,
      },
      {
        tender: { contractId: 'CZERO', explorer: 'z' },
        listingId: 'L9',
        title: 'Zero',
        state: 'Open',
        rwaBalance: 0,
        pricePerUnit: 5,
        paymentToken: USDC,
      },
    ],
  };
  const book = {
    positions: [
      {
        listingId: 'L1',
        tokenTicker: 'SUR',
        legalName: 'Sur Infraestructura S.A.',
        tokensOwed: 2,
        tokens: 5,
        tokensOnChain: 3,
        sdex: true,
      } as Position,
    ],
  } as Portfolio;

  it('takes units, price and state from the contract and only labels from the platform', () => {
    const rows = holdingsFromChain(chain, book);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      ticker: 'SUR',
      title: 'Sur Infraestructura S.A.',
      units: 20,
      price: 10,
      value: 200,
      code: 'USDC',
      tokensOwed: 2,
    });
    // A tender the platform doesn't know is still shown, labelled by its contract id.
    expect(rows[1]).toMatchObject({ listingId: 'CXLM', code: 'XLM', value: 15 });
  });

  it('never adds XLM-priced value to USDC', () => {
    const rows = holdingsFromChain(chain, book);
    expect(valueByCode(rows)).toEqual([
      { code: 'USDC', value: 200 },
      { code: 'XLM', value: 15 },
    ]);
    expect(valueIn(rows, 'USDC')).toBe(200);
  });

  it('reads the wallet balances as Stellar reports them', () => {
    expect(walletFromChain(chain)).toMatchObject({ xlm: 9999.5, usdc: { balance: 80, trustline: true } });
    expect(walletFromChain(null)).toBeNull();
  });

  it('maps the contract state to the shared phase chip', () => {
    expect(holdingPhase({ stateName: 'Open', units: 1 })).toBe('open');
    expect(holdingPhase({ stateName: 'Failed', units: 1 })).toBe('refundAvailable');
    expect(holdingPhase({ stateName: 'Failed', units: 0 })).toBe('failed');
    expect(holdingPhase({ stateName: 'Successful', units: 1 })).toBe('closed');
  });
});

describe('tasks', () => {
  it('lists holding actions first, then open setup items, then done ones', () => {
    const tasks = tasksFor(user, wallet(), [
      holding({ listingId: 'L2', ticker: 'NEW', sdex: true }),
      holding({ tokensOwed: 3 }),
    ]);
    expect(tasks.map((t) => t.id)).toEqual([
      'trust-L2',
      'claim-L1',
      'email',
      'twoFa',
      'wallet',
      'kyc',
      'usdc',
    ]);
    expect(pendingCount(tasks)).toBe(4);
  });

  it('offers a refund instead of anything else when the contract failed', () => {
    const tasks = tasksFor(user, wallet(), [holding({ stateName: 'Failed', tokensOwed: 3 })]);
    expect(tasks.filter((t) => t.listingId === 'L1').map((t) => t.kind)).toEqual(['refund']);
  });

  it('asks to fund USDC only when the chain says the wallet is empty', () => {
    expect(tasksFor(user, null, []).some((t) => t.kind === 'usdc')).toBe(false);
    expect(tasksFor(user, wallet({ balance: 0 }), []).find((t) => t.kind === 'usdc')).toMatchObject({
      done: false,
      action: 'fundUsdc',
    });
  });

  it('asks a self-custody wallet to sign the USDC trustline first', () => {
    const self = { ...user, custodyMode: 'SELF' as const };
    expect(
      tasksFor(self, wallet({ balance: 0, trustline: false }), []).find((t) => t.kind === 'usdc'),
    ).toMatchObject({
      action: 'enableUsdc',
      code: 'USDC',
    });
  });

  it('claims owed tokens and moves them on-chain when needed', () => {
    const tasks = tasksFor(user, wallet(), [
      holding({ tokensOwed: 4, sdex: true, tokens: 6, tokensOnChain: 2 }),
    ]);
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
    const hs = ['DDD', 'AAA', 'CCC', 'BBB', 'EEE'].map((ticker, i) =>
      holding({ listingId: ticker, ticker, contractId: `C${ticker}`, value: 100 - i * 10 }),
    );
    const four = byAsset(hs.slice(0, 4), 'Otros');
    expect(four.map((s) => [s.label, s.slot])).toEqual([
      ['AAA', 1],
      ['BBB', 2],
      ['CCC', 3],
      ['DDD', 4],
    ]);
    const five = byAsset(hs, 'Otros');
    expect(five.map((s) => s.label)).toEqual(['AAA', 'CCC', 'DDD', 'Otros']);
    expect(five.at(-1)).toMatchObject({ slot: 'other', value: 70 + 60 });
  });

  it('only splits holdings priced in the chosen asset', () => {
    expect(byAsset([holding(), holding({ listingId: 'X', code: 'XLM' })], 'Otros').map((s) => s.key)).toEqual(
      ['L1'],
    );
  });

  it('splits tokens and cash, dropping empty parts', () => {
    expect(byType(0, 10, { tokens: 'T', cash: 'C' }).map((s) => s.key)).toEqual(['cash']);
  });
});

describe('phases and format', () => {
  it('never shows raw contract states as chips', () => {
    const now = Date.now();
    const pool = { status: 'OPEN', raisedAmount: 10, softCap: 50, hardCap: 100, daysRemaining: 2 } as Pool;
    expect(poolPhase(pool, now)).toBe('closingSoon');
    // Same offering, same words on every screen: a successful close reads "Cerrada".
    expect(poolPhase({ ...pool, status: 'SUCCESSFUL', raisedAmount: 100 }, now)).toBe('closed');
    expect(positionPhase({ listingStatus: 'CLOSED_FAILED', canRefund: true })).toBe('refundAvailable');
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
