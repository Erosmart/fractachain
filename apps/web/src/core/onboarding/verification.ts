import type { KycProvider, KycStatus, VerificationView } from '@fractachain/shared';

/**
 * Where an investor stands in identity verification, as the UI tells it
 * (docs/design/benchmark.md §2e). Derived only from what the API reports —
 * never from the provider's redirect query string.
 */
export type VerificationStage =
  /** Hasn't sent name + CUIT yet. */
  | 'needs_data'
  /** Data sent, hosted verification not started (or start failed). */
  | 'not_started'
  | 'in_progress'
  /** Provider (or compliance) reviewing by hand. */
  | 'in_review'
  /** The provider asked for a new photo or more information. */
  | 'needs_changes'
  | 'approved'
  | 'rejected'
  /** Session abandoned or expired, or the KYC itself expired. */
  | 'expired'
  | 'revoked'
  /** Manual flow: data + selfie waiting for compliance. */
  | 'manual_review';

/** What the status card offers. `verify` starts/resumes/restarts the hosted flow. */
export type VerificationAction = 'form' | 'verify' | 'invest' | 'none';

export type StageTone = 'neutral' | 'sky' | 'good' | 'warn' | 'bad' | 'peach';

export interface StagePresentation {
  stage: VerificationStage;
  tone: StageTone;
  action: VerificationAction;
  /** Keep re-reading the decision (someone else is about to change it). */
  poll: boolean;
  /** i18n keys under `onboard.stage.<stage>` */
  copy: { chip: string; title: string; body: string; cta?: string };
}

const TONES: Record<VerificationStage, StageTone> = {
  needs_data: 'neutral',
  not_started: 'neutral',
  in_progress: 'sky',
  in_review: 'warn',
  needs_changes: 'peach',
  approved: 'good',
  rejected: 'bad',
  expired: 'neutral',
  revoked: 'bad',
  manual_review: 'warn',
};

export interface StageInput {
  provider: KycProvider;
  kycStatus: KycStatus;
  session?: VerificationView['session'];
}

export function verificationStage({ provider, kycStatus, session }: StageInput): VerificationStage {
  if (kycStatus === 'APPROVED') return 'approved';
  if (kycStatus === 'REVOKED') return 'revoked';
  if (kycStatus === 'UNREGISTERED') return 'needs_data';
  if (provider === 'manual' || !session) {
    if (kycStatus === 'REJECTED') return 'rejected';
    return provider === 'manual' ? 'manual_review' : 'not_started';
  }
  switch (session.status) {
    case 'Not Started':
      return 'not_started';
    case 'In Progress':
      return 'in_progress';
    case 'In Review':
      return 'in_review';
    case 'Resubmitted':
    case 'Awaiting User':
      return 'needs_changes';
    case 'Approved':
      // The API applies approvals on sync; until the account says so, it's still being processed.
      return 'in_review';
    case 'Declined':
      return 'rejected';
    case 'Abandoned':
    case 'Expired':
    case 'Kyc Expired':
      return 'expired';
    default:
      return kycStatus === 'REJECTED' ? 'rejected' : 'in_progress';
  }
}

export function presentStage(input: StageInput): StagePresentation {
  const stage = verificationStage(input);
  const canRestart = input.session?.canRestart ?? false;
  let action: VerificationAction;
  switch (stage) {
    case 'needs_data':
      action = 'form';
      break;
    case 'not_started':
    case 'in_progress':
    case 'needs_changes':
    case 'expired':
      action = 'verify';
      break;
    case 'rejected':
      // Manual flow: correct the data and send again. Didit: a new session when allowed.
      action = input.provider === 'manual' ? 'form' : canRestart ? 'verify' : 'none';
      break;
    case 'approved':
      action = 'invest';
      break;
    default:
      action = 'none';
  }
  const base = `onboard.stage.${stage}`;
  return {
    stage,
    tone: TONES[stage],
    action,
    poll: stage === 'in_progress' || stage === 'in_review' || stage === 'manual_review',
    copy: {
      chip: `${base}.chip`,
      title: `${base}.title`,
      body: `${base}.body`,
      cta: action === 'none' ? undefined : `${base}.cta`,
    },
  };
}

/** Index of the current step in the onboarding stepper (0 = Cuenta … 4 = Revisión). */
export function stepperIndex(opts: { custodyMode: string | null; stage: VerificationStage }): number {
  if (!opts.custodyMode) return 1;
  switch (opts.stage) {
    case 'needs_data':
      return 2;
    case 'not_started':
    case 'in_progress':
    case 'needs_changes':
    case 'expired':
      return 3;
    case 'approved':
      return 5;
    default:
      return 4;
  }
}

const DIDIT_HOST = /(^|\.)didit\.me$/i;

/**
 * Only Didit's hosted flow is an acceptable redirect target: an https URL on
 * didit.me (or a subdomain). Anything else is refused, so a tampered API
 * response can't bounce the investor to a look-alike page.
 */
export function isTrustedVerificationUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && DIDIT_HOST.test(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** Backoff for re-reading the decision while it is pending: 3 s, 6 s, 12 s… capped at 30 s. */
export function pollDelay(attempt: number): number {
  return Math.min(30_000, 3_000 * 2 ** Math.max(0, attempt));
}
