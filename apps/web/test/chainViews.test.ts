import { describe, expect, it } from 'vitest';
import type { ChainAsset, ChainForward, ChainStockVault, ChainWarrant } from '@fractachain/shared';
import {
  bpsToPct,
  forwardState,
  forwardView,
  parseChainDate,
  shortId,
  warrantStatus,
  warrantView,
  weight,
} from '@/features/derivatives/model';
import { backingPct, stockVaultView } from '@/features/stocks/model';

const usdc: ChainAsset = {
  code: 'USDC',
  issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  contractId: 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
  decimals: 7,
  explorer:
    'https://stellar.expert/explorer/testnet/contract/CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
};
const ref = {
  contractId: 'CAJD7PT2UNHQGRXMHESOFLPABEL4KTMDRDGY4NE5M23O4HI2LF6CFOUX',
  explorer:
    'https://stellar.expert/explorer/testnet/contract/CAJD7PT2UNHQGRXMHESOFLPABEL4KTMDRDGY4NE5M23O4HI2LF6CFOUX',
  readAt: '2026-10-30T11:00:00.000Z',
  reads: ['get_state', 'get_position', ''],
};

describe('chain view helpers', () => {
  it('parses ISO strings and Unix seconds, and treats 0 as "not set"', () => {
    expect(parseChainDate('2026-10-30T11:00:00.000Z')?.toISOString()).toBe('2026-10-30T11:00:00.000Z');
    expect(parseChainDate(1_793_000_000)?.getTime()).toBe(1_793_000_000_000);
    expect(parseChainDate('1793000000')?.getTime()).toBe(1_793_000_000_000);
    expect(parseChainDate(0)).toBeNull();
    expect(parseChainDate(null)).toBeNull();
    expect(parseChainDate('not a date')).toBeNull();
  });

  it('shortens IDs, converts basis points and picks a weight unit', () => {
    expect(shortId(ref.contractId)).toBe('CAJD…FOUX');
    expect(shortId('')).toBe('—');
    expect(bpsToPct(6000)).toBe(60);
    expect(bpsToPct(1250)).toBe(12.5);
    expect(weight(500)).toEqual({ value: 500, unit: 'kg' });
    expect(weight(250_000)).toEqual({ value: 250, unit: 't' });
  });

  it('maps contract enums by name or number, unknown values stay visible', () => {
    expect(forwardState('Active')).toBe('active');
    expect(forwardState(1)).toBe('fulfilled');
    expect(forwardState('Cancelled')).toBe('cancelled');
    expect(forwardState('Weird')).toBe('unknown');
    expect(warrantStatus('ActiveLoan')).toBe('activeLoan');
    expect(warrantStatus('3')).toBe('liquidated');
  });
});

describe('forwardView', () => {
  it('keeps the contract values and the asset the contract uses', () => {
    const f: ChainForward = {
      ...ref,
      state: 'Active',
      cropName: 'Soja',
      totalKilos: 250_000,
      parties: { producer: 'GPRODUCER', buyer: 'GBUYER' },
      arbiter: 'GARBITER',
      position: {
        delivered: true,
        deliveredAt: '2026-10-29T10:00:00.000Z',
        disputed: false,
        harvestDeadline: '2027-03-01T00:00:00.000Z',
        rollovers: 1,
        escrow: 1500.5,
      },
      paymentToken: usdc,
    };
    const v = forwardView(f);
    expect(v.stateKey).toBe('active');
    expect(v.tone).toBe('sky');
    expect(v.crop).toBe('Soja');
    expect(v.kilos).toBe(250_000);
    expect(v.position).toMatchObject({ delivered: true, rollovers: 1, escrow: 1500.5 });
    expect(v.position?.deliveredAt?.toISOString()).toBe('2026-10-29T10:00:00.000Z');
    expect(v.position?.harvestDeadline?.toISOString()).toBe('2027-03-01T00:00:00.000Z');
    expect(v.asset.code).toBe('USDC');
    expect(v.source.reads).toEqual(['get_state', 'get_position']);
    expect(v.source.readAt?.toISOString()).toBe('2026-10-30T11:00:00.000Z');
  });

  it('never invents a position or parties the chain did not return', () => {
    const v = forwardView({
      ...ref,
      state: 'Fulfilled',
      cropName: '',
      totalKilos: 0,
      parties: null,
      arbiter: null,
      position: null,
      paymentToken: { ...usdc, code: 'XLM', issuer: null },
    });
    expect(v.position).toBeNull();
    expect(v.producer).toBeNull();
    expect(v.crop).toBe('—');
    expect(v.asset.code).toBe('XLM');
  });
});

