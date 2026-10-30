import type { ProviderChecks, ProviderSessionStatus, VerifiedIdentity } from './IdentityVerification';

export type InvestorType = 'National' | 'Foreign' | 'Qualified' | 'Institutional';

/** Review state of a KYC file, as the compliance desk sees it. */
export type KycReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED';

/**
 * A KYC file submitted for review. Persisted (v1 kept these in a process
 * array, so a restart lost the review queue and approvals silently skipped
 * the on-chain authorization).
 */
export interface KycRecord {
  id: string;
  userId?: string;
  fullName: string;
  documentNumber: string;
  /** CUIL / CUIT or foreign tax id. */
  taxId?: string;
  /** ISO 3166-1 numeric. */
  countryCode: number;
  countryName: string;
  address: string;
  investorType: InvestorType;
  stellarAddress: string;
  documentFrontUrl: string;
  documentBackUrl?: string;
  selfieUrl: string;
  status: KycReviewStatus;
  rejectionReason?: string;
  createdAt: string;
  reviewedAt?: string;
  expiresAt?: string;
  /** Hosted identity verification (Didit), when a provider is configured. */
  verification?: KycVerification;
  /** The owner closed the account: only the legally required minimum is kept. */
  closedAt?: string;
}

export interface KycVerification {
  provider: 'didit';
  sessionId: string;
  /** Hosted flow link: lets the owner resume an unfinished session. Never shown to admins. */
  url: string;
  status: ProviderSessionStatus;
  identity?: VerifiedIdentity;
  checks?: ProviderChecks;
  startedAt: string;
  updatedAt: string;
}

export interface IKycRecordRepository {
  findById(id: string): KycRecord | undefined;
  findByUserId(userId: string): KycRecord | undefined;
  findBySessionId(sessionId: string): KycRecord | undefined;
  list(): KycRecord[];
  upsert(record: KycRecord): void;
}

/** FATF high-risk jurisdictions: registration is refused outright. */
export class GafiPolicy {
  static readonly BLACKLIST: readonly { code: number; name: string }[] = [
    { code: 364, name: 'Irán' },
    { code: 408, name: 'Corea del Norte' },
    { code: 104, name: 'Myanmar' },
  ];

  static isBlacklisted(countryCode: number): boolean {
    return GafiPolicy.BLACKLIST.some((c) => c.code === countryCode);
  }
}

/**
 * Argentine banking hours (Mon–Fri 08:00–16:00 ART). When enforced, KYC
 * approvals outside that window are refused to limit the blast radius of a
 * compromised admin key.
 */
export function isArgentinaBusinessHours(date: Date = new Date()): boolean {
  const art = new Date(date.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
  const day = art.getDay();
  const hour = art.getHours();
  return day >= 1 && day <= 5 && hour >= 8 && hour < 16;
}
