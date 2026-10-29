import { createHash } from 'crypto';
import type { Keypair } from '@stellar/stellar-sdk';
import {
  canFinalizeFromSnapshot,
  expectedCloseStatus,
  licitacionStateName,
  listingDeadlineMs,
  parseLicitacionState,
} from '../../domain/licitacion/LicitacionState';
import type { LicitacionReads, LicitacionSnapshot } from '../../domain/licitacion/LicitacionSnapshot';
import { paymentUnit, type Listing } from '../../domain/listing/Listing';
import { fromStroops, toStroops } from '../../domain/stellar/Amounts';
import { isContractId, isStellarPublicKey, normalizeAddress } from '../../domain/stellar/StellarAddress';
import { DomainError, NotConfiguredError, errorMessage } from '../../shared/errors';
import type { ILogger } from '../../shared/logger';
import type { HorizonAccounts } from './HorizonAccounts';
import type { PlatformKeyring } from './PlatformKeyring';
import { SignedTransactionPolicy } from './SignedTransactionPolicy';
import type { AnyClient, SorobanGateway } from './SorobanGateway';
import type { DeploymentRegistryLike } from './types';
import type { UsdcFaucet } from './UsdcFaucet';

const ARGENTINA = 32;
const INVESTOR_NATIONAL = 0;
const YEAR_SECS = 365 * 24 * 3600;

export interface ContributionReceipt {
  hash: string;
  /** Total raised by the contract after this contribution. */
  raised: number;
  /** RWA units the investor holds in the contract after this contribution. */
  tokens: number;
  /** Payment actually transferred by this transaction, read back from the chain. */
  amount: number;
  licitacion: string;
}

/**
 * Adapter for the `fractachain-licitacion` Soroban contract (one instance per
 * offering): deploy + initialize, KYC whitelisting, contributions, finalize,
 * refunds and proceeds withdrawal.
 *
 * It never looks up platform accounts: callers pass the investor's keypair
 * (custodial) or wallet address (self-custody).
 */
export class LicitacionContract {
  constructor(
    private readonly soroban: SorobanGateway,
    private readonly keyring: PlatformKeyring,
    private readonly deployments: DeploymentRegistryLike,
    private readonly accounts: HorizonAccounts,
    private readonly usdc: UsdcFaucet,
    private readonly logger: ILogger,
  ) {}

  isLive(listing: Listing): boolean {
    return isContractId(listing.licitacionContract);
  }

  private contractId(listing: Listing): string {
    if (!this.isLive(listing)) throw new DomainError('Esta licitación no tiene un contrato Soroban real');
    return listing.licitacionContract;
  }

  private async adminClient(listing: Listing): Promise<{ client: AnyClient; admin: Keypair }> {
    const admin = await this.keyring.licitacionAdmin();
    return { client: await this.soroban.client(this.contractId(listing), admin), admin };
  }

  /** Pre-flight balance check: errors name the missing asset and where to get it. */
  async assertBuyerFunds(wallet: string, listing: Listing, amount: number): Promise<void> {
    if (paymentUnit(listing) === 'USDC') {
      const usdc = await this.usdc.balance(wallet);
      if (usdc < amount) {
        throw new DomainError(
          `La wallet tiene ${usdc.toFixed(2)} USDC y el aporte es ${amount} USDC. ` +
            'Fondeá USDC de testnet desde tu página de Wallet (botón "Fondear USDC").',
        );
      }
      const xlm = await this.accounts.nativeXlm(wallet);
      if (xlm < 1.5) {
        throw new DomainError(
          `Te falta XLM para la reserva/fee de la transacción (tenés ${xlm.toFixed(2)}). Friendbot fondea XLM automáticamente.`,
        );
      }
      return;
    }
    const xlm = await this.accounts.nativeXlm(wallet);
    if (xlm < amount + 2) {
      throw new DomainError(
        `La wallet tiene ${xlm.toFixed(2)} XLM y el aporte es ${amount}. Friendbot o recargá XLM de testnet.`,
      );
    }
  }

  async isInvestorVerified(listing: Listing, investor: string): Promise<boolean> {
    const client = await this.soroban.client(this.contractId(listing));
    return Boolean(await this.soroban.read<boolean>(client, 'is_verified', { investor }));
  }

