import crypto from 'crypto';
import {
  Address,
  FeeBumpTransaction,
  Keypair,
  Transaction,
  TransactionBuilder,
  scValToNative,
  type xdr,
} from '@stellar/stellar-sdk';
import type {
  ChainAsset,
  TxAction,
  TxBuildRequest,
  TxBuildResult,
  TxStatusResult,
  TxSubmitResult,
} from '@fractachain/shared';
import type { Account } from '../../domain/account/Account';
import type { Listing } from '../../domain/listing/Listing';
import { isStellarPublicKey } from '../../domain/stellar/StellarAddress';
import type { Explorer } from '../../infrastructure/stellar/Explorer';
import type { SubmittedTx, TokenInfo } from '../../infrastructure/stellar/SorobanGateway';
import { WALLET_SIGN_TIMEOUT } from '../../infrastructure/stellar/SorobanGateway';
import type { IClock } from '../../shared/clock';
import { AppError, DomainError, NotFoundError, UpstreamError } from '../../shared/errors';
import type { ILogger } from '../../shared/logger';
import type { TxBuildRecord, TxBuildStore } from './TxBuildStore';

/** Argument names of the tender functions an investor signs (for display and audit). */
const ARG_NAMES: Record<string, string[]> = {
  contribute: ['buyer', 'payment_amount'],
  refund: ['contributor'],
  finalize: [],
};

/** What the tx module needs from the offering flows (prepare + bookkeeping). */
export interface TxOfferingPort {
  prepareContribute(
    listingId: string,
    accountId: string,
    amount: number,
    timeoutInSeconds?: number,
  ): Promise<{ xdr: string }>;
  prepareRefund(listingId: string, accountId: string, timeoutInSeconds?: number): Promise<{ xdr: string }>;
  prepareFinalize(listingId: string, accountId: string, timeoutInSeconds?: number): Promise<{ xdr: string }>;
  /** Relays + books from on-chain before/after reads (and auto-finalize). */
  submitContribute(listingId: string, accountId: string, signedXdr: string): Promise<unknown>;
  submitRefund(listingId: string, accountId: string, signedXdr: string): Promise<unknown>;
  recordFinalize(listingId: string, hash: string): Promise<unknown>;
}

export interface TxChainPort {
  submitSignedDetailed(tx: Transaction): Promise<SubmittedTx>;
  transactionStatus(hash: string): Promise<SubmittedTx>;
}

export interface TxDeps {
  accounts: { require(id: string): Account };
  listings: { require(id: string): Listing };
  offerings: TxOfferingPort;
  /** Payment token of a tender (identity + decimals read from the token contract). */
  paymentAsset(listing: Listing): Promise<TokenInfo>;
  usdc: {
    trustlineXdr(wallet: string): Promise<string>;
    asset(): { getCode(): string; getIssuer(): string | undefined };
    sac(): string | null;
  };
  chain: TxChainPort;
  explorer: Explorer;
  builds: TxBuildStore;
  clock: IClock;
  /** Network name and passphrase the server signs/validates for (runtime settings). */
  network(): { name: string; passphrase: string };
  logger: ILogger;
}

const txError = (message: string, status: number, code: ConstructorParameters<typeof AppError>[2]) =>
  new AppError(message, status, code);

/**
 * Non-custodial transactions (Instaward 1, Deliverable 2).
 *
 * `build` prepares the exact transaction the investor's wallet must sign —
 * simulated, with footprint, resources and fee — sourced by the investor's own
 * G… address, so their signature is what satisfies `require_auth`. `submit`
 * relays it only if it is byte-for-byte what was built (same hash: contract,
 * function, arguments, fee, sequence, time bounds), carries a valid signature
 * of that wallet for this network, and was never relayed before. Builds are
 * single-use and expire with the transaction's time bounds.
 */
export class TxService {
  constructor(private readonly deps: TxDeps) {}

