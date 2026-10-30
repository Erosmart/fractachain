import { Lock } from 'lucide-react';
import { Card } from '@/components/ui/kit';
import { useI18n } from '@/hooks/useI18n';
import type { Offering } from '../../hooks/useOffering';

/**
 * The contract closes when the cap is filled or the period ends; the platform
 * does it on its own, and anyone may trigger it once it is allowed.
 */
export default function CloseCard({ offering }: { offering: Offering }) {
  const { t } = useI18n();
  const { listing, onChain, user, busy, actions } = offering;
  if (!listing || !onChain.live || listing.status !== 'LISTED' || !onChain.canFinalize) return null;
  return (
    <Card title={t('offerings.close.title')}>
      <p className="text-[13px] leading-relaxed text-ink-2">{t('offerings.close.ready')}</p>
      <p className="mt-2 text-xs text-muted">{t('offerings.close.auto')}</p>
      {user && (
        <button
          type="button"
          className="btn btn-secondary mt-4 w-full"
          disabled={busy !== null}
          onClick={() => void actions.finalize()}
        >
          <Lock className="h-4 w-4" aria-hidden="true" />
          {busy === 'finalize' ? t('offerings.close.busy') : t('offerings.close.action')}
        </button>
      )}
    </Card>
  );
}
