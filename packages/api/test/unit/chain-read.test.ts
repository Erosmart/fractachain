import express from 'express';
import request from 'supertest';
import { Keypair, StrKey, scValToNative, type xdr } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { ChainReadService, type ChainSources } from '../../src/application/chain/ChainReadService';
import {
  decodeCaps,
  enumName,
  parseSacName,
  scaleDown,
  TENDER_STATES,
} from '../../src/application/chain/decode';
import { ChainController } from '../../src/http/controllers/ChainController';
import { errorHandler } from '../../src/http/middleware/errorHandler';
import type { AccountSnapshot, IAccountReader } from '../../src/infrastructure/stellar/AccountReader';
import {
  ContractNotFoundError,
  MissingContractFunctionError,
  type IContractReader,
} from '../../src/infrastructure/stellar/ContractReader';
import type { TestnetDeployment } from '../../src/infrastructure/stellar/DeploymentRegistry';
import { NullLogger } from '../../src/shared/logger';

const cid = () => StrKey.encodeContract(Keypair.random().rawPublicKey());
const gid = () => Keypair.random().publicKey();

const USDC_ISSUER = gid();
const USDC = cid();
const XLM_SAC = cid();
const TENDER = cid();
const LEGACY_TENDER = cid();
const BROKEN_TENDER = cid();
const FORWARD = cid();
const WARRANT = cid();
const BROKEN_WARRANT = cid();
const VAULT = cid();
const INVESTOR = gid();

type Fn = (args: unknown[]) => unknown;

/** Contracts as maps of function → result; a missing function behaves like an older WASM. */
class FakeReader implements IContractReader {
  readonly calls: string[] = [];
  constructor(private readonly contracts: Record<string, Record<string, Fn | unknown>>) {}

  async call<T>(contractId: string, fn: string, args: xdr.ScVal[] = []): Promise<T> {
    this.calls.push(`${contractId.slice(0, 4)}.${fn}`);
    const contract = this.contracts[contractId];
    if (!contract) throw new Error('contract not found');
    if (!(fn in contract)) throw new MissingContractFunctionError(contractId, fn);
    const impl = contract[fn];
    const value = typeof impl === 'function' ? (impl as Fn)(args.map((a) => scValToNative(a))) : impl;
    if (value instanceof Error) throw value;
    return value as T;
  }
}

class FakeAccounts implements IAccountReader {
  async snapshot(address: string): Promise<AccountSnapshot> {
    if (address === INVESTOR) {
      return { exists: true, xlm: 9876.5, assets: [{ code: 'USDC', issuer: USDC_ISSUER, balance: 250.25 }] };
    }
    return { exists: false, xlm: 0, assets: [] };
  }
}

const tender = (extra: Record<string, unknown> = {}) => ({
  get_state: 0,
  get_total_raised: 1_500_000_000n, // 150 USDC at 7 decimals
  get_price_per_unit: 100_000_000n, // 10 USDC
  get_payment_token: USDC,
  get_legal_info: {
    cnv_record_id: 'CNV-1',
    legal_terms_uri: 'https://x/terms',
    fideicomiso_hash: Buffer.alloc(32, 1),
  },
  get_fiduciary: gid(),
  proceeds_withdrawn: false,
  get_rwa_balance: ([who]: unknown[]) => (who === INVESTOR ? 15n : 0n),
  ...extra,
});

const contracts: Record<string, Record<string, unknown>> = {
  [USDC]: { name: `USDC:${USDC_ISSUER}`, decimals: 7, symbol: 'USDC' },
  [XLM_SAC]: { name: 'native', decimals: 7, symbol: 'native' },
  [TENDER]: tender({ get_caps: [1_000_000_000n, 2_000_000_000n], get_deadline: 1_900_000_000n }),
  [LEGACY_TENDER]: tender({ get_payment_token: XLM_SAC, get_state: 1, get_rwa_balance: () => 3n }),
  [BROKEN_TENDER]: { get_state: new Error('rpc down'), get_rwa_balance: new Error('rpc down') },
  [FORWARD]: {
    get_state: 0,
    get_total_kilos: 30_000n,
    get_crop_name: 'Soja',
    get_payment_token: USDC,
    get_parties: [gid(), gid(), gid()],
    get_position: [0, true, 1_800_000_000n, false, 1_850_000_000n, 1, 5_000_000_000n],
  },
  [WARRANT]: {
    get_status: 1,
    get_loan_amount: 7_000_000_000n,
    get_payment_token: USDC,
    get_producer: gid(),
    get_terms: [10_000_000_000n, 7000, 1200, 1_800_000_000n, 1_830_000_000n, 1_810_000_000n],
  },
  [BROKEN_WARRANT]: { get_status: new Error('boom'), get_loan_amount: 0n, get_payment_token: USDC },
  [VAULT]: {
    get_metadata: {
      ticker: 'YPFD',
      company_name: 'YPF',
      isin: 'ARYPFD',
      total_shares_custodied: 1000n,
      total_tokens_minted: 400n,
      custodian_cuit: '30-1',
      last_audit_timestamp: 1_800_000_000n,
      dividend_per_token_accum: 0n,
    },
    get_payment_token: USDC,
    get_unclaimed_pool: 0n,
    is_mint_paused: false,
    get_mint_proof: ([seq]: unknown[]) =>
      Number(seq) >= 1 && Number(seq) <= 5
        ? [INVESTOR, BigInt(Number(seq) * 10), Buffer.alloc(32, 7)]
        : new Error('Unknown mint'),
    get_balance: () => 40n,
    get_claimable: () => 12_345_000n,
  },
};

