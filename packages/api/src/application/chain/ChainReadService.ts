import type {
  ChainAsset,
  ChainForward,
  ChainMintProof,
  ChainNetwork,
  ChainPortfolio,
  ChainRef,
  ChainStockVault,
  ChainTender,
  ChainWarrant,
  TenderStateName,
} from '@fractachain/shared';
import type { TestnetDeployment } from '../../infrastructure/stellar/DeploymentRegistry';
import type { IAccountReader } from '../../infrastructure/stellar/AccountReader';
import {
  arg,
  ContractNotFoundError,
  MissingContractFunctionError,
  type IContractReader,
} from '../../infrastructure/stellar/ContractReader';
import { isContractId, isStellarPublicKey } from '../../domain/stellar/StellarAddress';
import type { IClock } from '../../shared/clock';
import { NotFoundError, UpstreamError, ValidationError, errorMessage } from '../../shared/errors';
import type { ILogger } from '../../shared/logger';
import { TtlCache } from '../../shared/TtlCache';
import {
  FORWARD_STATES,
  TENDER_STATES,
  WARRANT_STATUSES,
  asHex,
  asString,
  asTuple,
  decodeCaps,
  enumName,
  parseSacName,
  scaleDown,
  toBigInt,
  toInt,
  toIsoOrNull,
} from './decode';

/** Where the read views find the contracts to read (IDs only — never values). */
export interface ChainSources {
  deployment(): TestnetDeployment | null;
  /** On-chain tenders known to the platform, with labels for the UI. */
  listedTenders(): { contractId: string; listingId: string; title: string }[];
}

export interface ChainEnvironment {
  network: string;
  networkPassphrase(): string;
  rpcUrl(): string;
  horizonUrl(): string;
  explorerUrl: string;
}

/** Payload reads are reused this long (Soroban RPC is slow and rate-limited). */
export const CHAIN_READ_TTL_MS = 8_000;
const MINT_PROOF_PROBE_LIMIT = 4096;

const unique = (ids: (string | null | undefined)[]) => [
  ...new Set(ids.filter((id): id is string => isContractId(id))),
];

/**
 * Deliverable 3 (Instaward 1): read-only views of the deployed contracts.
 *
 * Every value comes from a contract call (Soroban RPC simulation) or Horizon —
 * never from the platform database, which only contributes the *list* of
 * contract IDs and display labels. Each payload names the contract and the
 * functions it was read from.
 */
export class ChainReadService {
  private readonly payloads = new TtlCache<unknown>(CHAIN_READ_TTL_MS, () => this.clock.now());
  /** Token metadata is immutable: cached for the life of the process. */
  private readonly assets = new Map<string, Promise<ChainAsset>>();

  constructor(
    private readonly reader: IContractReader,
    private readonly accounts: IAccountReader,
    private readonly sources: ChainSources,
    private readonly env: ChainEnvironment,
    private readonly clock: IClock,
    private readonly logger: ILogger,
  ) {}

  /* ------------------------------------------------------------------ */
  /* network                                                             */
  /* ------------------------------------------------------------------ */

  network(): Promise<ChainNetwork> {
    return this.cached('network', async () => {
      const d = this.sources.deployment();
      const usdcSac = d?.usdc?.sac || d?.usdcSac || null;
      const usdc = isContractId(usdcSac) ? await this.asset(usdcSac).catch(() => null) : null;
      return {
        network: d?.network || this.env.network,
        networkPassphrase: this.env.networkPassphrase(),
        rpcUrl: this.env.rpcUrl(),
        horizonUrl: this.env.horizonUrl().replace(/\/+$/, ''),
        explorerUrl: this.env.explorerUrl,
        usdc,
        contracts: {
          factory: isContractId(d?.factory) ? this.ref(d.factory) : null,
          stockVaults: this.stockVaultIds().map((id) => this.ref(id)),
          tenders: this.tenderIds().map((id) => this.ref(id)),
          forwards: this.forwardIds().map((id) => this.ref(id)),
          warrants: this.warrantIds().map((id) => this.ref(id)),
        },
      } satisfies ChainNetwork;
    });
  }

