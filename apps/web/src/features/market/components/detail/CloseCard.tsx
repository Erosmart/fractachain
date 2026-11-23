import { Lock } from 'lucide-react';
import TxPanel from '@/components/tx/TxPanel';
import { Card } from '@/components/ui/kit';
import { useI18n } from '@/hooks/useI18n';
import { useNow } from '../../hooks/useNow';
import type { Offering } from '../../hooks/useOffering';

/**
 * The contract closes when the cap is filled or the period ends; the
 * platform does it on its own, and anyone may call `finalize` once the
 * contract allows it (read from the contract: state, deadline, raised, cap).
 */
export default function CloseCard({ offering }: { offering: Offering }) {
  const { t } = useI18n();
  const now = useNow();
  const { tender, user, flow, actions } = offering;
  const showingFlow = flow.snap.action === 'finalize';
  if (!tender || tender.stateName !== 'Open') return showingFlow ? <FlowOnly offering={offering} /> : null;
  const capFilled = tender.hardCap !== null && tender.raised >= tender.hardCap;
  const expired = tender.deadlineMs !== null && tender.deadlineMs <= now;
  if (!capFilled && !expired && !showingFlow) return null;
  return (
    <Card title={t('offerings.close.title')}>
      <p className="text-[13px] leading-relaxed text-ink-2">{t('offerings.close.ready')}</p>
      <p className="mt-2 text-xs text-muted">{t('offerings.close.auto')}</p>
      {user && (
        <button
          type="button"
          className="btn btn-secondary mt-4 w-full"
          disabled={flow.busy}
          onClick={() => void actions.finalize()}
        >
          <Lock className="h-4 w-4" aria-hidden="true" />
          {flow.busy && showingFlow ? t('offerings.close.busy') : t('offerings.close.action')}
        </button>
      )}
      {showingFlow && (
        <TxPanel
          className="mt-3"
          snap={flow.snap}
          onSign={() => void flow.sign()}
          onRetry={() => void flow.retry()}
          onResign={() => flow.resign()}
          onClose={() => flow.reset()}
        />
      )}
    </Card>
  );
}

/** After the close settles the contract is no longer Open: keep the result on screen. */
function FlowOnly({ offering }: { offering: Offering }) {
  const { t } = useI18n();
  const { flow } = offering;
  return (
    <Card title={t('offerings.close.title')}>
      <TxPanel
        snap={flow.snap}
        onSign={() => void flow.sign()}
        onRetry={() => void flow.retry()}
        onResign={() => flow.resign()}
        onClose={() => flow.reset()}
      />
    </Card>
  );
}
