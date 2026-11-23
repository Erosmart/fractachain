import type { SessionUser } from '@/core/auth/SessionUser';
import type { ChainHolding, ChainWallet } from './chain';

export type TaskAction = 'fundUsdc' | 'enableUsdc' | 'approve' | 'claim' | 'distribute' | 'refund';

export type TaskKind =
  'email' | 'wallet' | 'kyc' | 'usdc' | 'twoFa' | 'trustline' | 'claim' | 'receive' | 'refund';

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
  /** Payment asset code for the copy ("USDC"). */
  code?: string;
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
 * The investor's to-do list, from the session and what the chain says:
 * account setup (done items stay, checked) plus every pending action on a
 * holding. Pending first, holding actions before setup.
 */
export function tasksFor(
  user: UserView | null,
  wallet: ChainWallet | null,
  holdings: ChainHolding[],
): Task[] {
  if (!user) return [];
  const actions: Task[] = [];
  const setup: Task[] = [];
  const approved = new Set(user.trustlines || []);

  for (const h of holdings) {
    const base = { listingId: h.listingId, ticker: h.ticker, done: false };
    if (h.stateName === 'Failed' && h.units > 0) {
      actions.push({ ...base, id: `refund-${h.listingId}`, kind: 'refund', action: 'refund', code: h.code });
      continue;
    }
    if (h.stateName === 'Open') continue;
    if (h.sdex && !approved.has(h.listingId)) {
      actions.push({ ...base, id: `trust-${h.listingId}`, kind: 'trustline', action: 'approve' });
      continue;
    }
    if (h.tokensOwed > 0) {
      actions.push({
        ...base,
        id: `claim-${h.listingId}`,
        kind: 'claim',
        action: 'claim',
        amount: h.tokensOwed,
      });
    }
    if (h.sdex && h.tokens > 0 && h.tokensOnChain + 1e-9 < h.tokens) {
      actions.push({ ...base, id: `dist-${h.listingId}`, kind: 'receive', action: 'distribute' });
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
  if (user.publicKey && wallet?.usdc) {
    const { balance, trustline, asset } = wallet.usdc;
    const funded = trustline && balance > 0;
    setup.push({
      id: 'usdc',
      kind: 'usdc',
      done: funded,
      action: funded ? undefined : !trustline && user.custodyMode === 'SELF' ? 'enableUsdc' : 'fundUsdc',
      amount: balance,
      code: asset.code,
    });
  }
  setup.push({ id: 'twoFa', kind: 'twoFa', done: Boolean(user.twoFactorEnabled), href: '/account/security' });

  return [...actions, ...setup.filter((t) => !t.done), ...setup.filter((t) => t.done)];
}

export const pendingCount = (tasks: Task[]) => tasks.filter((t) => !t.done).length;
