import { createHash, randomBytes } from 'crypto';
import type { Listing } from '../../domain/listing/Listing';
import { isContractId, isStellarPublicKey } from '../../domain/stellar/StellarAddress';
import { DomainError, NotConfiguredError } from '../../shared/errors';
import { planDeploy } from './ContractDeployPlan';
import type { PlatformKeyring } from './PlatformKeyring';
import type { AnyClient, SorobanGateway } from './SorobanGateway';
import type { DeploymentRegistryLike } from './types';

/** `issuance-factory::PaymentKind::Usdc`. */
const PAYMENT_KIND_USDC = 1;

/**
 * Adapter for the per-listing `stock-vault` contract. Each listing gets its
 * own instance (v1 once pointed every listing at a shared vault, so the
 * second one minted against the first one's custody counters).
 */
export class StockVaultContract {
  constructor(
    private readonly soroban: SorobanGateway,
    private readonly keyring: PlatformKeyring,
    private readonly deployments: DeploymentRegistryLike,
  ) {}

  canDeploy(): boolean {
    const d = this.deployments.load();
    return Boolean(d?.stockVaultWasmHash || isContractId(d?.stockVault));
  }

  /** Soroban `Symbol`: a-zA-Z0-9_, max 32 chars. */
  private static symbol(code: string): string {
    return (
      String(code || '')
        .toUpperCase()
        .replace(/[^A-Z0-9_]/g, '')
        .slice(0, 32) || 'TOKEN'
    );
  }

  /** Caja de Valores attestation as the BytesN<32> the contract expects. */
  private static cvHash(listing: Listing): Buffer {
    const raw = String(listing.cvDepositHash || '');
    const buf = Buffer.from(raw, 'hex');
    return buf.length === 32
      ? buf
      : createHash('sha256')
          .update(raw || listing.id)
          .digest();
  }

  /**
   * Deploys the vault (registry = factory, payment token = USDC SAC, PoR
   * oracle = provisioned oracle) and attests `sharesToTokenize` in custody so
   * `mint_backed_stock` can run.
   *
   * New WASMs are deployed *by the factory* (`deploy_stock_vault`): it vets
   * the terms and signs off the constructor, which is what binds the vault to
   * it (SC-02), in the same transaction (SC-06). Legacy WASMs: deploy, then
   * `initialize_stock`, then read admin and registry back.
   */
  async deployForListing(listing: Listing): Promise<{ contractId: string; hash: string | null }> {
    const d = this.deployments.load();
    const wasmHash =
      d?.stockVaultWasmHash ||
      (isContractId(d?.stockVault) ? await this.soroban.wasmHashOf(d!.stockVault!) : '');
    if (!wasmHash) throw new NotConfiguredError('deployments/testnet.json no tiene el WASM del stock vault');
    const paymentToken = d?.usdcSac;
    if (!isContractId(paymentToken))
      throw new NotConfiguredError('Falta usdcSac en deployments/testnet.json');

    const admin = await this.keyring.licitacionAdmin();
    const oracle = await this.keyring.porOracle();
    if (oracle.publicKey() === admin.publicKey()) {
      throw new DomainError('El oráculo PoR no puede ser la misma cuenta que el custodio');
    }
    const meta = listing.dossier;
    const factoryId = this.soroban.factoryId();
    const terms = {
      ticker: StockVaultContract.symbol(meta.tokenTicker || meta.ticker),
      company_name: meta.legalName || meta.tradeName || meta.tokenTicker,
      isin: meta.isin || '',
      custodian_cuit: meta.custodianCuit || '',
    };
    const plan = planDeploy(
      'stockVault',
      await this.soroban.wasmFunctions(wasmHash),
      await this.soroban.contractFunctions(factoryId),
    );
    let deployed: { contractId: string; hash: string | null };
    if (plan.kind === 'factory') {
      // The factory admin is the platform's licitación admin (same key that
      // registers products); it is also the vault's custodian here.
      const { hash, result } = await this.soroban.invokeWithCosigners(
        factoryId,
        plan.method,
        {
          admin: admin.publicKey(),
          wasm_hash: Buffer.from(wasmHash, 'hex'),
          salt: randomBytes(32),
          custodian: admin.publicKey(),
          por_oracle: oracle.publicKey(),
          payment_kind: PAYMENT_KIND_USDC,
          terms,
          name: `${meta.tokenTicker || meta.ticker} · ${meta.legalName || meta.tradeName || ''}`.slice(0, 64),
        },
        admin,
      );
      if (!isContractId(String(result))) throw new DomainError('La factory no devolvió el vault desplegado');
      deployed = { contractId: String(result), hash };
    } else {
      deployed = await this.soroban.deployFromWasmHash(wasmHash, admin);
      // `planDeploy` only answers `legacy` here when the WASM has `initialize_stock`.
      await this.soroban.invoke(await this.soroban.client(deployed.contractId, admin), 'initialize_stock', {
        admin: admin.publicKey(),
        por_oracle: oracle.publicKey(),
        registry: factoryId,
        payment_token: paymentToken,
        ...terms,
      });
    }
    const client = await this.soroban.client(deployed.contractId, admin);
    await this.assertInitializedByUs(client, admin.publicKey());
    // The CdV deposit precedes minting: this attestation unblocks the
    // `minted <= custodied` check for this listing.
    await this.soroban.invoke(
      client,
      'update_proof_of_reserve',
      {
        oracle: oracle.publicKey(),
        shares_in_cv: BigInt(Math.round(meta.sharesToTokenize)),
        audit_hash: StockVaultContract.cvHash(listing),
      },
      [oracle],
    );
    return { contractId: deployed.contractId, hash: deployed.hash };
  }

  /**
   * SC-02 / SC-06: with a legacy WASM, deploy and `initialize_stock` are
   * separate transactions, so a front-runner could initialize our instance
   * with their own admin or a fake registry. Read both back before trusting
   * the instance (cheap, so it is also checked for factory deploys).
   */
  private async assertInitializedByUs(client: AnyClient, expectedAdmin: string): Promise<void> {
    const [admin, registry] = await Promise.all([
      this.soroban.readOptional<string>(client, 'get_admin'),
      this.soroban.readOptional<string>(client, 'get_registry'),
    ]);
    if (admin !== undefined && String(admin) !== expectedAdmin) {
      throw new DomainError('El vault quedó inicializado con otro admin (posible front-running): descartado');
    }
    if (registry !== undefined && String(registry) !== this.soroban.factoryId()) {
      throw new DomainError('El vault apunta a otro registry: descartado');
    }
  }

  /** Mints backed tokens on the listing's vault to the issuer (custody float). */
  async mintBacked(
    listing: Listing,
    amount: number,
  ): Promise<{ hash: string | null; to: string; contractId: string } | null> {
    if (!isContractId(listing.stockContract)) return null;
    const admin = await this.keyring.licitacionAdmin();
    const client = await this.soroban.client(listing.stockContract, admin);
    const to = isStellarPublicKey(listing.dossier.issuerPublicKey)
      ? listing.dossier.issuerPublicKey
      : admin.publicKey();
    const { hash } = await this.soroban.invoke(client, 'mint_backed_stock', {
      admin: admin.publicKey(),
      to,
      amount: BigInt(Math.round(amount)),
      cv_deposit_hash: StockVaultContract.cvHash(listing),
    });
    return { hash, to, contractId: listing.stockContract };
  }
}
