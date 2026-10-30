import type { Listing } from '@fractachain/shared';
import { CapProgress, StatusChip } from '@/components/ui/kit';
import { formatAmount } from '@/core/format/number';
import { useI18n } from '@/hooks/useI18n';
import { ISSUANCE_STAGES, STAGE_TONE, stageOf, type IssuanceStage } from '../model';

export const assetFormat = (listing: Listing) => (n: number) =>
  `${formatAmount(n, n % 1 ? 2 : 0)} ${listing.dossier.paymentKind === 'XLM' ? 'XLM' : 'USDC'}`;

/** Kanban-style overview: every dossier in its stage; a card jumps to its detail below. */
export default function PipelineBoard({
  listings,
  paying,
}: {
  listings: Listing[];
  paying: ReadonlySet<string>;
}) {
  const { t } = useI18n();
  const byStage = new Map<IssuanceStage, Listing[]>(ISSUANCE_STAGES.map((s) => [s, []]));
  for (const l of listings) byStage.get(stageOf(l, paying.has(l.id)))!.push(l);

  return (
    <section className="card card-pad min-w-0" aria-labelledby="pipeline-title">
      <header className="mb-4">
        <h2 id="pipeline-title" className="title">
          {t('admin.issuance.pipeline')}
        </h2>
        <p className="subtitle mt-0.5">{t('admin.issuance.pipelineSub')}</p>
      </header>
      <ol className="-mx-5 flex snap-x items-start gap-3 overflow-x-auto px-5 pb-1 sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0 xl:grid-cols-6">
        {ISSUANCE_STAGES.map((stage) => {
          const items = byStage.get(stage)!;
          return (
            <li
              key={stage}
              className="w-[15.5rem] shrink-0 snap-start rounded-2xl bg-surface-2 p-3 lg:w-auto"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <StatusChip tone={STAGE_TONE[stage]} icon={false}>
                  {t(`admin.issuance.stage.${stage}`)}
                </StatusChip>
                <span className="text-xs text-muted tnum">{items.length}</span>
              </div>
              {items.length === 0 ? (
                <p className="px-1 pb-1 text-xs text-muted">{t('admin.issuance.pipelineEmpty')}</p>
              ) : (
                <ul className="space-y-2">
                  {items.map((l) => {
                    const fmt = assetFormat(l);
                    const funded = l.status === 'LISTED' || l.status.startsWith('CLOSED');
                    return (
                      <li key={l.id}>
                        <a
                          href={`#listing-${l.id}`}
                          className="block rounded-xl border border-line bg-surface px-3 py-2.5 transition-colors hover:border-line-strong"
                        >
                          <span className="block truncate text-sm font-medium text-ink">
                            {l.dossier.tokenTicker || l.dossier.ticker}
                          </span>
                          <span className="block truncate text-xs text-muted">{l.dossier.legalName}</span>
                          {funded && (
                            <>
                              <CapProgress
                                compact
                                className="mt-2.5"
                                raised={l.raisedUsdc}
                                softCap={l.dossier.offeringSoftCapUsdc}
                                hardCap={l.dossier.offeringHardCapUsdc}
                                format={fmt}
                              />
                              <span className="mt-1.5 block text-[11px] text-muted tnum">
                                {fmt(l.raisedUsdc)} / {fmt(l.dossier.offeringHardCapUsdc)}
                              </span>
                            </>
                          )}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
