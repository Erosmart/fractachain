import type { Account } from '../../domain/account/Account';
import {
  canRestart,
  kycStatusFor,
  type IIdentityVerificationProvider,
  type IWebhookAuthenticator,
  type ProviderDecision,
  type ProviderSessionStatus,
} from '../../domain/kyc/IdentityVerification';
import type { IKycRecordRepository, KycRecord } from '../../domain/kyc/KycRecord';
import type { IClock } from '../../shared/clock';
import {
  AppError,
  ConflictError,
  DomainError,
  NotFoundError,
  UnauthenticatedError,
} from '../../shared/errors';
import type { ILogger } from '../../shared/logger';
import type { AccountService } from '../account/AccountService';
import type { KycService } from './KycService';

export interface VerificationView {
  provider: 'didit' | 'manual';
  kycStatus: Account['kycStatus'];
  /** Present once a hosted session was started. */
  session?: {
    status: ProviderSessionStatus;
    /** Only while the session can still be completed. */
    resumeUrl?: string;
    canRestart: boolean;
    updatedAt: string;
  };
  /** What the provider extracted from the document, once approved. */
  identity?: { fullName?: string; documentType?: string; issuingState?: string };
  /** Why the account was rejected or revoked (provider or compliance), shown to the owner. */
  reason?: string;
}

/** Sessions the investor can keep going in (same link). */
const RESUMABLE: ReadonlySet<ProviderSessionStatus> = new Set([
  'Not Started',
  'In Progress',
  'Awaiting User',
  'Resubmitted',
]);

const DEDUPE_WINDOW = 2_000;

/**
 * Identity verification through a hosted provider (Didit): document,
 * liveness, face match and AML screening happen on the provider; this
 * service starts sessions and turns provider decisions into KYC outcomes.
 *
 * The provider is the only source of truth for a decision: the browser
 * callback just triggers a re-fetch (its query string is never trusted), and
 * webhooks are authenticated, de-duplicated and then re-fetched too, so a
 * replayed or out-of-order delivery cannot move an account backwards.
 */
export class IdentityVerificationService {
  private readonly seenEvents = new Set<string>();

  constructor(
    private readonly provider: IIdentityVerificationProvider | undefined,
    private readonly webhooks: IWebhookAuthenticator | undefined,
    private readonly kyc: KycService,
    private readonly accounts: AccountService,
    private readonly records: IKycRecordRepository,
    private readonly clock: IClock,
    private readonly options: { callbackUrl: string },
    private readonly logger: ILogger,
  ) {}

  get providerName(): 'didit' | 'manual' {
    return this.provider ? this.provider.name : 'manual';
  }

  view(accountId: string): VerificationView {
    const account = this.accounts.require(accountId);
    const record = this.recordOf(account);
    const v = record?.verification;
    const refused = account.kycStatus === 'REJECTED' || account.kycStatus === 'REVOKED';
    return {
      provider: this.providerName,
      kycStatus: account.kycStatus,
      session: v && {
        status: v.status,
        resumeUrl: RESUMABLE.has(v.status) ? v.url : undefined,
        canRestart: account.kycStatus !== 'APPROVED' && canRestart(v.status),
        updatedAt: v.updatedAt,
      },
      identity:
        v?.identity && account.kycStatus === 'APPROVED'
          ? {
              fullName: v.identity.fullName,
              documentType: v.identity.documentType,
              issuingState: v.identity.issuingState,
            }
          : undefined,
      reason: refused ? record?.rejectionReason : undefined,
    };
  }

  /**
   * Starts (or resumes) the hosted verification for an account that already
   * submitted the onboarding form. Returns the provider URL to redirect to.
   */
  async start(accountId: string, language: 'es' | 'en' = 'es'): Promise<{ url: string; sessionId: string }> {
    const provider = this.requireProvider();
    const account = this.accounts.require(accountId);
    const record = this.recordOf(account);
    if (!record) throw new DomainError('Completá primero tus datos de inversor');
    if (account.kycStatus === 'APPROVED') throw new ConflictError('Tu identidad ya está verificada');
    if (account.kycStatus === 'REVOKED') throw new DomainError('Tu KYC fue revocado: contactá a compliance');

    const current = record.verification;
    if (current && RESUMABLE.has(current.status)) return { url: current.url, sessionId: current.sessionId };
    if (current?.status === 'In Review') throw new ConflictError('Tu verificación está en revisión manual');

    const session = await provider.startSession({
      accountId: account.id,
      email: account.authProvider === 'wallet' && !account.email ? undefined : account.email,
      callbackUrl: this.options.callbackUrl,
      language,
    });
    const now = this.clock.isoNow();
    record.verification = {
      provider: provider.name,
      sessionId: session.sessionId,
      url: session.url,
      status: session.status,
      startedAt: now,
      updatedAt: now,
    };
    this.records.upsert(record);
    if (account.kycStatus === 'REJECTED' || account.kycStatus === 'UNREGISTERED')
      this.kyc.settle(record.id, 'PENDING');
    this.logger.info('sesión de verificación creada', {
      accountId: account.id,
      sessionId: session.sessionId,
    });
    return { url: session.url, sessionId: session.sessionId };
  }