  /** Admin-only `verify_investor`: the contract rejects contributions from unknown wallets. */
  async verifyInvestor(listing: Listing, investor: string): Promise<string | null> {
    if (!this.isLive(listing) || !investor) return null;
    if (await this.isInvestorVerified(listing, investor)) return null;
    const { client, admin } = await this.adminClient(listing);
    const { hash } = await this.soroban.invoke(client, 'verify_investor', {
      admin: admin.publicKey(),
      investor,
      country_code: ARGENTINA,
      investor_type: INVESTOR_NATIONAL,
      expiry: BigInt(Math.floor(Date.now() / 1000) + YEAR_SECS),
    });
    return hash;
  }

  canDeploy(): boolean {
    const d = this.deployments.load();
    return Boolean(d?.licitacionWasmHash || isContractId(d?.licitacion));
  }

  /**
   * Deploys and initializes a fresh instance for this offering. Each offering
   * needs its own: `Fiduciary`, caps and price freeze after the first
   * contribution, so a shared instance made later offerings inherit the first
   * one's payout wallet.
   */
  async deployForListing(
    listing: Listing,
    deadlineMs: number,
    fiduciarySecret?: string,
  ): Promise<{
    contractId: string;
    hash: string | null;
    factoryProductId: number | null;
    fiduciaryUsdcReady: boolean | null;
  }> {
    const d = listing.dossier;
    const fiduciary = normalizeAddress(d.proceedsWallet);
    if (!isStellarPublicKey(fiduciary)) {
      throw new DomainError('Configurá la wallet de cobro de la empresa antes de abrir la licitación');
    }
    const deployment = this.deployments.load();
    const wasmHash =
      deployment?.licitacionWasmHash ||
      (isContractId(deployment?.licitacion) ? await this.soroban.wasmHashOf(deployment!.licitacion!) : '');
    if (!wasmHash) throw new NotConfiguredError('deployments/testnet.json no tiene el WASM de la licitación');

    const isXlm = d.paymentKind === 'XLM';
    const paymentToken = isXlm ? this.soroban.xlmSac() : deployment?.usdcSac;
    if (!isContractId(paymentToken))
      throw new NotConfiguredError('Falta usdcSac en deployments/testnet.json');

    const admin = await this.keyring.licitacionAdmin();
    const deployed = await this.soroban.deployFromWasmHash(wasmHash, admin);
    const client = await this.soroban.client(deployed.contractId, admin);
    const price = toStroops(d.pricePerShareUsdc);
    const { hash } = await this.soroban.invoke(client, 'initialize', {
      admin: admin.publicKey(),
      fiduciary,
      payment_token: paymentToken,
      soft_cap: toStroops(d.offeringSoftCapUsdc),
      hard_cap: toStroops(d.offeringHardCapUsdc),
      deadline: BigInt(Math.floor(deadlineMs / 1000)),
      price_per_unit: price,
      legal_info: {
        fideicomiso_hash: createHash('sha256')
          .update(`${listing.id}:${d.estatutoHash || ''}`)
          .digest(),
        cnv_record_id: d.cnvRecordId || '',
        legal_terms_uri: d.legalTermsUri || '',
      },
    });

    // SC-06: initialize is a separate tx from the deploy — verify nobody beat us to it.
    const storedAdmin = await this.soroban.readOptional<string>(client, 'get_admin');
    if (storedAdmin !== undefined && String(storedAdmin) !== admin.publicKey()) {
      throw new DomainError(
        'La licitación quedó inicializada con otro admin (posible front-running): descartada',
      );
    }

    let factoryProductId: number | null = null;
    if (this.keyring.hasDeployer()) {
      try {
        const factory = await this.soroban.client(this.soroban.factoryId(), admin);
        const { result } = await this.soroban.invoke(factory, 'register_product', {
          admin: admin.publicKey(),
          kind: 0,
          contract_address: deployed.contractId,
          payment_kind: isXlm ? 0 : 1,
          price_per_unit: price,
          name: `${d.tokenTicker} · ${d.legalName}`,
        });
        factoryProductId = Number(result);
      } catch (err) {
        this.logger.warn('factory.register_product omitido', { err: errorMessage(err) });
      }
    }

    // USDC payouts land on a classic trustline: without one, finalize() fails
    // at payout. Demo treasuries are opened here; a real company opens its own
    // and the flag tells the admin it is still pending.
    let fiduciaryUsdcReady: boolean | null = null;
    if (!isXlm) {
      try {
        fiduciaryUsdcReady = await this.usdc.ensureFiduciaryTrustline(fiduciary, fiduciarySecret);
        if (!fiduciaryUsdcReady)
          this.logger.warn('la wallet fiduciaria aún no tiene trustline USDC', { fiduciary });
      } catch (err) {
        this.logger.warn('trustline USDC de la fiduciaria falló', { err: errorMessage(err) });
        fiduciaryUsdcReady = false;
      }
    }
    return {
      contractId: deployed.contractId,
      hash: hash || deployed.hash,
      factoryProductId,
      fiduciaryUsdcReady,
    };
  }

