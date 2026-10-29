import type { AuthApi } from '../api/AuthApi';
import type { KycApi, KycSubmission } from '../api/KycApi';
import type { SessionStore } from '../auth/SessionStore';
import { normalizeUser } from '../auth/SessionUser';
import type { Translate } from '../i18n/translate';
import type { UsdcFundingService } from '../wallet/UsdcFundingService';
import type { IWalletSigner } from '../wallet/WalletSigner';

/** Wallet choice and KYC — the steps between first login and the dashboard. */
export class OnboardingService {
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

  private requireSession(): void {
    if (!this.session.isAuthenticated()) throw new Error(this.t('err.signIn'));
  }
}
