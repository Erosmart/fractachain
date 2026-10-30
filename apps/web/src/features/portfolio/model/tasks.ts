import type { Portfolio, Position } from '@/core/api/types';
import type { SessionUser } from '@/core/auth/SessionUser';

export type TaskAction = 'fundUsdc' | 'approve' | 'claim' | 'distribute' | 'refund' | 'dividend';

export type TaskKind =
  'email' | 'wallet' | 'kyc' | 'usdc' | 'twoFa' | 'trustline' | 'claim' | 'receive' | 'refund' | 'dividend';

export interface Task {
  id: string;
  kind: TaskKind;
  done: boolean;
  /** Where the task is completed (account pages). */
  href?: string;
  /** Or the in-place action that completes it. */
  action?: TaskAction;
  listingId?: string;
  ticker?: string;
  amount?: number;
}

type UserView = Pick<
  SessionUser,
  | 'authProvider'
  | 'emailVerified'
  | 'publicKey'
  | 'custodyMode'
  | 'kycStatus'
  | 'twoFactorEnabled'
  | 'trustlines'
>;

/**
 * The investor's to-do list, from the session and the portfolio: account
 * setup (done items stay, checked, like the reference's check-ins) plus every
 * pending action on a position. Pending first, position actions before setup.
 */
export function tasksFor(user: UserView | null, book: Portfolio | null, positions: Position[]): Task[] {
  if (!user) return [];
  const actions: Task[] = [];
  const setup: Task[] = [];
  const approved = new Set(user.trustlines || []);

  for (const p of positions) {
    const base = { listingId: p.listingId, ticker: p.tokenTicker, done: false };
    if (p.canRefund) {
      actions.push({ ...base, id: `refund-${p.listingId}`, kind: 'refund', action: 'refund' });
      continue;
    }
    if (!approved.has(p.listingId) && !p.refundedAt && p.listingStatus !== 'CLOSED_FAILED') {
      actions.push({ ...base, id: `trust-${p.listingId}`, kind: 'trustline', action: 'approve' });
      continue;
    }
    if ((p.canClaim ?? p.tokensOwed > 0) && p.listingStatus !== 'CLOSED_FAILED' && !p.refundedAt) {
      actions.push({
        ...base,
        id: `claim-${p.listingId}`,
        kind: 'claim',
        action: 'claim',
        amount: p.tokensOwed,
      });
    }
    if (p.sdex && p.tokens > 0 && (p.tokensOnChain || 0) + 1e-9 < p.tokens) {
      actions.push({ ...base, id: `dist-${p.listingId}`, kind: 'receive', action: 'distribute' });
    }
    if (p.pendingDividendUsdc > 0) {
      actions.push({
        ...base,
        id: `div-${p.listingId}`,
        kind: 'dividend',
        action: 'dividend',
        amount: p.pendingDividendUsdc,
      });
    }
  }

  if (user.authProvider === 'email') {
    setup.push({ id: 'email', kind: 'email', done: Boolean(user.emailVerified), href: '/account' });
  }
  setup.push({
    id: 'wallet',
    kind: 'wallet',
    done: Boolean(user.publicKey),
    href: user.publicKey ? '/wallet' : '/onboarding/wallet',
  });
  setup.push({
    id: 'kyc',
    kind: 'kyc',
    done: user.kycStatus === 'APPROVED',
    href: user.kycStatus === 'PENDING' ? '/onboarding/pending' : '/onboarding/kyc',
  });
  if (user.publicKey && book) {
    const usdc = book.usdcOnChain ?? 0;
    setup.push({
      id: 'usdc',
      kind: 'usdc',
      done: usdc > 0,
      action: usdc > 0 ? undefined : 'fundUsdc',
      amount: usdc,
    });
  }
  setup.push({ id: 'twoFa', kind: 'twoFa', done: Boolean(user.twoFactorEnabled), href: '/account/security' });

  return [...actions, ...setup.filter((t) => !t.done), ...setup.filter((t) => t.done)];
}

export const pendingCount = (tasks: Task[]) => tasks.filter((t) => !t.done).length;