  async build(caller: Account, request: TxBuildRequest): Promise<TxBuildResult> {
    const account = this.deps.accounts.require(caller.id);
    const wallet = TxService.selfCustodyWallet(account);
    const { passphrase, name } = this.deps.network();

    let xdrB64: string;
    let listing: Listing | undefined;
    let asset: ChainAsset | undefined;
    switch (request.action) {
      case 'contribute':
        listing = this.deps.listings.require(request.listingId);
        ({ xdr: xdrB64 } = await this.deps.offerings.prepareContribute(
          listing.id,
          account.id,
          request.amount,
          WALLET_SIGN_TIMEOUT,
        ));
        asset = this.toChainAsset(await this.deps.paymentAsset(listing));
        break;
      case 'refund':
        listing = this.deps.listings.require(request.listingId);
        ({ xdr: xdrB64 } = await this.deps.offerings.prepareRefund(
          listing.id,
          account.id,
          WALLET_SIGN_TIMEOUT,
        ));
        asset = this.toChainAsset(await this.deps.paymentAsset(listing));
        break;
      case 'finalize':
        listing = this.deps.listings.require(request.listingId);
        ({ xdr: xdrB64 } = await this.deps.offerings.prepareFinalize(
          listing.id,
          account.id,
          WALLET_SIGN_TIMEOUT,
        ));
        asset = this.toChainAsset(await this.deps.paymentAsset(listing));
        break;
      case 'usdc_trustline': {
        xdrB64 = await this.deps.usdc.trustlineXdr(wallet);
        const usdc = this.deps.usdc.asset();
        const sac = this.deps.usdc.sac();
        if (sac) {
          asset = this.toChainAsset({
            contractId: sac,
            code: usdc.getCode(),
            issuer: usdc.getIssuer() ?? null,
            decimals: 7,
          });
        }
        break;
      }
    }

    const tx = TxService.parse(xdrB64, passphrase);
    if (tx.source !== wallet) throw new DomainError('La transacción armada no sale de tu wallet');
    const call = TxService.invocation(tx);
    const maxTime = Number(tx.timeBounds?.maxTime ?? 0);
    const expiresAt = new Date(
      maxTime > 0 ? maxTime * 1000 : this.deps.clock.now() + WALLET_SIGN_TIMEOUT * 1000,
    );
    const record: TxBuildRecord = {
      id: `txb_${crypto.randomBytes(12).toString('hex')}`,
      accountId: account.id,
      wallet,
      action: request.action,
      listingId: listing?.id,
      contractId: call?.contractId,
      function: call?.fn,
      hash: Buffer.from(tx.hash()).toString('hex'),
      createdAt: this.deps.clock.isoNow(),
      expiresAt: expiresAt.toISOString(),
    };
    this.deps.builds.insert(record);
    return {
      buildId: record.id,
      xdr: tx.toXDR(),
      action: request.action,
      network: name,
      networkPassphrase: passphrase,
      source: wallet,
      contractId: call?.contractId,
      function: call?.fn,
      args: call?.args,
      asset,
      fee: tx.fee,
      expiresAt: record.expiresAt,
    };
  }

  async submit(caller: Account, buildId: string, signedXdr: string): Promise<TxSubmitResult> {
    const record = this.deps.builds.find(buildId);
    if (!record || record.accountId !== caller.id)
      throw new NotFoundError('No encontramos esa transacción armada');
    if (record.consumedAt) {
      throw txError('Esa transacción ya se envió a la red', 409, 'TX_ALREADY_SUBMITTED');
    }
    if (this.deps.clock.now() > Date.parse(record.expiresAt)) {
      throw txError('La transacción venció antes de firmarse: armala de nuevo', 410, 'TX_EXPIRED');
    }

    const { passphrase } = this.deps.network();
    let tx: Transaction;
    try {
      tx = TxService.parse(signedXdr, passphrase);
    } catch {
      throw txError('El XDR firmado no es una transacción válida', 422, 'TX_MISMATCH');
    }
    if (Buffer.from(tx.hash()).toString('hex') !== record.hash) {
      throw txError('La transacción firmada no es la que armó el servidor', 422, 'TX_MISMATCH');
    }
    if (!TxService.signedBy(tx, record.wallet)) {
      throw txError(
        'La firma no corresponde a tu wallet en esta red. Revisá que Freighter esté en Testnet y con la cuenta correcta.',
        422,
        'TX_BAD_SIGNATURE',
      );
    }
    if (this.deps.builds.wasSubmitted(record.hash)) {
      throw txError('Esa transacción ya se envió a la red', 409, 'TX_ALREADY_SUBMITTED');
    }
    // Consumed before relaying: a concurrent or replayed submit can't relay it twice.
    record.consumedAt = this.deps.clock.isoNow();
    this.deps.builds.update(record);

    let listing: unknown;
    try {
      listing = await this.relay(record, tx, signedXdr);
    } catch (err) {
      if (
        err instanceof UpstreamError &&
        (err.details as { hash?: string } | undefined)?.hash === record.hash
      ) {
        record.status = 'PENDING';
        this.deps.builds.update(record);
        return this.result(record, 'PENDING');
      }
      if (err instanceof AppError && err.code === 'TX_FAILED') {
        record.status = 'FAILED';
        this.deps.builds.update(record);
      }
      throw err;
    }
    const settled = await this.deps.chain.transactionStatus(record.hash).catch(() => null);
    record.status = 'SUCCESS';
    record.ledger = settled?.ledger;
    this.deps.builds.update(record);
    return { ...this.result(record, 'SUCCESS'), ...(listing ? { listing } : {}) };
  }