function service(deployment: Partial<TestnetDeployment> = {}, reader = new FakeReader(contracts)) {
  const sources: ChainSources = {
    deployment: () => ({ network: 'testnet', usdcSac: USDC, ...deployment }) as TestnetDeployment,
    listedTenders: () => [{ contractId: TENDER, listingId: 'IPO-1', title: 'Las Lilas' }],
  };
  let t = 1_700_000_000_000;
  const svc = new ChainReadService(
    reader,
    new FakeAccounts(),
    sources,
    {
      network: 'testnet',
      networkPassphrase: () => 'Test SDF Network ; September 2015',
      rpcUrl: () => 'https://rpc',
      horizonUrl: () => 'https://horizon',
      explorerUrl: 'https://stellar.expert/explorer/testnet',
    },
    { now: () => (t += 1), isoNow: () => new Date(t).toISOString() },
    new NullLogger(),
  );
  return { svc, reader };
}

describe('chain decoding', () => {
  it('scales base units with the token decimals exactly', () => {
    expect(scaleDown(1_500_000_000n, 7)).toBe(150);
    expect(scaleDown(1n, 7)).toBe(0.0000001);
    expect(scaleDown(-25_000_000n, 7)).toBe(-2.5);
    expect(scaleDown(123n, 0)).toBe(123);
  });

  it('names enums, SAC names and caps', () => {
    expect(enumName(TENDER_STATES, 2)).toEqual({ code: 2, name: 'Failed' });
    expect(enumName(TENDER_STATES, 9).name).toBe('#9');
    expect(parseSacName('native')).toEqual({ code: 'XLM', issuer: null });
    expect(parseSacName(`USDC:${USDC_ISSUER}`)).toEqual({ code: 'USDC', issuer: USDC_ISSUER });
    expect(parseSacName('MyToken')).toBeNull();
    expect(decodeCaps([1n, 2n])).toEqual({ soft: 1n, hard: 2n });
    expect(decodeCaps({ soft_cap: 1n, hard_cap: 2n })).toEqual({ soft: 1n, hard: 2n });
  });
});