  /** Re-reads the account's current session from the provider (after the browser callback). */
  async sync(accountId: string): Promise<VerificationView> {
    const provider = this.requireProvider();
    const account = this.accounts.require(accountId);
    const record = this.recordOf(account);
    const sessionId = record?.verification?.sessionId;
    if (!record || !sessionId) throw new NotFoundError('No hay una verificación iniciada');
    this.apply(record, await provider.fetchDecision(sessionId));
    return this.view(accountId);
  }

  /**
   * Provider webhook. Unknown or stale sessions are acknowledged and ignored
   * (a non-2xx makes the provider retry for nothing).
   */
  async handleWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer | undefined,
    body: unknown,
  ): Promise<{ applied: boolean }> {
    const provider = this.requireProvider();
    if (!this.webhooks?.configured)
      throw new AppError('Webhook de verificación sin secreto configurado', 503, 'NOT_CONFIGURED');
    if (!this.webhooks.verify(headers, rawBody, body))
      throw new UnauthenticatedError('Firma de webhook inválida');

    const payload = (body ?? {}) as { event_id?: unknown; session_id?: unknown; vendor_data?: unknown };
    const eventId = typeof payload.event_id === 'string' ? payload.event_id : undefined;
    if (eventId && this.seenEvents.has(eventId)) return { applied: false };
    const sessionId = typeof payload.session_id === 'string' ? payload.session_id : '';
    const record = sessionId ? this.records.findBySessionId(sessionId) : undefined;
    if (!record || (typeof payload.vendor_data === 'string' && payload.vendor_data !== record.userId)) {
      this.logger.warn('webhook de verificación para una sesión desconocida', { sessionId });
      return { applied: false };
    }
    // The signed payload already carries the decision, but deliveries can
    // arrive out of order: the provider's current state is authoritative.
    this.apply(record, await provider.fetchDecision(sessionId));
    if (eventId) this.remember(eventId);
    return { applied: true };
  }

  private apply(record: KycRecord, decision: ProviderDecision): void {
    const v = record.verification;
    if (!v || decision.sessionId !== v.sessionId) return; // superseded session
    if (decision.vendorData && decision.vendorData !== record.userId) {
      this.logger.warn('decisión de verificación de otra cuenta', { sessionId: v.sessionId });
      return;
    }
    v.status = decision.status;
    v.checks = decision.checks;
    if (decision.status === 'Approved') v.identity = decision.identity;
    v.updatedAt = this.clock.isoNow();
    if (decision.status === 'Approved' && decision.identity.fullName)
      record.fullName = decision.identity.fullName;
    this.records.upsert(record);

    const account = record.userId ? this.accounts.get(record.userId) : undefined;
    if (!account) return;
    const target = kycStatusFor(decision.status);
    const current = account.kycStatus;
    if (target === current) return;
    if (target === 'APPROVED') {
      if (decision.identity.fullName) {
        account.legalName = decision.identity.fullName;
        account.name = decision.identity.fullName;
      }
      this.kyc.settle(record.id, 'APPROVED');
    } else if (target === 'REJECTED' || target === 'REVOKED') {
      // A decision that lands on an already approved investor freezes them on-chain too.
      const outcome = current === 'APPROVED' || target === 'REVOKED' ? 'REVOKED' : 'REJECTED';
      this.kyc.settle(
        record.id,
        outcome,
        decision.status === 'Kyc Expired'
          ? 'Tu verificación de identidad venció: hacé una nueva.'
          : 'Didit no pudo verificar tu identidad.',
      );
    } else if (current === 'REJECTED' || current === 'UNREGISTERED') {
      // In-flight states never downgrade an approved investor.
      this.kyc.settle(record.id, 'PENDING');
    }
    this.logger.info('decisión de verificación aplicada', {
      accountId: account.id,
      sessionId: v.sessionId,
      status: decision.status,
    });
  }

  private recordOf(account: Account): KycRecord | undefined {
    return (account.kycId && this.records.findById(account.kycId)) || this.records.findByUserId(account.id);
  }

  private requireProvider(): IIdentityVerificationProvider {
    if (!this.provider)
      throw new AppError('La verificación de identidad externa no está configurada', 404, 'NOT_CONFIGURED');
    return this.provider;
  }

  private remember(eventId: string): void {
    this.seenEvents.add(eventId);
    if (this.seenEvents.size > DEDUPE_WINDOW) {
      const oldest = this.seenEvents.values().next().value;
      if (oldest !== undefined) this.seenEvents.delete(oldest);
    }
  }
}
