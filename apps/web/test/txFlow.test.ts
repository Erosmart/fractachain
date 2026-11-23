import { describe, expect, it } from 'vitest';
import type {
  ChainTender,
  TxBuildRequest,
  TxBuildResult,
  TxStatusResult,
  TxSubmitResult,
} from '@fractachain/shared';
import { ApiError } from '@/core/http/HttpClient';
import { classifyTxError, TxRunner, type TxApiLike, type TxSnapshot } from '@/core/wallet/TxRunner';
import { WalletError, type IWalletSigner, type SignOptions } from '@/core/wallet/WalletSigner';
import { checkContribution, statusFromChain, tenderView, unitsFor } from '@/features/market/chainModel';
import { assetAmount, feeXlm, fromBaseUnits, reviewArgs } from '@/components/tx/format';
import { walletState } from '@/components/tx/WalletStatusChip';

const ME = 'GADCUHWTKGKVSXUOMGJ654BA76DHDKHJAWPBFOXOCVCJQ7IXMGGME4OD';
const OTHER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const TENDER = 'CBXPBRQTENDERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const PASS = 'Test SDF Network ; September 2015';
const USDC = {
  code: 'USDC',
  issuer: OTHER,
  contractId: 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
  decimals: 7,
  explorer:
    'https://stellar.expert/explorer/testnet/contract/CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
};

function build(over: Partial<TxBuildResult> = {}): TxBuildResult {
  return {
    buildId: 'txb_1',
    xdr: 'AAAA-unsigned',
    action: 'contribute',
    network: 'testnet',
    networkPassphrase: PASS,
    source: ME,
    contractId: TENDER,
    function: 'contribute',
    args: [
      { name: 'buyer', value: ME },
      { name: 'payment_amount', value: '200000000' },
    ],
    asset: USDC,
    fee: '123456',
    expiresAt: new Date(Date.now() + 120_000).toISOString(),
    ...over,
  };
}

class FakeTxApi implements TxApiLike {
  builds: TxBuildRequest[] = [];
  submitted: { buildId: string; signedXdr: string }[] = [];
  buildResult: TxBuildResult | Error = build();
  submitResult: TxSubmitResult | Error = {
    hash: 'abc123',
    status: 'SUCCESS',
    ledger: 7,
    explorer: 'https://stellar.expert/explorer/testnet/tx/abc123',
    action: 'contribute',
  };
  statuses: (TxStatusResult | Error)[] = [];
  async build(request: TxBuildRequest) {
    this.builds.push(request);
    if (this.buildResult instanceof Error) throw this.buildResult;
    return this.buildResult;
  }
  async submit(buildId: string, signedXdr: string) {
    this.submitted.push({ buildId, signedXdr });
    if (this.submitResult instanceof Error) throw this.submitResult;
    return this.submitResult;
  }
  async status(hash: string): Promise<TxStatusResult> {
    const next = this.statuses.shift() ?? { hash, status: 'PENDING', explorer: '' };
    if (next instanceof Error) throw next;
    return next;
  }
}

class FakeSigner implements IWalletSigner {
  signed: { xdr: string; options?: SignOptions }[] = [];
  error: Error | null = null;
  async address() {
    return ME;
  }
  async detect() {
    return {
      installed: true,
      allowed: true,
      address: ME,
      network: 'TESTNET',
      networkPassphrase: PASS,
      networkOk: true,
    };
  }
  async signLoginChallenge(): Promise<never> {
    throw new Error('unused');
  }
  async signLinkChallenge(): Promise<never> {
    throw new Error('unused');
  }
  async signCloseChallenge(): Promise<never> {
    throw new Error('unused');
  }
  async signTransaction(xdr: string, options?: SignOptions) {
    this.signed.push({ xdr, options });
    if (this.error) throw this.error;
    return `${xdr}+signed`;
  }
}

function setup() {
  const api = new FakeTxApi();
  const signer = new FakeSigner();
  const seen: TxSnapshot['phase'][] = [];
  const runner = new TxRunner(api, signer, (s) => seen.push(s.phase), {
    pollDelayMs: 0,
    pollAttempts: 3,
    sleep: async () => undefined,
  });
  return { api, signer, runner, seen };
}

