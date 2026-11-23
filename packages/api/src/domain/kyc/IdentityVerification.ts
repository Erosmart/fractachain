/**
 * Identity verification by an external provider (Didit): the investor is
 * sent to the provider's hosted flow (document + liveness + face match +
 * AML); the provider's decision drives the platform KYC status.
 */
export type ProviderSessionStatus =
  | 'Not Started'
  | 'In Progress'
  | 'In Review'
  | 'Approved'
  | 'Declined'
  | 'Resubmitted'
  | 'Awaiting User'
  | 'Abandoned'
  | 'Expired'
  | 'Kyc Expired';

/** What the platform keeps from a provider decision — minimal personal data. */
export interface VerifiedIdentity {
  fullName?: string;
  documentType?: string;
  /** Last 4 characters only: the provider keeps the document, we don't. */
  documentNumberLast4?: string;
  nationality?: string;
  issuingState?: string;
}

export interface ProviderChecks {
  document?: string;
  liveness?: string;
  faceMatch?: string;
  aml?: string;
  amlHits?: number;
}

export interface ProviderDecision {
  sessionId: string;
  status: ProviderSessionStatus;
  /** Our account id, echoed back by the provider. */
  vendorData?: string;
  identity: VerifiedIdentity;
  checks: ProviderChecks;
}

export interface ProviderSession {
  sessionId: string;
  url: string;
  status: ProviderSessionStatus;
}

export interface StartVerificationInput {
  accountId: string;
  email?: string;
  callbackUrl: string;
  language: 'es' | 'en';
}

export interface IIdentityVerificationProvider {
  readonly name: 'didit';
  startSession(input: StartVerificationInput): Promise<ProviderSession>;
  fetchDecision(sessionId: string): Promise<ProviderDecision>;
}

/** Authenticates a provider webhook delivery (signature + freshness). */
export interface IWebhookAuthenticator {
  readonly configured: boolean;
  verify(
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer | undefined,
    body: unknown,
  ): boolean;
}

/** Platform KYC status a provider status leads to. */
export function kycStatusFor(status: ProviderSessionStatus): 'APPROVED' | 'REJECTED' | 'PENDING' | 'REVOKED' {
  switch (status) {
    case 'Approved':
      return 'APPROVED';
    case 'Declined':
      return 'REJECTED';
    case 'Kyc Expired':
      return 'REVOKED';
    default:
      // Not Started, In Progress, In Review, Resubmitted, Awaiting User,
      // Abandoned, Expired: still pending — the investor can resume or restart.
      return 'PENDING';
  }
}

/** The investor can (re)start a hosted session in these states. */
export function canRestart(status: ProviderSessionStatus | undefined): boolean {
  return (
    !status ||
    status === 'Abandoned' ||
    status === 'Expired' ||
    status === 'Kyc Expired' ||
    status === 'Declined'
  );
}
