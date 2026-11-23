import {
  Account as StellarAccount,
  Address,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  nativeToScVal,
  type Transaction,
} from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { TxBuildStore } from '../../src/application/tx/TxBuildStore';
import { TxService, type TxDeps } from '../../src/application/tx/TxService';
import { DEFAULT_LEGAL_VERSION, type Account } from '../../src/domain/account/Account';
import type { Listing } from '../../src/domain/listing/Listing';
import { InMemoryDocumentStore } from '../../src/infrastructure/persistence/DocumentStore';
import { Explorer } from '../../src/infrastructure/stellar/Explorer';
import { TxFailedError, type SubmittedTx } from '../../src/infrastructure/stellar/SorobanGateway';
import { AppError, UpstreamError } from '../../src/shared/errors';
import { NullLogger } from '../../src/shared/logger';

const TENDER = 'CDHKGEJNNFYKXW4XOEDXXE5LOF5HCYVORR2JT7AOK2FAN5B6I65X7JLM';
const USDC_SAC = 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';
const investor = Keypair.random();
const stranger = Keypair.random();

function contributeXdr(wallet: string, amount: bigint, seq = '100'): string {
  return new TransactionBuilder(new StellarAccount(wallet, seq), {
    fee: '123456',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: TENDER,
        function: 'contribute',
        args: [Address.fromString(wallet).toScVal(), nativeToScVal(amount, { type: 'i128' })],
      }),
    )
    .setTimeout(300)
    .build()
    .toXDR();
}

function sign(envelope: string, kp: Keypair, passphrase: string = Networks.TESTNET): string {
  const tx = TransactionBuilder.fromXDR(envelope, passphrase) as Transaction;
  tx.sign(kp);
  return tx.toXDR();
}

function harness(opts: { custody?: 'SELF' | 'CUSTODIAL'; sameXdr?: boolean } = {}) {
  let now = Date.now();
  const clock = { now: () => now, isoNow: () => new Date(now).toISOString() };
  const account = {
    id: 'acc_investor',
    custodyMode: opts.custody ?? 'SELF',
    publicKey: investor.publicKey(),
    termsAcceptedAt: new Date().toISOString(),
    termsVersion: DEFAULT_LEGAL_VERSION,
  } as Account;
  const listing = { id: 'IPO-USDC', licitacionContract: TENDER } as Listing;
  const calls = {
    submitContribute: 0,
    recordFinalize: 0,
    sent: [] as string[],
    confirmed: [] as [string | undefined, string][],
  };
  let chainOutcome: 'SUCCESS' | 'FAILED' | 'PENDING' = 'SUCCESS';
  let seq = 100;
  const fixed = contributeXdr(investor.publicKey(), 200_000_000n);
  const deps: TxDeps = {
    accounts: { require: () => account },
    listings: { require: () => listing },
    offerings: {
      prepareContribute: async (_l, _a, amount) => ({
        xdr: opts.sameXdr ? fixed : contributeXdr(investor.publicKey(), BigInt(amount * 1e7), String(seq++)),
      }),
      prepareRefund: async () => ({ xdr: fixed }),
      prepareFinalize: async () => ({ xdr: fixed }),
      submitContribute: async (_l, _a, signed) => {
        calls.submitContribute += 1;
        const tx = TransactionBuilder.fromXDR(signed, Networks.TESTNET) as Transaction;
        const hash = Buffer.from(tx.hash()).toString('hex');
        if (chainOutcome === 'FAILED')
          throw new TxFailedError('El aporte supera el hard cap del contrato.', hash);
        if (chainOutcome === 'PENDING') throw new UpstreamError('pendiente', { hash });
        return { id: listing.id, raisedUsdc: 20 };
      },
      submitRefund: async () => ({}),
      recordFinalize: async () => {
        calls.recordFinalize += 1;
        return { id: listing.id };
      },
    },
    paymentAsset: async () => ({ contractId: USDC_SAC, code: 'USDC', issuer: 'GBBD…', decimals: 7 }),
    usdc: {
      trustlineXdr: async () => fixed,
      asset: () => ({
        getCode: () => 'USDC',
        getIssuer: () => 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
      }),
      sac: () => USDC_SAC,
    },
    chain: {
      submitSignedDetailed: async (tx): Promise<SubmittedTx> => {
        calls.sent.push(Buffer.from(tx.hash()).toString('hex'));
        return { hash: Buffer.from(tx.hash()).toString('hex'), status: 'SUCCESS', ledger: 99 };
      },
      transactionStatus: async (hash) => ({ hash, status: 'SUCCESS', ledger: 123 }),
    },
    explorer: new Explorer('https://stellar.expert/explorer/testnet'),
    builds: new TxBuildStore(new InMemoryDocumentStore(), clock.now),
    clock,
    network: () => ({ name: 'testnet', passphrase: Networks.TESTNET }),
    logger: new NullLogger(),
    onConfirmed: (contractId: string | undefined, source: string) =>
      calls.confirmed.push([contractId, source]),
  };
  return {
    service: new TxService(deps),
    account,
    calls,
    advance: (ms: number) => (now += ms),
    failNext: (o: 'FAILED' | 'PENDING') => (chainOutcome = o),
  };
}

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'OK';
  } catch (err) {
    return err instanceof AppError ? err.code : String(err);
  }
};