  /* ------------------------------------------------------------------ */
  /* tenders                                                             */
  /* ------------------------------------------------------------------ */

  async tender(contractId: string, holder?: string): Promise<ChainTender> {
    this.assertContract(contractId);
    if (holder !== undefined) this.assertAccount(holder);
    return this.cached(`tender|${contractId}|${holder ?? ''}`, async () => {
      const core = await this.tenderCore(contractId);
      if (!holder) return core;
      const reads = [...core.reads, 'get_rwa_balance'];
      const [rwa, payment] = await Promise.all([
        this.reader.call(contractId, 'get_rwa_balance', [arg.address(holder)]),
        this.balanceOf(holder, core.paymentToken).catch(() => 0),
      ]);
      return { ...core, reads, holder: { address: holder, rwaBalance: toInt(rwa), paymentBalance: payment } };
    });
  }

  /** Contract-wide state of a tender (no holder). Required reads fail the call; optional ones degrade to null. */
  private tenderCore(contractId: string): Promise<ChainTender> {
    return this.cached(`tender-core|${contractId}`, async () => {
      const [state, raised, price, tokenId] = await this.required(contractId, [
        this.reader.call(contractId, 'get_state'),
        this.reader.call(contractId, 'get_total_raised'),
        this.reader.call(contractId, 'get_price_per_unit'),
        this.reader.call<string>(contractId, 'get_payment_token'),
      ]);
      const token = await this.asset(asString(tokenId));
      const reads = ['get_state', 'get_total_raised', 'get_price_per_unit', 'get_payment_token'];
      const [legal, fiduciary, withdrawn, caps, deadline] = await Promise.all([
        this.optional(contractId, 'get_legal_info', reads),
        this.optional(contractId, 'get_fiduciary', reads),
        this.optional(contractId, 'proceeds_withdrawn', reads),
        this.optional(contractId, 'get_caps', reads),
        this.optional(contractId, 'get_deadline', reads),
      ]);
      const decodedCaps = caps === undefined ? null : safe(() => decodeCaps(caps));
      const stateName = enumName(TENDER_STATES, state);
      return {
        ...this.ref(contractId),
        readAt: this.clock.isoNow(),
        reads,
        state: { code: stateName.code, name: stateName.name as TenderStateName },
        totalRaised: scaleDown(raised, token.decimals),
        pricePerUnit: scaleDown(price, token.decimals),
        softCap: decodedCaps ? scaleDown(decodedCaps.soft, token.decimals) : null,
        hardCap: decodedCaps ? scaleDown(decodedCaps.hard, token.decimals) : null,
        deadline: deadline === undefined ? null : safe(() => toIsoOrNull(deadline)),
        paymentToken: token,
        fiduciary: fiduciary === undefined ? null : asString(fiduciary),
        proceedsWithdrawn: withdrawn === true,
        legalInfo: legal === undefined ? null : decodeLegal(legal),
      } satisfies ChainTender;
    });
  }

  /* ------------------------------------------------------------------ */
  /* portfolio                                                           */
  /* ------------------------------------------------------------------ */