  /**
   * Points the contract's `Fiduciary` at the dossier wallet. Only allowed while
   * nothing has been raised — the only window where moving it is fair.
   */
  async syncFiduciary(listing: Listing): Promise<{ hash: string | null; fiduciary: string } | null> {
    if (!this.isLive(listing)) return null;
    const wallet = normalizeAddress(listing.dossier.proceedsWallet);
    if (!isStellarPublicKey(wallet)) return null;
    const { client, admin } = await this.adminClient(listing);
    const [current, raised] = await Promise.all([
      this.soroban.read<string>(client, 'get_fiduciary').catch(() => null),
      this.soroban.read<bigint>(client, 'get_total_raised').catch(() => 0n),
    ]);
    if (current && String(current) === wallet) return { hash: null, fiduciary: wallet };
    if (fromStroops(raised) > 0) {
      throw new DomainError(
        `La licitación ya recibió aportes: el contrato paga a ${current} y no se puede repuntar a ${wallet}`,
      );
    }
    const { hash } = await this.soroban.invoke(client, 'set_fiduciary', {
      admin: admin.publicKey(),
      fiduciary: wallet,
    });
    return { hash, fiduciary: wallet };
  }

  /** Custodial contribution: the platform signs with the investor's custodial key. */
  async contribute(listing: Listing, buyer: Keypair, amount: number): Promise<ContributionReceipt> {
    await this.assertBuyerFunds(buyer.publicKey(), listing, amount);
    await this.verifyInvestor(listing, buyer.publicKey());
    const client = await this.soroban.client(this.contractId(listing), buyer);
    const { hash } = await this.soroban.invoke(client, 'contribute', {
      buyer: buyer.publicKey(),
      payment_amount: toStroops(amount),
    });
    if (!hash) throw new DomainError('El aporte se envió pero no volvió hash de transacción');
    const [raised, rwa] = await Promise.all([
      this.soroban.read<bigint>(client, 'get_total_raised'),
      this.soroban.read<bigint>(client, 'get_rwa_balance', { user: buyer.publicKey() }),
    ]);
    return {
      hash,
      raised: fromStroops(raised),
      tokens: Number(rwa),
      amount,
      licitacion: listing.licitacionContract,
    };
  }

  /** Self-custody: simulated `contribute` for Freighter to sign (after the admin whitelists the wallet). */
  async prepareContributeXdr(
    listing: Listing,
    wallet: string,
    amount: number,
  ): Promise<{ xdr: string; publicKey: string; verifyHash: string | null }> {
    await this.assertBuyerFunds(wallet, listing, amount);
    const verifyHash = await this.verifyInvestor(listing, wallet);
    const xdr = await this.soroban.unsignedInvocationXdr(this.contractId(listing), wallet, 'contribute', {
      buyer: wallet,
      payment_amount: toStroops(amount),
    });
    return { xdr, publicKey: wallet, verifyHash };
  }