describe('warrantView', () => {
  it('converts basis points and dates', () => {
    const w: ChainWarrant = {
      ...ref,
      status: 'ActiveLoan',
      loanAmount: 6000,
      producer: 'GPRODUCERADDRESS',
      terms: {
        inventoryValue: 10_000,
        ltvBps: 6000,
        interestRateBps: 1200,
        fundedAt: '2026-10-01T00:00:00.000Z',
        dueAt: null,
        offerExpiresAt: '2026-10-31T00:00:00.000Z',
      },
      paymentToken: usdc,
    };
    const v = warrantView(w);
    expect(v.statusKey).toBe('activeLoan');
    expect(v.terms).toMatchObject({ inventoryValue: 10_000, ltvPct: 60, interestPct: 12 });
    expect(v.terms?.dueAt).toBeNull();
    expect(v.terms?.offerExpiresAt?.toISOString()).toBe('2026-10-31T00:00:00.000Z');
    expect(v.loanAmount).toBe(6000);
  });
});

describe('stockVaultView', () => {
  const vault: ChainStockVault = {
    ...ref,
    metadata: {
      ticker: 'tYPF',
      company_name: 'YPF S.A.',
      isin: 'ARP700011037',
      total_shares_custodied: 1000,
      total_tokens_minted: 800,
      custodian_cuit: '30-70000000-0',
      last_audit_timestamp: 1_793_000_000,
    },
    unclaimedPool: 12.5,
    mintPaused: false,
    lastProof: { seq: 3, to: 'GISSUER', amount: 800, cvDepositHash: 'ab'.repeat(32) },
    paymentToken: usdc,
    holder: { address: 'GHOLDER', balance: 10, claimable: 0.25 },
  };

  it('reads snake_case metadata and computes the backing from it', () => {
    const v = stockVaultView(vault);
    expect(v.ticker).toBe('tYPF');
    expect(v.company).toBe('YPF S.A.');
    expect(v.sharesCustodied).toBe(1000);
    expect(v.tokensMinted).toBe(800);
    expect(v.backingPct).toBe(125);
    expect(v.lastAudit?.getTime()).toBe(1_793_000_000_000);
    expect(v.lastProof).toEqual({ seq: 3, to: 'GISSUER', amount: 800, hash: 'ab'.repeat(32) });
    expect(v.holder).toEqual({ address: 'GHOLDER', balance: 10, claimable: 0.25 });
    expect(stockVaultView({ ...vault, reads: ['get_metadata', 'get_unclaimed_pool'] }).unclaimedPool).toBe(
      12.5,
    );
  });

  it('accepts camelCase and reports nothing minted instead of 100 %', () => {
    const v = stockVaultView({
      ...vault,
      metadata: { symbol: 'tGGAL', totalSharesCustodied: 0, totalTokensMinted: 0 },
      lastProof: null,
      holder: undefined,
    });
    expect(v.ticker).toBe('tGGAL');
    expect(v.backingPct).toBeNull();
    // ref.reads doesn't list get_unclaimed_pool: an older vault, so no number is shown.
    expect(v.unclaimedPool).toBeNull();
    expect(v.lastProof).toBeNull();
    expect(v.holder).toBeNull();
    expect(backingPct(null, 10)).toBeNull();
  });
});