  async portfolio(address: string): Promise<ChainPortfolio> {
    this.assertAccount(address);
    return this.cached(`portfolio|${address}`, async () => {
      const d = this.sources.deployment();
      const usdcSac = d?.usdc?.sac || d?.usdcSac || null;
      const [account, usdcAsset] = await Promise.all([
        this.accounts.snapshot(address).catch((err) => {
          throw new UpstreamError(`No se pudo leer la cuenta en Horizon: ${errorMessage(err)}`);
        }),
        isContractId(usdcSac) ? this.asset(usdcSac).catch(() => null) : Promise.resolve(null),
      ]);
      const usdcLine = usdcAsset?.issuer
        ? account.assets.find((a) => a.code === usdcAsset.code && a.issuer === usdcAsset.issuer)
        : undefined;

      const labels = new Map(this.sources.listedTenders().map((t) => [t.contractId, t]));
      const tenders = this.tenderIds();
      const balances = await Promise.allSettled(
        tenders.map((id) => this.reader.call(id, 'get_rwa_balance', [arg.address(address)])),
      );
      const held = tenders
        .map((id, i) => ({ id, result: balances[i] }))
        .filter(({ id, result }) => {
          if (result.status === 'rejected') {
            this.logger.warn('get_rwa_balance falló', { contractId: id, err: errorMessage(result.reason) });
            return false;
          }
          return toInt(result.value) > 0;
        });
      if (tenders.length > 0 && balances.every((b) => b.status === 'rejected')) {
        throw new UpstreamError('El RPC de Soroban no respondió: probá de nuevo en unos segundos.');
      }
      const positions = await Promise.all(
        held.map(async ({ id, result }) => {
          try {
            const core = await this.tenderCore(id);
            const label = labels.get(id);
            return {
              tender: this.ref(id),
              listingId: label?.listingId ?? null,
              title: label?.title ?? null,
              state: core.state.name,
              rwaBalance: toInt((result as PromiseFulfilledResult<unknown>).value),
              pricePerUnit: core.pricePerUnit,
              paymentToken: core.paymentToken,
            };
          } catch (err) {
            this.logger.warn('lectura de licitación falló', { contractId: id, err: errorMessage(err) });
            return null;
          }
        }),
      );
      return {
        address,
        readAt: this.clock.isoNow(),
        xlm: account.xlm,
        usdc: usdcAsset
          ? { asset: usdcAsset, balance: usdcLine?.balance ?? 0, trustline: Boolean(usdcLine) }
          : null,
        positions: positions.filter((p): p is NonNullable<typeof p> => p !== null),
      } satisfies ChainPortfolio;
    });
  }

  /* ------------------------------------------------------------------ */
  /* forwards · warrants · stock vaults (read-only views)                */
  /* ------------------------------------------------------------------ */

  forwards(): Promise<ChainForward[]> {
    return this.cached('forwards', () => this.each(this.forwardIds(), (id) => this.forward(id)));
  }

  warrants(): Promise<ChainWarrant[]> {
    return this.cached('warrants', () => this.each(this.warrantIds(), (id) => this.warrant(id)));
  }

  async stocks(holder?: string): Promise<ChainStockVault[]> {
    if (holder !== undefined) this.assertAccount(holder);
    return this.cached(`stocks|${holder ?? ''}`, () =>
      this.each(this.stockVaultIds(), (id) => this.stockVault(id, holder)),
    );
  }

  private async forward(contractId: string): Promise<ChainForward> {
    const [state, kilos, crop, tokenId] = await this.required(contractId, [
      this.reader.call(contractId, 'get_state'),
      this.reader.call(contractId, 'get_total_kilos'),
      this.reader.call(contractId, 'get_crop_name'),
      this.reader.call<string>(contractId, 'get_payment_token'),
    ]);
    const token = await this.asset(asString(tokenId));
    const reads = ['get_state', 'get_total_kilos', 'get_crop_name', 'get_payment_token'];
    const [parties, position] = await Promise.all([
      this.optional(contractId, 'get_parties', reads),
      this.optional(contractId, 'get_position', reads),
    ]);
    const p = parties === undefined ? null : safe(() => asTuple(parties, 3, 'get_parties'));
    const pos = position === undefined ? null : safe(() => asTuple(position, 7, 'get_position'));
    return {
      ...this.ref(contractId),
      readAt: this.clock.isoNow(),
      reads,
      state: String(enumName(FORWARD_STATES, state).name),
      cropName: asString(crop),
      totalKilos: toInt(kilos),
      parties: p ? { producer: asString(p[0]), buyer: asString(p[1]) } : null,
      arbiter: p ? asString(p[2]) : null,
      position: pos
        ? {
            delivered: pos[1] === true,
            deliveredAt: toIsoOrNull(pos[2]),
            disputed: pos[3] === true,
            harvestDeadline: toIsoOrNull(pos[4]),
            rollovers: toInt(pos[5]),
            escrow: scaleDown(pos[6], token.decimals),
          }
        : null,
      paymentToken: token,
    };
  }

