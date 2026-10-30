import type { AccountCloseRequest } from '@fractachain/shared';
import {
  TermsPolicy,
  hasTwoFactor,
  isClosed,
  isEmailVerified,
  isWalletEmail,
  type Account,
} from '../../domain/account/Account';
import type { IAccountRepository } from '../../domain/account/AccountRepository';
import type { IKycRecordRepository } from '../../domain/kyc/KycRecord';
import type { IMailer } from '../../infrastructure/mail/Mailer';
import type { IDocumentStore } from '../../infrastructure/persistence/DocumentStore';
import type { IPasswordHasher } from '../../infrastructure/security/PasswordHasher';
import type { IWalletSignatureVerifier } from '../../infrastructure/security/WalletSignatureVerifier';
import type { ISelfieStorage } from '../../infrastructure/storage/SelfieStorage';
import type { IClock } from '../../shared/clock';
import { ConflictError, ForbiddenError, UnauthenticatedError, ValidationError } from '../../shared/errors';
import type { ILogger } from '../../shared/logger';
import type { AuditTrail } from '../audit/AuditTrail';
import type { SupportService } from '../support/SupportService';
import { TX_BUILDS_KEY, type TxBuildRecord } from '../tx/TxBuildStore';

/** Balances of a custodial wallet, read from the network. */
export interface CustodialBalances {
  xlm: number;
  /** Minimum XLM the account must keep (base reserve × entries). */
  minimumXlm: number;
  /** Every non-XLM balance (USDC, security tokens…). */
  assets: { code: string; issuer: string; balance: number }[];
}

/** Reads a custodial wallet's balances; throws if the network can't be read. */
export interface ICustodialFunds {
  balances(publicKey: string): Promise<CustodialBalances>;
}

/** Google sign-ins have no password or wallet: closing needs a session from the last 10 minutes. */
const RECENT_SESSION_MS = 10 * 60_000;

/**
 * The owner's rights over their data (Ley 25.326): a copy of everything the
 * platform keeps about them, and closing the account.
 */
export class AccountPrivacyService {
  constructor(
    private readonly repo: IAccountRepository,
    private readonly kyc: IKycRecordRepository,
    private readonly selfies: ISelfieStorage,
    private readonly audit: AuditTrail,
    private readonly support: SupportService,
    private readonly store: IDocumentStore,
    private readonly funds: ICustodialFunds,
    private readonly walletSignatures: IWalletSignatureVerifier,
    private readonly hasher: IPasswordHasher,
    private readonly mailer: IMailer,
    private readonly clock: IClock,
    private readonly logger: ILogger,
  ) {}

  /** Everything kept about the account, without secrets, hashes or keys. */
  export(account: Account): Record<string, unknown> {
    const record = (account.kycId && this.kyc.findById(account.kycId)) || this.kyc.findByUserId(account.id);
    const builds = this.store
      .read<TxBuildRecord[]>(TX_BUILDS_KEY, [])
      .filter((b) => b.accountId === account.id)
      .map(({ id, action, listingId, contractId, function: fn, hash, createdAt, status, ledger }) => ({
        id,
        action,
        listingId,
        contractId,
        function: fn,
        hash,
        createdAt,
        status,
        ledger,
      }));
    return {
      exportedAt: this.clock.isoNow(),
      notice:
        'Copia de los datos personales que Fractachain guarda sobre tu cuenta (Ley 25.326, art. 14). ' +
        'Las transacciones en Stellar son públicas y no dependen de la plataforma.',
      profile: {
        id: account.id,
        email: isWalletEmail(account.email) ? null : account.email,
        emailVerified: isEmailVerified(account),
        name: account.name,
        legalName: account.legalName ?? null,
        cuit: account.cuit ?? null,
        signInMethod: account.authProvider ?? null,
        twoFactorEnabled: hasTwoFactor(account),
        custodyMode: account.custodyMode,
        walletAddress: account.publicKey || null,
        kycStatus: account.kycStatus,
        createdAt: account.createdAt,
        lastLoginAt: account.lastLoginAt,
      },
      terms: {
        acceptedVersion: account.termsVersion ?? null,
        acceptedAt: account.termsAcceptedAt ?? null,
        currentVersion: TermsPolicy.current,
      },
      kyc: record
        ? {
            id: record.id,
            fullName: record.fullName,
            documentNumber: record.documentNumber,
            taxId: record.taxId ?? null,
            country: record.countryName,
            investorType: record.investorType,
            walletAddress: record.stellarAddress || null,
            status: record.status,
            createdAt: record.createdAt,
            reviewedAt: record.reviewedAt ?? null,
            rejectionReason: record.rejectionReason ?? null,
            selfieOnFile: Boolean(account.selfiePath),
            verification: record.verification
              ? {
                  provider: record.verification.provider,
                  status: record.verification.status,
                  identity: record.verification.identity ?? null,
                  checks: record.verification.checks ?? null,
                  updatedAt: record.verification.updatedAt,
                }
              : null,
          }
        : null,
      holdings: account.holdings ?? [],
      trustlines: account.trustlines ?? [],
      transactions: builds,
      activity: this.audit
        .byActor(account.id, 500)
        .map(({ at, action, target, outcome, ip }) => ({ at, action, target, outcome, ip: ip ?? null })),
      supportMessages: this.support
        .byAccount(account.id)
        .map(({ id, topic, message, status, createdAt }) => ({ id, topic, message, status, createdAt })),
    };
  }

