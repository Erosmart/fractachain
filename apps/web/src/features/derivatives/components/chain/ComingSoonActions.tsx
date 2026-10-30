import { Lock } from 'lucide-react';
import { StatusChip } from '@/components/ui/kit';
import { useI18n } from '@/hooks/useI18n';

/**
 * The writes this contract supports, shown but disabled: in Instaward 1 these
 * screens only read the chain (writes are planned for Instaward 3).
 */
export default function ComingSoonActions({ actions }: { actions: string[] }) {
  const { t } = useI18n();
  return (
    <div className="space-y-2.5 rounded-2xl bg-surface-2 px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-2">
        {actions.map((label) => (
          <button
            key={label}
            type="button"
            className="btn btn-secondary btn-sm"
            disabled
            aria-disabled="true"
          >
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
          </button>
        ))}
        <StatusChip tone="butter" icon={false}>
          {t('markets.chain.comingSoon')}
        </StatusChip>
      </div>
      <p className="text-xs leading-relaxed text-ink-2">{t('markets.chain.readOnly')}</p>
    </div>
  );
}
