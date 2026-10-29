import type { CompanyDossier, SettleChoice } from '../../domain/listing/Listing';
import type { Explorer } from '../../infrastructure/stellar/Explorer';
import type { LicitacionContract } from '../../infrastructure/stellar/LicitacionContract';
import type { PlatformKeyring } from '../../infrastructure/stellar/PlatformKeyring';
import type { StockVaultContract } from '../../infrastructure/stellar/StockVaultContract';
import { paymentUnit } from '../../domain/listing/Listing';
import type { ITreasurySecrets } from '../demo/DemoDossierService';
import type { ListingLedger } from './ListingLedger';

/**
 * Admin issuance pipeline: dossier → vault deploy → 1:1 mint → licitación.
 *
 * Every step validates on the platform ledger first and only then pays for
 * the on-chain call, so a failed Soroban invocation leaves the listing in its
 * previous state with the real error surfaced.
 */
export class IssuanceWorkflowService {
  constructor(
    private readonly listings: ListingLedger,
    private readonly stockVault: StockVaultContract,
    private readonly licitacion: LicitacionContract,
    private readonly keyring: PlatformKeyring,
    private readonly treasuries: ITreasurySecrets,
    private readonly explorer: Explorer,
  ) {}

  async create(dossier: CompanyDossier) {
    const body = { ...dossier };
    if (!String(body.issuerPublicKey || '').trim()) {
      body.issuerPublicKey =
        (await this.keyring.ensurePlatformIssuer().catch(() => null))?.publicKey() || this.keyring.platformIssuerPublicKey() || '';
    }
    return this.listings.create(body);
  }

  async deploy(listingId: string) {
    const listing = this.listings.assertDeployable(listingId);
    // The CdV slip hash must exist before the vault deploy so the PoR
    // attestation and every mint proof reference the same deposit.
    listing.cvDepositHash = this.listings.cvDepositHash(listing);
    const vault = this.stockVault.canDeploy() ? await this.stockVault.deployForListing(listing) : null;
    const updated = this.listings.markDeployed(listingId, vault ? { contractId: vault.contractId } : undefined);
    return {
      ...updated,
      onChain: vault ? { hash: vault.hash, contractId: vault.contractId, explorer: this.explorer.tx(vault.hash) } : null,
    };
  }

  async mint(listingId: string, amount: number) {
    const listing = this.listings.assertMintable(listingId, amount);
    // On-chain first: if it fails, the platform counter is untouched.
    const chain = await this.stockVault.mintBacked(listing, amount);
    const updated = this.listings.recordMint(listingId, amount);
    return {
      ...updated,
      onChain: chain ? { hash: chain.hash, explorer: this.explorer.tx(chain.hash), to: chain.to } : null,
    };
  }

  async openLicitacion(listingId: string, opts: SettleChoice) {
    const { listing: draft, deadlineMs } = this.listings.prepareOpen(listingId, opts);
    // Each offering gets its own instance, initialized with the company wallet as fiduciary.
    const onChain = this.licitacion.canDeploy()
      ? await this.licitacion.deployForListing(draft, deadlineMs, this.treasuries.secretFor(draft.dossier.proceedsWallet))
      : undefined;
    const listing = this.listings.markOpen(listingId, opts, onChain);
    return {
      ...listing,
      fiduciary: onChain
        ? {
            hash: onChain.hash,
            fiduciary: listing.dossier.proceedsWallet,
            paymentUnit: paymentUnit(listing),
            usdcTrustlineReady: onChain.fiduciaryUsdcReady,
            note:
              onChain.fiduciaryUsdcReady === false
                ? 'La wallet de cobro todavía no tiene trustline USDC: tiene que crearla antes del finalize o el pago falla on-chain.'
                : null,
          }
        : null,
    };
  }

  async setProceedsWallet(listingId: string, wallet: string) {
    const listing = this.listings.setProceedsWallet(listingId, wallet);
    // Before the offering opens there is no instance yet: the wallet goes into `initialize`.
    const fiduciary = listing.status === 'LISTED' ? await this.licitacion.syncFiduciary(listing) : null;
    return { ...listing, fiduciary };
  }

  setSettle(listingId: string, opts: SettleChoice) {
    return this.listings.setSettle(listingId, opts);
  }
}
