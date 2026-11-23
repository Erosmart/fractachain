import { RefreshCw, ServerCrash, Sprout } from 'lucide-react';
import { EmptyState } from '@/components/ui/kit';
import { useI18n } from '@/hooks/useI18n';
import { timeOf } from './ChainCard';

/** Page-level source bar: network, last refresh (announced politely) and a manual refresh. */
export function ChainToolbar({
  count,
  updatedAt,
  refreshing,
  failed = false,
  onRefresh,
}: {
  count: number | null;
  updatedAt: Date | null;
  refreshing: boolean;
  /** The last read failed: the dot turns red (the error itself is shown below). */
  failed?: boolean;
  onRefresh: () => void;
}) {
  const { t, locale } = useI18n();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-ink-2" aria-live="polite" aria-atomic="true">
        <span
          className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${failed ? 'bg-bad' : 'bg-good'}`}
          aria-hidden="true"
        />
        {t('markets.chain.source')}
        {count !== null && (
          <> · {count === 1 ? t('markets.chain.instancesOne') : t('markets.chain.instances', { n: count })}</>
        )}
        {updatedAt && <> · {t('markets.chain.updated', { time: timeOf(updatedAt, locale) })}</>}
      </p>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onRefresh} disabled={refreshing}>
        <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
        {refreshing ? t('markets.chain.refreshing') : t('markets.chain.refresh')}
      </button>
    </div>
  );
}

export function ChainLoading() {
  const { t } = useI18n();
  return (
    <div className="card card-pad" role="status" aria-busy="true">
      <p className="flex items-center gap-2 text-sm text-ink-2">
        <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
        {t('markets.chain.loading')}
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2" aria-hidden="true">
        {[0, 1].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-surface-2" />
        ))}
      </div>
    </div>
  );
}

export function ChainError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="card">
      <EmptyState
        icon={<ServerCrash className="h-5 w-5" />}
        title={t('markets.chain.errorTitle')}
        body={t('markets.chain.errorBody', { msg: message })}
        action={
          <button type="button" className="btn btn-primary" onClick={onRetry}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {t('markets.chain.retry')}
          </button>
        }
      />
    </div>
  );
}

/** No seeded instance on this network yet: say how to create them. */
export function ChainEmpty({ kind }: { kind: string }) {
  const { t } = useI18n();
  return (
    <div className="card">
      <EmptyState
        icon={<Sprout className="h-5 w-5" />}
        title={t('markets.chain.emptyTitle', { kind })}
        body={
          <>
            {t('markets.chain.emptyBody')}{' '}
            <code className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-ink">
              npm run stellar:deploy
            </code>
          </>
        }
      />
    </div>
  );
}