  /**
   * Closes the account at the owner's request, after re-proving control
   * (password, wallet signature or a fresh Google session). Refused while the
   * platform still holds something of theirs.
   */
  async close(
    accountId: string,
    input: AccountCloseRequest,
    sessionIssuedAt: number | undefined,
  ): Promise<{ closedAt: string }> {
    if (input.confirm !== 'CERRAR') throw new ValidationError('Escribí CERRAR para confirmar');
    const account = this.repo.findById(accountId);
    if (!account || isClosed(account)) throw new UnauthenticatedError('Iniciá sesión');

    await this.assertOwnerProof(account, input, sessionIssuedAt);
    await this.assertNothingHeld(account);

    const now = this.clock.isoNow();
    const oldEmail = isWalletEmail(account.email) ? null : account.email;
    const record = (account.kycId && this.kyc.findById(account.kycId)) || this.kyc.findByUserId(account.id);
    if (record) {
      // AML record-keeping (Ley 25.246 y resoluciones de la UIF): the identity a
      // KYC decision was made on is kept for the legal retention period, closed
      // and without the selfie or resumable verification links.
      record.closedAt = now;
      record.selfieUrl = '';
      if (record.verification) record.verification = { ...record.verification, url: '' };
      this.kyc.upsert(record);
    }
    this.selfies.remove(account.selfiePath);

    account.closedAt = now;
    account.sessionsRevokedAt = this.clock.now();
    // Minimized: nothing left that identifies the person or opens the account.
    account.email = `closed-${account.id}@closed.invalid`;
    account.name = 'Cuenta cerrada';
    account.avatar = '';
    delete account.legalName;
    delete account.cuit;
    delete account.selfiePath;
    delete account.passwordHash;
    delete account.twoFactor;
    delete account.secretKey;
    delete account.recoveryHint;
    account.publicKey = '';
    account.custodyMode = null;
    account.trustlines = [];
    account.holdings = [];
    this.repo.save(account);
    this.logger.info('cuenta cerrada por su titular', { accountId: account.id });

    if (oldEmail) {
      void this.mailer
        .send({
          to: oldEmail,
          subject: 'Cerraste tu cuenta de Fractachain',
          text:
            'Cerramos tu cuenta a tu pedido. Ya no se puede ingresar con ella y borramos tus datos de perfil.\n\n' +
            'Por obligaciones de prevención de lavado de activos conservamos solo los datos mínimos de la ' +
            'verificación de identidad durante el plazo legal. Las transacciones en Stellar son públicas y no ' +
            'pueden borrarse.\n\nSi no fuiste vos, escribinos desde la página de contacto.',
        })
        .catch((err) => this.logger.warn('no se pudo enviar el aviso de cierre', { err: String(err) }));
    }
    return { closedAt: now };
  }

  private async assertOwnerProof(
    account: Account,
    input: AccountCloseRequest,
    sessionIssuedAt: number | undefined,
  ): Promise<void> {
    if (account.passwordHash) {
      const check = await this.hasher.verify(String(input.password || ''), account.passwordHash);
      // 403, not 401: the owner is signed in, and a 401 would sign them out.
      if (!check.valid) throw new ForbiddenError('La contraseña no es correcta', 'WRONG_PASSWORD');
      return;
    }
    if (account.authProvider === 'wallet' || (account.custodyMode === 'SELF' && account.publicKey)) {
      const sig = input.signature;
      if (!sig) throw new ValidationError('Firmá el cierre con tu wallet');
      if (sig.publicKey !== account.publicKey) {
        throw new ForbiddenError('La firma no es de la wallet de esta cuenta');
      }
      const reason = this.walletSignatures.verify('close', sig.publicKey, sig.message, sig.signature);
      if (reason) throw new ForbiddenError(reason);
      return;
    }
    // Google (or any account without password or wallet): a fresh session.
    if (!sessionIssuedAt || this.clock.now() - sessionIssuedAt > RECENT_SESSION_MS) {
      throw new ForbiddenError('Por seguridad, volvé a ingresar y cerrá la cuenta dentro de los 10 minutos.');
    }
  }

  private async assertNothingHeld(account: Account): Promise<void> {
    const positions = (account.holdings ?? []).filter(
      (h) => (h.tokens ?? 0) > 0 || (h.tokensOwed ?? 0) > 0 || ((h.usdcAmount ?? 0) > 0 && !h.refundedAt),
    );
    if (positions.length) {
      const names = positions.map((h) => h.tokenTicker || h.listingId).join(', ');
      throw new ConflictError(
        `Tenés posiciones en licitaciones (${names}). Esperá el cierre y recibí tus tokens o pedí el ` +
          'reembolso antes de cerrar la cuenta.',
      );
    }
    if (account.custodyMode !== 'CUSTODIAL' || !account.publicKey) return;
    const balances = await this.funds.balances(account.publicKey);
    const assets = balances.assets.filter((a) => a.balance > 0);
    if (assets.length || balances.xlm > balances.minimumXlm + 1) {
      const held = [
        ...assets.map((a) => `${a.balance} ${a.code}`),
        ...(balances.xlm > balances.minimumXlm + 1 ? [`${balances.xlm} XLM`] : []),
      ].join(', ');
      throw new ConflictError(
        `Tu wallet custodial todavía tiene fondos (${held}). Transferilos a otra wallet o exportá tu clave ` +
          'desde Cuenta → Wallet antes de cerrar la cuenta.',
      );
    }
  }
}