describe('ChainReadService', () => {
  it('reads a tender from the contract, normalized with decimals()', async () => {
    const { svc } = service();
    const t = await svc.tender(TENDER, INVESTOR);
    expect(t.contractId).toBe(TENDER);
    expect(t.explorer).toBe(`https://stellar.expert/explorer/testnet/contract/${TENDER}`);
    expect(t.state).toEqual({ code: 0, name: 'Open' });
    expect(t.totalRaised).toBe(150);
    expect(t.pricePerUnit).toBe(10);
    expect([t.softCap, t.hardCap]).toEqual([100, 200]);
    expect(t.deadline).toBe(new Date(1_900_000_000_000).toISOString());
    expect(t.paymentToken).toMatchObject({
      code: 'USDC',
      issuer: USDC_ISSUER,
      contractId: USDC,
      decimals: 7,
    });
    expect(t.legalInfo).toEqual({
      cnvRecordId: 'CNV-1',
      legalTermsUri: 'https://x/terms',
      fideicomisoHash: '01'.repeat(32),
    });
    expect(t.holder).toEqual({ address: INVESTOR, rwaBalance: 15, paymentBalance: 250.25 });
    expect(t.reads).toEqual(
      expect.arrayContaining(['get_state', 'get_caps', 'get_deadline', 'get_rwa_balance']),
    );
  });

  it('degrades the getters older tenders lack instead of failing', async () => {
    const { svc } = service();
    const t = await svc.tender(LEGACY_TENDER, INVESTOR);
    expect([t.softCap, t.hardCap, t.deadline]).toEqual([null, null, null]);
    expect(t.reads).not.toContain('get_caps');
    expect(t.state.name).toBe('Successful');
    expect(t.paymentToken).toMatchObject({ code: 'XLM', issuer: null });
    expect(t.holder?.paymentBalance).toBe(9876.5);
  });

  it('rejects bad ids and maps RPC failures to UPSTREAM_FAILED', async () => {
    const { svc } = service();
    await expect(svc.tender('not-a-contract')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(svc.tender(TENDER, 'GBAD')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(svc.tender(BROKEN_TENDER)).rejects.toMatchObject({ code: 'UPSTREAM_FAILED' });
  });

  it('builds the portfolio from chain balances only, skipping a tender that fails', async () => {
    const { svc } = service({ seeded: { tenders: [LEGACY_TENDER, BROKEN_TENDER] } });
    const p = await svc.portfolio(INVESTOR);
    expect(p.xlm).toBe(9876.5);
    expect(p.usdc).toMatchObject({ balance: 250.25, trustline: true, asset: { code: 'USDC' } });
    expect(p.positions.map((x) => [x.tender.contractId, x.rwaBalance, x.title])).toEqual(
      expect.arrayContaining([
        [TENDER, 15, 'Las Lilas'],
        [LEGACY_TENDER, 3, null],
      ]),
    );
    expect(p.positions).toHaveLength(2);
  });

  it('decodes forwards and warrants and leaves out an instance that fails', async () => {
    const { svc } = service({ seeded: { forwards: [FORWARD], warrants: [WARRANT, BROKEN_WARRANT] } });
    const [f] = await svc.forwards();
    expect(f).toMatchObject({ state: 'Active', cropName: 'Soja', totalKilos: 30_000 });
    expect(f.position).toMatchObject({ delivered: true, rollovers: 1, escrow: 500, disputed: false });
    expect(f.position?.harvestDeadline).toBe(new Date(1_850_000_000_000).toISOString());
    expect(f.parties?.producer).toMatch(/^G/);
    const warrants = await svc.warrants();
    expect(warrants).toHaveLength(1);
    expect(warrants[0]).toMatchObject({ status: 'ActiveLoan', loanAmount: 700 });
    expect(warrants[0].terms).toMatchObject({ inventoryValue: 1000, ltvBps: 7000, interestRateBps: 1200 });
    expect(warrants[0].terms?.fundedAt).toBe(new Date(1_800_000_000_000).toISOString());
  });

  it('fails a list only when every instance fails', async () => {
    const { svc } = service({ seeded: { warrants: [BROKEN_WARRANT] } });
    await expect(svc.warrants()).rejects.toMatchObject({ code: 'UPSTREAM_FAILED' });
  });

  it('finds the latest mint proof by probing and reads the holder', async () => {
    const reader = new FakeReader(contracts);
    const { svc } = service({ seeded: { stockVaults: [VAULT] } }, reader);
    const [v] = await svc.stocks(INVESTOR);
    expect(v.lastProof).toEqual({ seq: 5, to: INVESTOR, amount: 50, cvDepositHash: '07'.repeat(32) });
    expect(v.metadata).toMatchObject({ ticker: 'YPFD', totalSharesCustodied: 1000, totalTokensMinted: 400 });
    expect(v.holder).toEqual({ address: INVESTOR, balance: 40, claimable: 1.2345 });
    expect(reader.calls.filter((c) => c.endsWith('get_mint_proof')).length).toBeLessThanOrEqual(8);
  });

  it('caches payloads and token metadata', async () => {
    const reader = new FakeReader(contracts);
    const { svc } = service({}, reader);
    await svc.tender(TENDER);
    const before = reader.calls.length;
    await svc.tender(TENDER);
    expect(reader.calls.length).toBe(before);
    expect(reader.calls.filter((c) => c.endsWith('.decimals'))).toHaveLength(1);
  });

  it('lists every contract it reads on the network view', async () => {
    const { svc } = service({
      factory: cid(),
      seeded: { forwards: [FORWARD], warrants: [WARRANT], stockVaults: [VAULT] },
    });
    const n = await svc.network();
    expect(n.usdc).toMatchObject({ code: 'USDC', contractId: USDC });
    expect(n.contracts.tenders.map((r) => r.contractId)).toEqual([TENDER]);
    expect(n.contracts.forwards[0].explorer).toContain(FORWARD);
  });
});

describe('ChainController', () => {
  const app = () => {
    const { svc } = service({ seeded: { forwards: [FORWARD] } });
    const a = express();
    const router = express.Router();
    new ChainController(svc).register(router);
    a.use(router);
    a.use(errorHandler(new NullLogger()));
    return a;
  };

  it('answers in the envelope, uncached', async () => {
    const res = await request(app()).get(`/api/chain/tenders/${TENDER}?holder=${INVESTOR}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.contractId).toBe(TENDER);
    expect(res.body.data.holder.rwaBalance).toBe(15);
    expect(res.headers['cache-control']).toMatch(/no-store/);
    const forwards = await request(app()).get('/api/chain/forwards');
    expect(forwards.body.data[0].contractId).toBe(FORWARD);
  });

  it('validates contract ids and addresses', async () => {
    const bad = await request(app()).get('/api/chain/tenders/XYZ');
    expect(bad.status).toBe(400);
    expect(bad.body).toMatchObject({ success: false, code: 'VALIDATION_FAILED' });
    expect((await request(app()).get('/api/chain/portfolio/GNOPE')).status).toBe(400);
    expect((await request(app()).get(`/api/chain/stocks?holder=nope`)).status).toBe(400);
  });
});

describe('missing contracts', () => {
  it('answers 404 for a contract ID with no instance on the network', async () => {
    const reader: IContractReader = {
      call: async (contractId) => {
        throw new ContractNotFoundError(contractId);
      },
    };
    const { svc } = service({}, reader as FakeReader);
    await expect(svc.tender(cid())).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });
});
