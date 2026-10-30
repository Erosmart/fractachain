import { ArrowDownLeft, ArrowUpRight, FileCode2, Repeat2, ShieldCheck, Sparkles, Wallet } from 'lucide-react';
import ExternalLink from '@/components/ui/ExternalLink';
import { explorerTx } from '@/core/format/number';
import { useI18n } from '@/hooks/useI18n';
import type { ActivityItem, OpKey } from '../model/activity';
import { dateTime } from '../model/format';

const ICONS: Record<OpKey, typeof Wallet> = {
  received: ArrowDownLeft,
  sent: ArrowUpRight,
  created: Sparkles,
  funded: Wallet,
  trustOn: ShieldCheck,
  trustOff: ShieldCheck,
  contract: FileCode2,
  offer: Repeat2,
  other: FileCode2,
};

/** Wallet movements as sentences ("Recibiste 200 USDC"), each linked to its transaction. */
export function ActivityList({ items, className = '' }: { items: ActivityItem[]; className?: string }) {
  const { t, locale } = useI18n();
  return (
    <ul className={`divide-y divide-line/70 ${className}`}>
      {items.map((it) => {
        const Icon = ICONS[it.key];
        return (
          <li key={it.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <span
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                it.direction === 'in'
                  ? 'bg-good-soft text-good'
                  : it.direction === 'out'
                    ? 'bg-peach-soft text-ink'
                    : 'bg-sky-soft text-ink-2'
              }`}
              aria-hidden="true"
            >
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-ink">
                {t(`dashboard.activity.ops.${it.key}`, it.vars)}
              </span>
              <span className="block text-xs text-muted tnum">{dateTime(it.at, locale)}</span>
            </span>
            <ExternalLink
              href={explorerTx(it.hash)}
              className="arrow-btn"
              aria-label={`${t(`dashboard.activity.ops.${it.key}`, it.vars)} — ${t('dashboard.portfolio.proceedsTx')}`}
            >
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </ExternalLink>
          </li>
        );
      })}
    </ul>
  );
}
