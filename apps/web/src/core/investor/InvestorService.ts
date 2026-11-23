import type { AuthApi } from '../api/AuthApi';
import type { ListingsApi } from '../api/ListingsApi';
import type { MarketApi } from '../api/MarketApi';
import type { ChainActionResult } from '../api/types';
import type { AuthService } from '../auth/AuthService';
import type { SessionStore } from '../auth/SessionStore';
import { normalizeUser } from '../auth/SessionUser';
import type { Translate } from '../i18n/translate';
import type { SelfCustodyRelay } from '../wallet/SelfCustodyRelay';
import { errorMessage } from '../errors';

/** Post-subscription investor actions on a listing. */
export class InvestorService {
  constructor(
    private readonly listings: ListingsApi,
    private readonly market: MarketApi,
    private readonly authApi: AuthApi,
    private readonly auth: AuthService,
    private readonly session: SessionStore,
    private readonly relay: SelfCustodyRelay,
    private readonly t: Translate,
  ) {}

  /** Opts into the token: the trustline (signed by the holder when self-custody) plus the platform record. */
  readonly approveToken = async (listingId: string): Promise<void> => {
    this.requireSession();
    if (this.session.getSnapshot().user?.custodyMode === 'SELF') {
      await this.relay
        .signAndRelay({
          prepare: this.market.sdexTrustlinePreparePath(listingId),
          submit: this.market.sdexSubmitPath,
        })
        .catch((err: unknown) => {
          // No issuing account yet means no asset to trust: the opt-in is still
          // recorded below and the trustline is signed once the asset exists.
          if (/no cotiza en el DEX/i.test(errorMessage(err))) return null;
          throw err;
        });
    }
    this.applyUser(await this.listings.trustline(listingId));
  };

  readonly claimTokens = async (listingId: string): Promise<ChainActionResult> => {
    this.requireSession();
    const data = await this.listings.claim(listingId);
    this.applyUser(data);
    return data;
  };

  readonly distributeTokens = async (listingId: string): Promise<ChainActionResult> => {
    this.requireSession();
    const data = await this.listings.distribute(listingId);
    await this.auth.refresh();
    return data;
  };

  readonly fetchWalletSecret = async (): Promise<string> => {
    this.requireSession();
    return this.authApi.walletSecret();
  };

  readonly claimDividends = async (listingId: string): Promise<void> => {
    this.requireSession();
    const data = await this.listings.claimDividends(listingId);
    this.applyUser(data.user);
  };

  readonly finalizeOffering = async (listingId: string): Promise<ChainActionResult> => {
    this.requireSession();
    return this.listings.finalize(listingId);
  };

  /**
   * Custodial refund: the platform signs with the custodial wallet. Self-custody
   * refunds are built by `/api/tx/build` and signed in Freighter (the tx flow).
   */
  readonly refundContribution = async (listingId: string): Promise<ChainActionResult> => {
    this.requireSession();
    const data = await this.listings.refund(listingId);
    if (data?.user) this.applyUser(data.user);
    return data;
  };

  private applyUser(raw: unknown): void {
    if (raw && typeof raw === 'object') this.session.updateUser(normalizeUser(raw));
  }

  private requireSession(): void {
    if (!this.session.isAuthenticated()) throw new Error(this.t('err.signIn'));
  }
}