  /**
   * Relays the signed contribution after checking it is exactly
   * `contribute(wallet, …)` on this offering, then derives the amount from
   * the contract's own ledger (RWA units before/after × price) — the request
   * body is never trusted for what was paid.
   */
  async submitContribute(listing: Listing, wallet: string, signedXdr: string): Promise<ContributionReceipt> {
    const contractId = this.contractId(listing);
    const tx = this.soroban.parseTransaction(signedXdr);
    SignedTransactionPolicy.assertSourcedBy(tx, wallet);
    SignedTransactionPolicy.assertContractInvocation(tx, contractId, 'contribute', wallet);
    const client = await this.soroban.client(contractId);
    const [before, price] = await Promise.all([
      this.soroban.read<bigint>(client, 'get_rwa_balance', { user: wallet }).catch(() => 0n),
      this.soroban.read<bigint>(client, 'get_price_per_unit'),
    ]);
    const hash = await this.soroban.submitSigned(tx);
    const [raised, after] = await Promise.all([
      this.soroban.read<bigint>(client, 'get_total_raised'),
      this.soroban.read<bigint>(client, 'get_rwa_balance', { user: wallet }),
    ]);
    const units = BigInt(after) - BigInt(before);
    return {
      hash,
      raised: fromStroops(raised),
      tokens: Number(after),
      amount: units > 0n ? fromStroops(units * BigInt(price)) : 0,
      licitacion: listing.licitacionContract,
    };
  }

  async prepareRefundXdr(listing: Listing, wallet: string): Promise<{ xdr: string; publicKey: string }> {
    const xdr = await this.soroban.unsignedInvocationXdr(this.contractId(listing), wallet, 'refund', {
      contributor: wallet,
    });
    return { xdr, publicKey: wallet };
  }

  async submitRefund(
    listing: Listing,
    wallet: string,
    signedXdr: string,
  ): Promise<{ hash: string; refunded: number; rwa: number }> {
    const contractId = this.contractId(listing);
    const tx = this.soroban.parseTransaction(signedXdr);
    SignedTransactionPolicy.assertSourcedBy(tx, wallet);
    SignedTransactionPolicy.assertContractInvocation(tx, contractId, 'refund', wallet);
    const client = await this.soroban.client(contractId);
    const [before, price] = await Promise.all([
      this.soroban.read<bigint>(client, 'get_rwa_balance', { user: wallet }).catch(() => 0n),
      this.soroban.read<bigint>(client, 'get_price_per_unit').catch(() => 0n),
    ]);
    const hash = await this.soroban.submitSigned(tx);
    const after = await this.soroban
      .read<bigint>(client, 'get_rwa_balance', { user: wallet })
      .catch(() => 0n);
    const units = Number(before);
    return {
      hash,
      refunded: price && units > 0 ? fromStroops(BigInt(units) * BigInt(price)) : 0,
      rwa: Number(after),
    };
  }

  /** Custodial refund, signed with the investor's custodial key. */
  async refund(
    listing: Listing,
    contributor: Keypair,
  ): Promise<{ hash: string | null; refunded: number; rwa: number }> {
    const client = await this.soroban.client(this.contractId(listing), contributor);
    const [before, price] = await Promise.all([
      this.soroban.read<bigint>(client, 'get_rwa_balance', { user: contributor.publicKey() }).catch(() => 0n),
      this.soroban.read<bigint>(client, 'get_price_per_unit').catch(() => 0n),
    ]);
    const { hash } = await this.soroban.invoke(client, 'refund', { contributor: contributor.publicKey() });
    const after = await this.soroban
      .read<bigint>(client, 'get_rwa_balance', { user: contributor.publicKey() })
      .catch(() => 0n);
    const units = Number(before);
    return {
      hash,
      refunded: price && units > 0 ? fromStroops(BigInt(units) * BigInt(price)) : 0,
      rwa: Number(after),
    };
  }

  async finalize(listing: Listing): Promise<{
    hash: string | null;
    state: number;
    raised: number;
    proceedsWithdrawn: boolean;
    fiduciary: string | null;
  }> {
    const { client } = await this.adminClient(listing);
    const { hash } = await this.soroban.invoke(client, 'finalize');
    const snap = await this.read(listing);
    return {
      hash,
      state: snap.state,
      raised: snap.raised,
      proceedsWithdrawn: snap.proceedsWithdrawn,
      fiduciary: snap.fiduciary,
    };
  }

