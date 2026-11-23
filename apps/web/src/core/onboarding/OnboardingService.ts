import type { KycProviderInfo, VerificationView } from '@fractachain/shared';
import type { AuthApi } from '../api/AuthApi';
import type { KycApi, KycSubmission } from '../api/KycApi';
import type { SessionStore } from '../auth/SessionStore';
import { normalizeUser } from '../auth/SessionUser';
import type { Translate } from '../i18n/translate';
import type { UsdcFundingService } from '../wallet/UsdcFundingService';
import type { IWalletSigner } from '../wallet/WalletSigner';
import { isTrustedVerificationUrl } from './verification';

/** Wallet choice and KYC — the steps between first login and the dashboard. */
export class OnboardingService {
  private providerInfo?: Promise<KycProviderInfo>;

  constructor(
    private readonly auth: AuthApi,
    private readonly kyc: KycApi,
    private readonly session: SessionStore,
    private readonly signer: IWalletSigner,
    private readonly usdc: UsdcFundingService,
    private readonly t: Translate,
  ) {}

  readonly chooseCustody = async (mode: 'CUSTODIAL' | 'SELF', publicKey?: string): Promise<void> => {
    this.requireSession();
    const res = await this.auth.chooseCustody(mode, publicKey);
    if (res.secretOnce) this.session.setRevealedSecret(res.secretOnce);
    this.session.updateUser(normalizeUser(res.user));
    // Same post-step as login/link: custodial resolves server-side, self-custody
    // signs the changeTrust in Freighter exactly once.
    await this.usdc.ensureReady().catch(() => undefined);
  };

  /** Signs a challenge so the backend knows the investor controls the key, then stores it. */
  readonly linkFreighterWallet = async (): Promise<void> => {
    this.requireSession();
    const payload = await this.signer.signLinkChallenge();
    const res = await this.auth.linkWallet(payload);
    this.session.updateUser(normalizeUser(res.user));
    await this.usdc.ensureReady().catch(() => undefined);
  };

  readonly submitKyc = async (payload: KycSubmission): Promise<void> => {
    this.requireSession();
    this.session.updateUser(normalizeUser(await this.kyc.submit(payload)));
  };

  /** Which KYC flow to show. Cached for the page; a failed lookup is retried next time. */
  readonly kycProvider = (): Promise<KycProviderInfo> => {
    this.providerInfo ??= this.kyc.provider().catch((err) => {
      this.providerInfo = undefined;
      throw err;
    });
    return this.providerInfo;
  };

  readonly verificationStatus = (): Promise<VerificationView> => {
    this.requireSession();
    return this.kyc.verification();
  };

  /**
   * Re-reads the provider's decision through the API (the redirect's query
   * string is never trusted) and refreshes the signed-in user when the KYC
   * status moved, so the header and guards see it right away.
   */
  readonly syncVerification = async (): Promise<VerificationView> => {
    this.requireSession();
    const view = await this.kyc.syncVerification();
    if (view.kycStatus !== this.session.getSnapshot().user?.kycStatus) await this.refreshUser();
    return view;
  };

  /**
   * Starts (or resumes) the hosted verification and returns the provider URL
   * to send the browser to. Refuses anything that isn't Didit over https.
   */
  readonly startVerification = async (language: 'es' | 'en'): Promise<string> => {
    this.requireSession();
    const { url } = await this.kyc.startVerification(language);
    if (!isTrustedVerificationUrl(url)) throw new Error(this.t('onboard.errors.badRedirect'));
    return url;
  };

  /** Didit flow: sends name + CUIT, then opens the hosted verification. */
  readonly submitKycAndVerify = async (payload: KycSubmission, language: 'es' | 'en'): Promise<string> => {
    await this.submitKyc(payload);
    return this.startVerification(language);
  };

  private async refreshUser(): Promise<void> {
    try {
      this.session.updateUser(normalizeUser(await this.auth.me()));
    } catch {
      // transient: the next page load refreshes it
    }
  }

  private requireSession(): void {
    if (!this.session.isAuthenticated()) throw new Error(this.t('err.signIn'));
  }
}