  private async warrant(contractId: string): Promise<ChainWarrant> {
    const [status, loan, tokenId] = await this.required(contractId, [
      this.reader.call(contractId, 'get_status'),
      this.reader.call(contractId, 'get_loan_amount'),
      this.reader.call<string>(contractId, 'get_payment_token'),
    ]);
    const token = await this.asset(asString(tokenId));
    const reads = ['get_status', 'get_loan_amount', 'get_payment_token'];
    const [producer, terms] = await Promise.all([
      this.optional(contractId, 'get_producer', reads),
      this.optional(contractId, 'get_terms', reads),
    ]);
    const statusName = String(enumName(WARRANT_STATUSES, status).name);
    const t = terms === undefined ? null : safe(() => asTuple(terms, 6, 'get_terms'));
    return {
      ...this.ref(contractId),
      readAt: this.clock.isoNow(),
      reads,
      status: statusName,
      loanAmount: scaleDown(loan, token.decimals),
      producer: producer === undefined ? null : asString(producer),
      terms: t
        ? {
            inventoryValue: scaleDown(t[0], token.decimals),
            ltvBps: toInt(t[1]),
            interestRateBps: toInt(t[2]),
            // `start_ts` is the deposit time until the loan is funded, then the funding time.
            fundedAt: statusName === 'Deposited' ? null : toIsoOrNull(t[3]),
            dueAt: toIsoOrNull(t[4]),
            offerExpiresAt: toIsoOrNull(t[5]),
          }
        : null,
      paymentToken: token,
    };
  }

  private async stockVault(contractId: string, holder?: string): Promise<ChainStockVault> {
    const [meta, tokenId] = await this.required(contractId, [
      this.reader.call(contractId, 'get_metadata'),
      this.reader.call<string>(contractId, 'get_payment_token'),
    ]);
    const token = await this.asset(asString(tokenId));
    const reads = ['get_metadata', 'get_payment_token'];
    const [pool, paused] = await Promise.all([
      this.optional(contractId, 'get_unclaimed_pool', reads),
      this.optional(contractId, 'is_mint_paused', reads),
    ]);
    const proof = await this.lastMintProof(contractId).catch((err) => {
      this.logger.warn('get_mint_proof falló', { contractId, err: errorMessage(err) });
      return null;
    });
    if (proof) reads.push('get_mint_proof');
    let holderView: ChainStockVault['holder'];
    if (holder) {
      const [balance, claimable] = await Promise.all([
        this.optional(contractId, 'get_balance', reads, [arg.address(holder)]),
        this.optional(contractId, 'get_claimable', reads, [arg.address(holder)]),
      ]);
      holderView = {
        address: holder,
        balance: balance === undefined ? 0 : toInt(balance),
        claimable: claimable === undefined ? 0 : scaleDown(claimable, token.decimals),
      };
    }
    return {
      ...this.ref(contractId),
      readAt: this.clock.isoNow(),
      reads,
      metadata: decodeStockMetadata(meta),
      unclaimedPool: pool === undefined ? 0 : scaleDown(pool, token.decimals),
      mintPaused: paused === true,
      lastProof: proof,
      paymentToken: token,
      ...(holderView ? { holder: holderView } : {}),
    };
  }