describe('TxRunner (Freighter flow)', () => {
  it('builds, shows the review, signs with the investor key and network, submits once', async () => {
    const { api, signer, runner, seen } = setup();
    const review = await runner.prepare({ action: 'contribute', listingId: 'L1', amount: 20 }, ME);
    expect(review.phase).toBe('review');
    expect(review.build?.contractId).toBe(TENDER);
    const done = await runner.sign();
    expect(done.phase).toBe('done');
    expect(done.outcome).toMatchObject({ hash: 'abc123', status: 'SUCCESS' });
    expect(signer.signed[0]).toEqual({
      xdr: 'AAAA-unsigned',
      options: { address: ME, networkPassphrase: PASS },
    });
    expect(api.submitted).toEqual([{ buildId: 'txb_1', signedXdr: 'AAAA-unsigned+signed' }]);
    expect(seen).toEqual(['preparing', 'review', 'signing', 'submitting', 'done']);
  });

  it('polls a pending submission until the network confirms', async () => {
    const { api, runner, seen } = setup();
    api.submitResult = { hash: 'h', status: 'PENDING', explorer: 'e', action: 'contribute' };
    api.statuses = [new Error('flaky'), { hash: 'h', status: 'SUCCESS', ledger: 9, explorer: 'e2' }];
    await runner.prepare({ action: 'refund', listingId: 'L1' });
    const done = await runner.sign();
    expect(done.phase).toBe('done');
    expect(done.outcome).toMatchObject({ hash: 'h', explorer: 'e2', ledger: 9 });
    expect(seen).toContain('confirming');
  });

  it('reports a transaction the network rejected, keeping its hash', async () => {
    const { api, runner } = setup();
    api.submitResult = { hash: 'h', status: 'PENDING', explorer: 'e', action: 'contribute' };
    api.statuses = [{ hash: 'h', status: 'FAILED', explorer: 'e' }];
    await runner.prepare({ action: 'contribute', listingId: 'L1', amount: 20 });
    const end = await runner.sign();
    expect(end.error?.code).toBe('TX_FAILED');
    expect(end.outcome?.hash).toBe('h');
  });

  it('refuses a build for another account than the linked one', async () => {
    const { api, runner } = setup();
    api.buildResult = build({ source: OTHER });
    const end = await runner.prepare({ action: 'contribute', listingId: 'L1', amount: 20 }, ME);
    expect(end.error).toMatchObject({ code: 'ACCOUNT_MISMATCH', facts: { expected: ME, actual: OTHER } });
  });

  it('does not ask the wallet to sign an expired build and lets the investor rebuild it', async () => {
    const { api, signer, runner } = setup();
    api.buildResult = build({ expiresAt: new Date(Date.now() - 1000).toISOString() });
    await runner.prepare({ action: 'contribute', listingId: 'L1', amount: 20 });
    const end = await runner.sign();
    expect(end.error).toMatchObject({ code: 'TX_EXPIRED', retryable: true });
    expect(signer.signed).toHaveLength(0);
    api.buildResult = build();
    expect((await runner.retry()).phase).toBe('review');
    expect(api.builds).toHaveLength(2);
  });

  it.each([
    ['WALLET_NOT_INSTALLED'],
    ['WALLET_DENIED'],
    ['WRONG_NETWORK'],
    ['ACCOUNT_MISMATCH'],
    ['USER_REJECTED'],
  ] as const)('surfaces wallet error %s without submitting', async (code) => {
    const { api, signer, runner } = setup();
    signer.error = new WalletError(code, 'x', code === 'WRONG_NETWORK' ? { network: 'PUBLIC' } : {});
    await runner.prepare({ action: 'contribute', listingId: 'L1', amount: 20 });
    const end = await runner.sign();
    expect(end.error?.code).toBe(code);
    expect(api.submitted).toHaveLength(0);
    if (code === 'WRONG_NETWORK') expect(end.error?.facts).toEqual({ network: 'PUBLIC' });
  });

  it('goes back to the review to sign again after a wallet problem', async () => {
    const { api, signer, runner } = setup();
    signer.error = new WalletError('WRONG_NETWORK', 'x', { network: 'PUBLIC' });
    await runner.prepare({ action: 'contribute', listingId: 'L1', amount: 20 });
    await runner.sign();
    expect(runner.backToReview().phase).toBe('review');
    signer.error = null;
    expect((await runner.sign()).phase).toBe('done');
    expect(api.builds).toHaveLength(1);
  });

  it.each([
    ['TX_MISMATCH', 400, true],
    ['TX_ALREADY_SUBMITTED', 409, false],
    ['TX_BAD_SIGNATURE', 400, false],
    ['TX_EXPIRED', 400, true],
    ['TX_FAILED', 400, false],
  ] as const)('maps server code %s', async (code, status, retryable) => {
    const { api, runner } = setup();
    api.submitResult = new ApiError('server says no', status, code);
    await runner.prepare({ action: 'contribute', listingId: 'L1', amount: 20 });
    const end = await runner.sign();
    expect(end.error).toMatchObject({ code, retryable });
  });

  it('asks for a new build when the server no longer knows the one signed', async () => {
    const { api, runner } = setup();
    api.submitResult = new ApiError('No encontrado', 404, 'NOT_FOUND');
    await runner.prepare({ action: 'refund', listingId: 'L1' });
    expect((await runner.sign()).error).toMatchObject({ code: 'TX_EXPIRED', retryable: true });
  });

  it('tells an unreachable API from a Stellar RPC failure', async () => {
    const { api, runner } = setup();
    api.buildResult = new ApiError('offline', 0, 'NETWORK');
    expect((await runner.prepare({ action: 'usdc_trustline' })).error?.code).toBe('API_DOWN');
    api.buildResult = new ApiError('rpc', 502, 'UPSTREAM_FAILED');
    expect((await runner.prepare({ action: 'usdc_trustline' })).error?.code).toBe('RPC_DOWN');
  });

  it('runs the custodial fallback through the same states', async () => {
    const { runner, seen } = setup();
    const end = await runner.runCustodial('refund', async () => ({ hash: 'z', explorer: 'ez' }));
    expect(end).toMatchObject({ phase: 'done', custodial: true, outcome: { hash: 'z', status: 'SUCCESS' } });
    expect(seen).toEqual(['submitting', 'done']);
    const failed = await runner.runCustodial('refund', async () => {
      throw new ApiError('HostError: Error(Contract, #7)', 400, 'BAD_REQUEST');
    });
    expect(failed.error).toMatchObject({
      code: 'UNKNOWN',
      message: '',
      detail: 'HostError: Error(Contract, #7)',
    });
  });

  it('keeps contract traps behind the technical detail', () => {
    expect(classifyTxError(new Error('simulation failed: HostError …'))).toMatchObject({
      message: '',
      code: 'UNKNOWN',
    });
    expect(classifyTxError(new Error('Saldo insuficiente'))).toMatchObject({ message: 'Saldo insuficiente' });
  });

  it('tells a missing server setup apart from a network outage', () => {
    expect(classifyTxError(new ApiError('No hay pool de USDC de demo', 503, 'NOT_CONFIGURED'))).toMatchObject(
      {
        code: 'NOT_CONFIGURED',
        retryable: false,
      },
    );
  });
});

