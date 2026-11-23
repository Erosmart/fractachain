import type { ReactNode } from 'react';
import { ArrowUpRight, Layers, LineChart, ShieldCheck } from 'lucide-react';
import { GradientPanel } from '@/components/ui/kit';
import { useI18n } from '@/hooks/useI18n';

function NextLink({ href, icon, children }: { href: string; icon: ReactNode; children: ReactNode }) {
  return (
    <a
      href={href}
      className="flex items-center gap-3 rounded-xl bg-surface/60 px-3.5 py-3 text-sm font-medium text-ink transition-colors hover:bg-surface/90"
    >
      <span
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface text-ink-2"
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-ink-2" aria-hidden="true" />
    </a>
  );
}

/** While you wait: things the investor can already do. */
export default function WhileYouWait() {
  const { t } = useI18n();
  return (
    <GradientPanel title={t('onboard.status.meanwhile')} subtitle={t('onboard.status.meanwhileSub')}>
      <div className="space-y-2 p-4 sm:p-5">
        <NextLink href="/market" icon={<Layers className="h-4 w-4" />}>
          {t('shell.tabs.offerings')}
        </NextLink>
        <NextLink href="/stocks" icon={<LineChart className="h-4 w-4" />}>
          {t('shell.tabs.markets')}
        </NextLink>
        <NextLink href="/account/security" icon={<ShieldCheck className="h-4 w-4" />}>
          {t('account.checklist.twoFa')}
        </NextLink>
      </div>
    </GradientPanel>
  );
}