describe('TxService (non-custodial signing)', () => {
  it('builds the exact invocation the wallet signs and relays it once signed', async () => {
    const { service, account, calls } = harness();
    const built = await service.build(account, { action: 'contribute', listingId: 'IPO-USDC', amount: 20 });
    expect(built).toMatchObject({
      action: 'contribute',
      network: 'testnet',
      networkPassphrase: Networks.TESTNET,
      source: investor.publicKey(),
      contractId: TENDER,
      function: 'contribute',
      fee: '123456',
      asset: { code: 'USDC', contractId: USDC_SAC, decimals: 7 },
    });
    expect(built.args).toEqual([
      { name: 'buyer', value: investor.publicKey() },
      { name: 'payment_amount', value: '200000000' },
    ]);
    expect(built.buildId).toMatch(/^txb_[a-f0-9]{24}$/);
    expect(Date.parse(built.expiresAt)).toBeGreaterThan(Date.now() + 250_000);

    const result = await service.submit(account, built.buildId, sign(built.xdr, investor));
    expect(result).toMatchObject({ status: 'SUCCESS', ledger: 123, action: 'contribute' });
    expect(result.explorer).toBe(`https://stellar.expert/explorer/testnet/tx/${result.hash}`);
    expect(calls.submitContribute).toBe(1);
    // Cached chain reads of this tender and of the signer are dropped once confirmed.
    expect(calls.confirmed).toEqual([[TENDER, investor.publicKey()]]);
  });

  it('refuses expired, reused, tampered and badly signed submissions', async () => {
    const h = harness();
    const a = await h.service.build(h.account, { action: 'contribute', listingId: 'IPO-USDC', amount: 20 });
    const b = await h.service.build(h.account, { action: 'contribute', listingId: 'IPO-USDC', amount: 20 });

    // Another amount, signed by the investor: not what the server built.
    const tampered = sign(contributeXdr(investor.publicKey(), 999_000_000n, '100'), investor);
    expect(await code(h.service.submit(h.account, a.buildId, tampered))).toBe('TX_MISMATCH');
    expect(await code(h.service.submit(h.account, a.buildId, 'not-xdr'))).toBe('TX_MISMATCH');

    // Right transaction, wrong key — or right key on another network (Freighter on Mainnet).
    expect(await code(h.service.submit(h.account, a.buildId, sign(a.xdr, stranger)))).toBe(
      'TX_BAD_SIGNATURE',
    );
    expect(await code(h.service.submit(h.account, a.buildId, sign(a.xdr, investor, Networks.PUBLIC)))).toBe(
      'TX_BAD_SIGNATURE',
    );
    expect(await code(h.service.submit(h.account, a.buildId, a.xdr))).toBe('TX_BAD_SIGNATURE');

    // None of the refusals consumed the build: the genuine one still goes through, once.
    expect(await code(h.service.submit(h.account, a.buildId, sign(a.xdr, investor)))).toBe('OK');
    expect(await code(h.service.submit(h.account, a.buildId, sign(a.xdr, investor)))).toBe(
      'TX_ALREADY_SUBMITTED',
    );
    expect(h.calls.submitContribute).toBe(1);

    // Builds expire with the transaction's time bounds.
    h.advance(301_000);
    expect(await code(h.service.submit(h.account, b.buildId, sign(b.xdr, investor)))).toBe('TX_EXPIRED');
  });

  it('never relays the same transaction twice, even through another build', async () => {
    const h = harness({ sameXdr: true });
    const a = await h.service.build(h.account, { action: 'contribute', listingId: 'IPO-USDC', amount: 20 });
    const b = await h.service.build(h.account, { action: 'contribute', listingId: 'IPO-USDC', amount: 20 });
    expect(a.buildId).not.toBe(b.buildId);
    await h.service.submit(h.account, a.buildId, sign(a.xdr, investor));
    expect(await code(h.service.submit(h.account, b.buildId, sign(b.xdr, investor)))).toBe(
      'TX_ALREADY_SUBMITTED',
    );
    expect(h.calls.submitContribute).toBe(1);
  });

  it('keeps custodial accounts and other users out', async () => {
    const custodial = harness({ custody: 'CUSTODIAL' });
    await expect(
      custodial.service.build(custodial.account, { action: 'contribute', listingId: 'IPO-USDC', amount: 20 }),
    ).rejects.toThrow(/custodial/);

    const h = harness();
    const built = await h.service.build(h.account, {
      action: 'contribute',
      listingId: 'IPO-USDC',
      amount: 20,
    });
    const intruder = { ...h.account, id: 'acc_other' } as Account;
    expect(await code(h.service.submit(intruder, built.buildId, sign(built.xdr, investor)))).toBe(
      'NOT_FOUND',
    );
  });

  it('reports on-chain failures and pending transactions', async () => {
    const h = harness();
    const failing = await h.service.build(h.account, {
      action: 'contribute',
      listingId: 'IPO-USDC',
      amount: 20,
    });
    h.failNext('FAILED');
    expect(await code(h.service.submit(h.account, failing.buildId, sign(failing.xdr, investor)))).toBe(
      'TX_FAILED',
    );

    const pending = await h.service.build(h.account, {
      action: 'contribute',
      listingId: 'IPO-USDC',
      amount: 20,
    });
    h.failNext('PENDING');
    const result = await h.service.submit(h.account, pending.buildId, sign(pending.xdr, investor));
    expect(result.status).toBe('PENDING');
  });

  it('signs finalize and the USDC trustline with the investor wallet too', async () => {
    const h = harness();
    const fin = await h.service.build(h.account, { action: 'finalize', listingId: 'IPO-USDC' });
    await h.service.submit(h.account, fin.buildId, sign(fin.xdr, investor));
    expect(h.calls.recordFinalize).toBe(1);
    const trust = await h.service.build(h.account, { action: 'usdc_trustline' });
    expect(trust.asset).toMatchObject({ code: 'USDC', contractId: USDC_SAC });
  });
});