describe('review and labels', () => {
  it('shows amounts with the asset decimals and code, never a hard-coded currency', () => {
    expect(fromBaseUnits('200000000', 7)).toBe(20);
    expect(reviewArgs(build())).toEqual([
      { name: 'buyer', value: 'GADCU…ME4OD' },
      { name: 'payment_amount', value: '20,00 USDC' },
    ]);
    expect(assetAmount(15.5, 'XLM')).toBe('15,50 XLM');
    expect(feeXlm('123456')).toBe('0,0123456 XLM');
  });

  it('tells the wallet state before signing', () => {
    const d = {
      installed: true,
      allowed: true,
      address: ME,
      network: 'TESTNET',
      networkPassphrase: PASS,
      networkOk: true,
    };
    expect(walletState(null)).toBe('checking');
    expect(walletState({ ...d, installed: false })).toBe('missing');
    expect(
      walletState({
        ...d,
        networkOk: false,
        networkPassphrase: 'Public Global Stellar Network ; September 2015',
      }),
    ).toBe('wrongNetwork');
    expect(walletState({ ...d, allowed: false, address: null })).toBe('locked');
    expect(walletState(d, OTHER)).toBe('mismatch');
    expect(walletState(d, ME)).toBe('ready');
  });
});

describe('tender read from the contract', () => {
  const chain: ChainTender = {
    contractId: TENDER,
    explorer: `https://stellar.expert/explorer/testnet/contract/${TENDER}`,
    readAt: '2026-10-30T12:00:00Z',
    reads: [
      'get_state',
      'get_total_raised',
      'get_price_per_unit',
      'get_payment_token',
      'get_caps',
      'get_deadline',
    ],
    state: { code: 0, name: 'Open' },
    totalRaised: 200,
    pricePerUnit: 10,
    softCap: 100,
    hardCap: 1000,
    deadline: '2026-11-10T00:00:00Z',
    paymentToken: USDC,
    fiduciary: OTHER,
    proceedsWithdrawn: false,
    legalInfo: null,
    holder: { address: ME, rwaBalance: 20, paymentBalance: 80 },
  };

  it('maps every figure from the contract read', () => {
    expect(tenderView(chain)).toMatchObject({
      status: 'LISTED',
      raised: 200,
      price: 10,
      softCap: 100,
      hardCap: 1000,
      code: 'USDC',
      deadlineMs: Date.parse('2026-11-10T00:00:00Z'),
      holder: { rwa: 20, payment: 80 },
    });
    // Tenders deployed before get_caps / get_deadline: no invented caps.
    expect(tenderView({ ...chain, softCap: null, hardCap: null, deadline: null })).toMatchObject({
      softCap: null,
      hardCap: null,
      deadlineMs: null,
    });
    expect(statusFromChain('Failed')).toBe('CLOSED_FAILED');
    expect(statusFromChain('Terminated')).toBe('CLOSED_SUCCESS');
  });

  it('accepts only what the contract accepts: whole units, within the cap and the balance', () => {
    const rules = { price: 10, min: 20, capacity: 800, balance: 80 };
    expect(checkContribution(0, rules)).toEqual({ ok: false, error: 'empty' });
    expect(checkContribution(10, rules)).toEqual({ ok: false, error: 'belowMin' });
    expect(checkContribution(25, rules)).toEqual({ ok: false, error: 'notMultiple' });
    expect(checkContribution(90, rules)).toEqual({ ok: false, error: 'aboveBalance' });
    expect(checkContribution(900, { ...rules, balance: null })).toEqual({
      ok: false,
      error: 'aboveCapacity',
    });
    expect(checkContribution(20, rules)).toEqual({ ok: true });
    expect(checkContribution(20, { ...rules, capacity: null })).toEqual({ ok: true });
    expect(unitsFor(20, 10)).toBe(2);
    expect(unitsFor(0.3, 0.1)).toBe(3);
  });
});