  async status(hash: string): Promise<TxStatusResult> {
    const got = await this.deps.chain.transactionStatus(hash);
    return {
      hash,
      status: got.status,
      ...(got.ledger ? { ledger: got.ledger } : {}),
      explorer: this.deps.explorer.tx(hash) ?? '',
    };
  }

  /** Sends the validated transaction and does the action's bookkeeping. */
  private async relay(record: TxBuildRecord, tx: Transaction, signedXdr: string): Promise<unknown> {
    const { listingId } = record;
    switch (record.action) {
      case 'contribute':
        return this.deps.offerings.submitContribute(listingId!, record.accountId, signedXdr);
      case 'refund':
        return this.deps.offerings.submitRefund(listingId!, record.accountId, signedXdr);
      case 'finalize': {
        const sent = await this.deps.chain.submitSignedDetailed(tx);
        if (sent.status !== 'SUCCESS') {
          throw new UpstreamError('La transacción sigue pendiente en la red', { hash: sent.hash });
        }
        return this.deps.offerings.recordFinalize(listingId!, sent.hash);
      }
      case 'usdc_trustline': {
        const sent = await this.deps.chain.submitSignedDetailed(tx);
        if (sent.status !== 'SUCCESS') {
          throw new UpstreamError('La transacción sigue pendiente en la red', { hash: sent.hash });
        }
        return undefined;
      }
    }
  }

  private result(record: TxBuildRecord, status: TxSubmitResult['status']): TxSubmitResult {
    return {
      hash: record.hash,
      status,
      ...(record.ledger ? { ledger: record.ledger } : {}),
      explorer: this.deps.explorer.tx(record.hash) ?? '',
      action: record.action as TxAction,
    };
  }

  private toChainAsset(info: TokenInfo): ChainAsset {
    return {
      code: info.code,
      issuer: info.issuer,
      contractId: info.contractId,
      decimals: info.decimals,
      explorer: this.deps.explorer.contract(info.contractId) ?? '',
    };
  }

  private static selfCustodyWallet(account: Account): string {
    if (account.custodyMode === 'CUSTODIAL') {
      throw new DomainError(
        'Tu cuenta es custodial: el servidor firma por vos. Firmar con Freighter requiere una wallet propia.',
      );
    }
    if (account.custodyMode !== 'SELF' || !isStellarPublicKey(account.publicKey)) {
      throw new DomainError('Conectá tu wallet (Freighter) antes de firmar transacciones');
    }
    return account.publicKey;
  }

  private static parse(envelope: string, passphrase: string): Transaction {
    const tx = TransactionBuilder.fromXDR(envelope, passphrase);
    if (tx instanceof FeeBumpTransaction || !(tx instanceof Transaction)) throw new Error('fee bump');
    return tx;
  }

  /** A valid ed25519 signature of `publicKey` over this network's transaction hash. */
  static signedBy(tx: Transaction, publicKey: string): boolean {
    const kp = Keypair.fromPublicKey(publicKey);
    const hash = tx.hash();
    return tx.signatures.some((sig) => {
      try {
        return kp.verify(hash, sig.signature);
      } catch {
        return false;
      }
    });
  }

  /** Contract, function and decoded arguments of a single Soroban invocation (undefined for classic txs). */
  static invocation(
    tx: Transaction,
  ): { contractId: string; fn: string; args: { name: string; value: string }[] } | undefined {
    if (tx.operations.length !== 1 || tx.operations[0].type !== 'invokeHostFunction') return undefined;
    const fn = (tx.operations[0] as unknown as { func: xdr.HostFunction }).func;
    if (fn.type !== 'hostFunctionTypeInvokeContract') return undefined;
    const call = fn.invokeContract;
    const contractId = Address.fromScAddress(call.contractAddress).toString();
    const name = call.functionName.toString();
    const names = ARG_NAMES[name] ?? [];
    const args = call.args.map((arg, i) => {
      let value: string;
      try {
        const native = scValToNative(arg);
        value = typeof native === 'bigint' ? native.toString() : String(native);
      } catch {
        value = '?';
      }
      return { name: names[i] ?? `arg${i}`, value };
    });
    return { contractId, fn: name, args };
  }
}
