import { ArrowUpRight } from 'lucide-react';
import { withIsland } from '@/components/island/withIsland';
import { Gauge, GradientPanel, Notice, PanelNote, Stat, StatGrid } from '@/components/ui/kit';
import { formatAmount } from '@/core/format/number';
import { useI18n } from '@/hooks/useI18n';
import { marketStats, useLivePools } from '../livePools';

/**
 * Hero panel: the platform's live numbers, read from the offerings'
 * contracts (no static marketing metrics). Gauge = average share of each
 * offering's cap already subscribed.
 */
function HeroLivePanel() {
  const { t } = useI18n();
  const state = useLivePools();
  const stats = state.kind === 'ready' ? marketStats(state.pools) : undefined;
  const pct = stats ? Math.round(stats.fillRatio * 100) : 0;
  const dash = '—';

  return (
    <GradientPanel
      title={t('landing.live.panelTitle')}
      subtitle={t('landing.live.panelSubtitle')}
      href="/market"
      hrefLabel={t('landing.live.viewAll')}
      className="h-full"
      footer={
        <PanelNote href="/market" icon={<ArrowUpRight className="h-4 w-4" aria-hidden="true" />}>
          {t('landing.live.note')}
        </PanelNote>
      }
    >
      <div aria-live="polite" aria-busy={state.kind === 'loading'}>
        {state.kind === 'error' ? (
          <div className="px-5 py-8 sm:px-6">
            <Notice tone="warn">{t('landing.live.error')}</Notice>
          </div>
        ) : (
          <>
            <div className="px-6 pt-2">
              <Gauge
                value={pct}
                max={100}
                display={stats ? pct : dash}
                caption={`% ${t('landing.live.gaugeCaption')}`}
                ariaLabel={stats ? t('landing.live.gaugeAria', { pct }) : t('landing.live.loading')}
              />
            </div>
            <StatGrid className="mt-2 border-t border-ink/10">
              <Stat
                label={t('landing.live.offerings')}
                value={stats ? stats.offerings : dash}
                unit={t('landing.live.offeringsUnit')}
              />
              <Stat
                label={t('landing.live.reachedMin')}
                value={stats ? stats.reachedMin : dash}
                unit={stats ? t('landing.live.reachedMinUnit', { total: stats.offerings }) : undefined}
              />
              <Stat
                label={t('landing.live.usdc')}
                value={stats ? formatAmount(stats.raisedUsdc) : dash}
                unit="USDC"
              />
              <Stat
                label={t('landing.live.xlm')}
                value={stats ? formatAmount(stats.raisedXlm) : dash}
                unit="XLM"
              />
            </StatGrid>
          </>
        )}
      </div>
    </GradientPanel>
  );
}

export default withIsland(HeroLivePanel);
