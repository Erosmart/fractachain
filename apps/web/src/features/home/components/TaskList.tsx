import { useState, type ReactNode } from 'react';
import {
  ArrowDownToLine,
  BadgeCheck,
  DollarSign,
  Download,
  Link2,
  Mail,
  ShieldCheck,
  Undo2,
  Wallet,
} from 'lucide-react';
import { ChecklistItem } from '@/components/ui/kit';
import type { SessionUser } from '@/core/auth/SessionUser';
import { useI18n } from '@/hooks/useI18n';
import { amount, money } from '@/features/portfolio/model/format';
import type { Task, TaskAction, TaskKind } from '@/features/portfolio/model/tasks';

const ICONS: Record<TaskKind, typeof Mail> = {
  email: Mail,
  wallet: Wallet,
  kyc: BadgeCheck,
  usdc: DollarSign,
  twoFa: ShieldCheck,
  trustline: Link2,
  claim: Download,
  receive: ArrowDownToLine,
  refund: Undo2,
};

function copyFor(
  task: Task,
  user: SessionUser,
  t: (k: string, v?: Record<string, string | number>) => string,
) {
  const v = { ticker: task.ticker ?? '', n: task.amount !== undefined ? amount(task.amount) : '' };
  switch (task.kind) {
    case 'email':
      return task.done
        ? { title: t('dashboard.tasks.emailDone'), sub: user.email }
        : { title: t('dashboard.tasks.email'), sub: t('dashboard.tasks.emailSub') };
    case 'wallet':
      return {
        title: t(task.done ? 'dashboard.tasks.walletDone' : 'dashboard.tasks.wallet'),
        sub:
          user.custodyMode === 'SELF'
            ? t('dashboard.tasks.walletSelf')
            : user.custodyMode
              ? t('dashboard.tasks.walletCustodial')
              : undefined,
      };
    case 'kyc':
      return task.done
        ? { title: t('dashboard.tasks.kycDone'), sub: t('dashboard.tasks.kycDoneSub') }
        : {
            title: t('dashboard.tasks.kyc'),
            sub: user.kycStatus === 'PENDING' ? t('dashboard.tasks.kycPending') : undefined,
          };
    case 'usdc':
      return task.done
        ? {
            title: t('dashboard.tasks.usdcDone'),
            sub: t('dashboard.tasks.usdcSub', { n: money(task.amount ?? 0) }),
          }
        : {
            title: t('dashboard.tasks.usdc'),
            sub:
              task.action === 'enableUsdc'
                ? t('dashboard.tasks.usdcTrustSub', { code: task.code ?? 'USDC' })
                : t('dashboard.tasks.usdcPoolSub'),
          };
    case 'twoFa':
      return {
        title: t(task.done ? 'dashboard.tasks.twoFaDone' : 'dashboard.tasks.twoFa'),
        sub: task.done ? undefined : t('dashboard.tasks.twoFaSub'),
      };
    case 'trustline':
      return { title: t('dashboard.tasks.trustline', v), sub: t('dashboard.tasks.trustlineSub') };
    case 'claim':
      return { title: t('dashboard.tasks.claim', v), sub: t('dashboard.tasks.claimSub', v) };
    case 'receive':
      return { title: t('dashboard.tasks.receive', v), sub: t('dashboard.tasks.receiveSub') };
    case 'refund':
      return { title: t('dashboard.tasks.refund', v), sub: t('dashboard.tasks.refundSub') };
  }
}

const ACTION_LABEL: Record<TaskAction, string> = {
  fundUsdc: 'dashboard.tasks.usdcAction',
  enableUsdc: 'dashboard.tasks.usdcEnableAction',
  approve: 'dashboard.tasks.trustlineAction',
  claim: 'dashboard.tasks.claimAction',
  distribute: 'dashboard.tasks.receiveAction',
  refund: 'dashboard.tasks.refundAction',
};

/**
 * Pendientes as check-in rows (the reference's "Daily check-in ✓"): open
 * items first, each with its action or a link; done ones keep the navy check.
 */
export function TaskList({
  tasks,
  user,
  perform,
  isBusy,
  initial = 3,
}: {
  tasks: Task[];
  user: SessionUser;
  perform: (action: TaskAction, listingId?: string) => void;
  isBusy: (action: TaskAction, listingId?: string) => boolean;
  initial?: number;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? tasks : tasks.slice(0, initial);
  if (!tasks.length) return null;

  return (
    <section aria-labelledby="tasks-title" id="pendientes">
      <h2 id="tasks-title" className="sr-only">
        {t('dashboard.tasks.title')}
      </h2>
      <ul className="grid gap-3 md:grid-cols-3">
        {shown.map((task) => {
          const Icon = ICONS[task.kind];
          const { title, sub } = copyFor(task, user, t);
          let trailing: ReactNode;
          if (!task.done && task.action) {
            const busy = isBusy(task.action, task.listingId);
            trailing = (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busy}
                aria-busy={busy}
                onClick={() => perform(task.action!, task.listingId)}
              >
                {t(ACTION_LABEL[task.action])}
              </button>
            );
          }
          return (
            <li key={task.id} className="min-w-0">
              <ChecklistItem
                title={title}
                subtitle={sub}
                done={task.done}
                icon={<Icon className="h-4 w-4" />}
                href={!task.done && !task.action ? task.href : undefined}
                trailing={trailing}
                className="h-full"
              />
            </li>
          );
        })}
      </ul>
      {tasks.length > initial && (
        <button
          type="button"
          className="btn btn-ghost btn-sm mt-2 -ml-2"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? t('dashboard.tasks.showLess') : t('dashboard.tasks.showAll', { n: tasks.length })}
        </button>
      )}
    </section>
  );
}
