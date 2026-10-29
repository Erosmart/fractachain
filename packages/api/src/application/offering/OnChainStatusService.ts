import { isOnChainListing, type Listing } from '../../domain/listing/Listing';
import { isContractId } from '../../domain/stellar/StellarAddress';
import { errorMessage } from '../../shared/errors';
import type { Explorer } from '../../infrastructure/stellar/Explorer';
import type { SorobanGateway } from '../../infrastructure/stellar/SorobanGateway';
import type { DeploymentRegistryLike } from '../../infrastructure/stellar/types';
import type { AccountService } from '../account/AccountService';
import type { ListingLedger } from '../listing/ListingLedger';
import type { SdexMarketService } from '../market/SdexMarketService';

export interface ContributionReceiptView {
  sandboxPrimary: boolean;
  network: string;
  licitacion: string | null;
  explorer: string | null;
  paymentKind: string | null;
  contributeHash: string | null;
  contributeExplorer: string | null;
  trustlineHash: string | null;
  trustlineExplorer: string | null;
  note: string;
  trustlineError?: string;
}

/** Chain metadata, receipts and the global on-chain status panel. */
export class OnChainStatusService {
  constructor(
    private readonly listings: ListingLedger,
    private readonly accounts: AccountService,
    private readonly sdexMarket: SdexMarketService,
    private readonly soroban: SorobanGateway,
    private readonly deployments: DeploymentRegistryLike,
    private readonly explorer: Explorer,
  ) {}

  chainMeta(listing?: Listing | null) {
    const deployment = this.deployments.load();
    const licitacion = listing?.licitacionContract || deployment?.licitacion || null;
    const live = listing ? isOnChainListing(listing) : isContractId(licitacion);
    return {
      sandboxPrimary: !live,
      network: 'testnet',
      licitacion,
      explorer: this.explorer.contract(licitacion),
      paymentKind: listing?.dossier.paymentKind || null,
    };
  }

  async status() {
    const deployment = this.deployments.load();
    let ledger: number | null = null;
    let rpcOk = false;
    let error: string | undefined;
    try {
      ledger = await this.soroban.latestLedger();
      rpcOk = true;
    } catch (err) {
      error = errorMessage(err);
    }
    return {
      network: deployment?.network || 'testnet',
      onChain: isContractId(deployment?.licitacion),
      rpcOk,
      ledger,
      error,
      factory: deployment?.factory || null,
      licitacion: deployment?.licitacion || null,
      licitacionLegacy: deployment?.licitacionLegacy || null,
      stockVault: deployment?.stockVault || null,
      forward: deployment?.forward || null,
      warrant: deployment?.warrant || null,
      warrantFactory: deployment?.warrantFactory || null,
      issuer: deployment?.issuer || null,
      explorer: {
        factory: this.explorer.contract(deployment?.factory),
        licitacion: this.explorer.contract(deployment?.licitacion),
        stockVault: this.explorer.contract(deployment?.stockVault),
        forward: this.explorer.contract(deployment?.forward),
        warrant: this.explorer.contract(deployment?.warrant),
        warrantFactory: this.explorer.contract(deployment?.warrantFactory),
      },
    };
  }

  /**
   * Receipt after a subscription. Also records the trustline opt-in and, for
   * custodial wallets on SDEX listings, opens the classic trustline on-ledger.
   */
  async receiptAfterContribute(listingId: string, accountId: string, contributeHash?: string | null): Promise<ContributionReceiptView> {
    const listing = this.listings.get(listingId);
    const account = this.accounts.get(accountId);
    const receipt: ContributionReceiptView = {
      ...this.chainMeta(listing),
      contributeHash: contributeHash || null,
      contributeExplorer: this.explorer.tx(contributeHash),
      trustlineHash: null,
      trustlineExplorer: null,
      note: contributeHash
        ? 'Aporte on-chain a la licitación. El hash es contribute() en testnet.'
        : 'El aporte primario queda en el backend. Si hay wallet custodial y emisor Stellar, la trustline sí se manda a testnet.',
    };
    if (!listing || !account) return receipt;
    try {
      this.accounts.addTrustline(accountId, listingId);
    } catch {
      // already recorded, or KYC/wallet missing — contribute already gated that
    }
    if (!(this.sdexMarket.available(listing) && account.custodyMode === 'CUSTODIAL' && account.publicKey)) return receipt;
    try {
      const result = await this.sdexMarket.openCustodialTrustline({ listingId, accountId });
      receipt.trustlineHash = result.hash || null;
      receipt.trustlineExplorer = this.explorer.tx(result.hash);
      if (result.hash && !contributeHash) {
        receipt.note = 'Aporte sandbox + trustline en Stellar testnet. Abrí el hash en Stellar Expert.';
      }
    } catch (err) {
      receipt.trustlineError = errorMessage(err);
    }
    return receipt;
  }
}