  async withdrawProceeds(listing: Listing): Promise<{ hash: string | null; amount: number }> {
    const { client, admin } = await this.adminClient(listing);
    const { hash, result } = await this.soroban.invoke(client, 'withdraw_proceeds', {
      admin: admin.publicKey(),
    });
    const amount =
      typeof result === 'bigint' || typeof result === 'number' || typeof result === 'string'
        ? fromStroops(result)
        : 0;
    return { hash, amount };
  }

  async read(listing: Listing, investor?: string): Promise<LicitacionReads> {
    const client = await this.soroban.client(this.contractId(listing));
    const [stateRaw, raised, price, withdrawn, fiduciary] = await Promise.all([
      this.soroban.read<unknown>(client, 'get_state'),
      this.soroban.read<bigint>(client, 'get_total_raised'),
      this.soroban.read<bigint>(client, 'get_price_per_unit'),
      this.soroban.read<boolean>(client, 'proceeds_withdrawn').catch(() => false),
      this.soroban.read<string>(client, 'get_fiduciary').catch(() => null),
    ]);
    let investorRwa: number | null = null;
    if (investor) {
      try {
        investorRwa = Number(await this.soroban.read<bigint>(client, 'get_rwa_balance', { user: investor }));
      } catch {
        investorRwa = null;
      }
    }
    return {
      state: parseLicitacionState(stateRaw),
      raised: fromStroops(raised),
      price: fromStroops(price),
      proceedsWithdrawn: Boolean(withdrawn),
      fiduciary: fiduciary ? String(fiduciary) : null,
      investorRwa,
    };
  }

  /** Live view of the offering; falls back to the platform ledger when there is no contract or RPC fails. */
  async snapshot(listing: Listing, investor?: string): Promise<LicitacionSnapshot> {
    const deadlineMs = listingDeadlineMs({
      settleAt: listing.settleAt,
      listedAt: listing.listedAt,
      offeringDays: listing.dossier.offeringDays,
    });
    const offline = (finalizeReason: string, error?: string): LicitacionSnapshot => ({
      live: false,
      state: -1,
      stateName: 'Unknown',
      raised: listing.raisedUsdc,
      price: listing.dossier.pricePerShareUsdc,
      proceedsWithdrawn: Boolean(listing.proceedsPaidAt),
      fiduciary: listing.dossier.proceedsWallet || null,
      investorRwa: null,
      canFinalize: false,
      finalizeReason,
      deadline: deadlineMs ? new Date(deadlineMs).toISOString() : null,
      ...(error ? { error } : {}),
    });
    if (!this.isLive(listing)) return offline(listing.status === 'LISTED' ? 'waiting' : 'already_closed');
    try {
      const reads = await this.read(listing, investor);
      const gate = canFinalizeFromSnapshot({
        state: reads.state,
        raised: reads.raised,
        hardCap: listing.dossier.offeringHardCapUsdc,
        deadlineMs,
      });
      const snapshot: LicitacionSnapshot = {
        live: true,
        state: reads.state,
        stateName: licitacionStateName(reads.state),
        raised: reads.raised,
        price: reads.price,
        proceedsWithdrawn: reads.proceedsWithdrawn,
        fiduciary: reads.fiduciary,
        investorRwa: reads.investorRwa,
        canFinalize: gate.canFinalize,
        finalizeReason: gate.reason,
        deadline: deadlineMs ? new Date(deadlineMs).toISOString() : null,
      };
      const wallet = normalizeAddress(listing.dossier.proceedsWallet);
      if (reads.fiduciary) {
        snapshot.fiduciaryXlm = await this.accounts.nativeXlm(reads.fiduciary);
        if (paymentUnit(listing) === 'USDC') {
          snapshot.fiduciaryUsdc = this.usdc.issuerPublicKey()
            ? await this.usdc.balance(reads.fiduciary)
            : null;
        }
      }
      snapshot.fiduciaryMismatch = Boolean(
        reads.fiduciary && isStellarPublicKey(wallet) && reads.fiduciary !== wallet,
      );
      return snapshot;
    } catch (err) {
      return offline('waiting', errorMessage(err));
    }
  }

  closeStatusFromChain(snapshot: LicitacionSnapshot, listing: Listing) {
    return expectedCloseStatus({
      state: snapshot.state,
      raised: snapshot.raised,
      softCap: listing.dossier.offeringSoftCapUsdc,
    });
  }
}