  /**
   * The vault keeps one proof per mint (`get_mint_proof(seq)`, seq from 1) but
   * no getter for the latest seq: find it by exponential probing + binary search.
   */
  private async lastMintProof(contractId: string): Promise<ChainMintProof | null> {
    const probe = async (seq: number) => {
      try {
        return asTuple(
          await this.reader.call(contractId, 'get_mint_proof', [arg.u64(seq)]),
          3,
          'get_mint_proof',
        );
      } catch (err) {
        if (err instanceof MissingContractFunctionError) throw err;
        return null; // "Unknown mint"
      }
    };
    let found = await probe(1);
    if (!found) return null;
    let lo = 1;
    let hi = 2;
    let loValue = found;
    while (hi <= MINT_PROOF_PROBE_LIMIT) {
      const value = await probe(hi);
      if (!value) break;
      lo = hi;
      loValue = value;
      hi *= 2;
    }
    // Invariant: lo exists, hi does not (or hi is beyond the probe limit).
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      const value = await probe(mid);
      if (value) {
        lo = mid;
        loValue = value;
      } else hi = mid;
    }
    found = loValue;
    return { seq: lo, to: asString(found[0]), amount: toInt(found[1]), cvDepositHash: asHex(found[2]) };
  }

  /* ------------------------------------------------------------------ */
  /* tokens and balances                                                 */
  /* ------------------------------------------------------------------ */

  /** A payment token as `ChainAsset`: `name()` / `decimals()` of the SAC (or `symbol()` for other tokens). */
  asset(contractId: string): Promise<ChainAsset> {
    let pending = this.assets.get(contractId);
    if (!pending) {
      pending = (async () => {
        const [name, decimals] = await Promise.all([
          this.reader.call(contractId, 'name'),
          this.reader.call(contractId, 'decimals'),
        ]);
        let classic = parseSacName(asString(name));
        if (!classic) {
          const symbol = await this.reader.call(contractId, 'symbol').catch(() => name);
          classic = { code: asString(symbol), issuer: null };
        }
        return { ...classic, contractId, decimals: toInt(decimals), explorer: this.link(contractId) };
      })();
      this.assets.set(contractId, pending);
      pending.catch(() => this.assets.delete(contractId));
    }
    return pending;
  }

  private async balanceOf(address: string, token: ChainAsset): Promise<number> {
    if (token.code === 'XLM' && token.issuer === null) return (await this.accounts.snapshot(address)).xlm;
    if (token.issuer) {
      const line = (await this.accounts.snapshot(address)).assets.find(
        (a) => a.code === token.code && a.issuer === token.issuer,
      );
      return line?.balance ?? 0;
    }
    return scaleDown(
      await this.reader.call(token.contractId, 'balance', [arg.address(address)]),
      token.decimals,
    );
  }

  /* ------------------------------------------------------------------ */
  /* helpers                                                             */
  /* ------------------------------------------------------------------ */

  private tenderIds(): string[] {
    const d = this.sources.deployment();
    return unique([
      ...(d?.seeded?.tenders ?? []),
      d?.licitacion,
      ...this.sources.listedTenders().map((t) => t.contractId),
    ]);
  }

  private forwardIds(): string[] {
    const d = this.sources.deployment();
    return unique(d?.seeded?.forwards?.length ? d.seeded.forwards : [d?.forward]);
  }

  private warrantIds(): string[] {
    const d = this.sources.deployment();
    return unique(d?.seeded?.warrants?.length ? d.seeded.warrants : [d?.warrant]);
  }

  private stockVaultIds(): string[] {
    const d = this.sources.deployment();
    return unique(d?.seeded?.stockVaults?.length ? d.seeded.stockVaults : [d?.stockVault]);
  }

  private ref(contractId: string): ChainRef {
    return { contractId, explorer: this.link(contractId) };
  }

  private link(contractId: string): string {
    return `${this.env.explorerUrl.replace(/\/+$/, '')}/contract/${contractId}`;
  }

  /**
   * Drops cached reads that a confirmed transaction made stale: the tender
   * (all holders) and the signer's portfolio. The next read goes to the chain.
   */
  forget(contractId?: string, address?: string): void {
    if (contractId) {
      this.payloads.forget(`tender|${contractId}`);
      this.payloads.forget(`tender-core|${contractId}`);
    }
    if (address) this.payloads.forget(`portfolio|${address}`);
    this.payloads.forget('stocks');
  }

  private cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    return this.payloads.get(key, load) as Promise<T>;
  }

  /** Reads an instance must have; a failure means the contract can't be shown at all. */
  private async required(contractId: string, reads: Promise<unknown>[]): Promise<unknown[]> {
    try {
      return await Promise.all(reads);
    } catch (err) {
      if (err instanceof MissingContractFunctionError) {
        throw new ValidationError(
          `${contractId} no es un contrato del tipo esperado (${err.fn}() no existe)`,
        );
      }
      if (err instanceof ContractNotFoundError) {
        throw new NotFoundError(`No hay un contrato ${contractId} desplegado en esta red`);
      }
      throw new UpstreamError(`No se pudo leer el contrato ${contractId} en Soroban: ${errorMessage(err)}`);
    }
  }

  /**
   * An optional read: missing functions (older WASMs) and failures give
   * `undefined` instead of failing the view. Successful reads are recorded.
   */
  private async optional(
    contractId: string,
    fn: string,
    reads: string[],
    args: Parameters<IContractReader['call']>[2] = [],
  ) {
    try {
      const value = await this.reader.call(contractId, fn, args);
      reads.push(fn);
      return value;
    } catch (err) {
      if (!(err instanceof MissingContractFunctionError)) {
        this.logger.warn('lectura opcional falló', { contractId, fn, err: errorMessage(err) });
      }
      return undefined;
    }
  }

  /** One failing instance is left out (and logged) instead of failing the list. */
  private async each<T>(ids: string[], read: (id: string) => Promise<T>): Promise<T[]> {
    const results = await Promise.allSettled(ids.map(read));
    const out: T[] = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') out.push(r.value);
      else this.logger.warn('instancia omitida', { contractId: ids[i], err: errorMessage(r.reason) });
    });
    if (ids.length > 0 && out.length === 0) {
      throw new UpstreamError('No se pudo leer ningún contrato en Soroban: probá de nuevo en unos segundos.');
    }
    return out;
  }

  private assertContract(id: string): void {
    if (!isContractId(id)) throw new ValidationError('ID de contrato inválido (tiene que empezar con C)');
  }

  private assertAccount(id: string): void {
    if (!isStellarPublicKey(id))
      throw new ValidationError('Dirección Stellar inválida (tiene que empezar con G)');
  }
}

function safe<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

function decodeLegal(value: unknown): ChainTender['legalInfo'] {
  if (!value || typeof value !== 'object') return null;
  const o = value as Record<string, unknown>;
  return {
    cnvRecordId: asString(o.cnv_record_id),
    legalTermsUri: asString(o.legal_terms_uri),
    fideicomisoHash: asHex(o.fideicomiso_hash),
  };
}

function decodeStockMetadata(value: unknown): ChainStockVault['metadata'] {
  const o = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const int = (v: unknown) => (v === undefined ? null : toInt(v));
  return {
    ticker: asString(o.ticker),
    companyName: asString(o.company_name),
    isin: asString(o.isin),
    totalSharesCustodied: int(o.total_shares_custodied),
    totalTokensMinted: int(o.total_tokens_minted),
    custodianCuit: asString(o.custodian_cuit),
    lastAuditAt: o.last_audit_timestamp === undefined ? null : toIsoOrNull(o.last_audit_timestamp),
    dividendPerTokenAccum:
      o.dividend_per_token_accum === undefined ? null : toBigInt(o.dividend_per_token_accum).toString(),
  };
}
