import { ArrowUpRight, Layers } from 'lucide-react';
import { assetAmount } from '@/components/tx/format';
import { Gauge, GradientPanel, PanelNote, Stat, StatGrid } from '@/components/ui/kit';
import { useI18n } from '@/hooks/useI18n';
import { amount, clock, money, pct } from '@/features/portfolio/model/format';
import type { ChainHolding, ChainWallet } from '@/features/portfolio/model/chain';

export interface NextStep {
  label: string;
  href: string;
}

/**
 * The right-hand gradient panel, read from Stellar: capital in tokens vs.
 * the USDC in the wallet as a gauge, a 2×2 of balances, each token's contract
 * price and the next step at the bottom.
 */
export function CapitalPanel({
  wallet,
  holdings,
  tokensValue,
  code,
  loadedAt,
  next,
  className = '',
}: {
  wallet: ChainWallet | null;
  holdings: ChainHolding[];
  /** Value of the holdings priced in `code`. */
  tokensValue: number;
  code: string;
  loadedAt: Date | null;
  next: NextStep;
  className?: string;
}) {
  const { t, locale } = useI18n();
  const cash = wallet?.usdc?.balance;
  const capital = tokensValue + (cash ?? 0);
  const ratio = capital > 0 ? tokensValue / capital : 0;

  return (
    <GradientPanel
      className={className}
      title={t('dashboard.panel.title')}
      subtitle={
        loadedAt
          ? t('dashboard.chain.sourceAt', { time: clock(loadedAt, locale) })
          : t('dashboard.chain.source')
      }
      href="/portfolio"
      hrefLabel={t('dashboard.holdings.viewAll')}
      footer={
        <PanelNote
          icon={
            next.href === '/market' ? <Layers className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />
          }
          href={next.href}
        >
          {next.label}
        </PanelNote>
      }
    >
      <div className="px-5 pt-2 sm:px-6">
        <Gauge
          className="max-w-[260px] lg:max-w-[300px]"
          value={tokensValue}
          max={capital > 0 ? capital : 1}
          display={wallet ? money(tokensValue, 0) : '—'}
          caption={wallet ? t('dashboard.chain.gaugeCaption', { code, pct: pct(ratio) }) : undefined}
          minLabel="0"
          maxLabel={wallet ? money(capital, 0) : ''}
          ariaLabel={t('dashboard.chain.gaugeAria', {
            value: assetAmount(tokensValue, code),
            pct: pct(ratio),
            total: assetAmount(capital, code),
          })}
        />
      </div>

      <StatGrid className="mt-2 border-t border-ink/10">
        <Stat
          label={t('dashboard.chain.usdc', { code })}
          value={cash === undefined ? '—' : money(cash, 0)}
          unit={cash === undefined ? undefined : code}
          delta={
            wallet?.usdc && !wallet.usdc.trustline
              ? t('dashboard.chain.usdcNoTrust', { code })
              : t('dashboard.panel.cashNote')
          }
        />
        <Stat
          label={t('dashboard.chain.tokensValue')}
          value={wallet ? money(tokensValue, 0) : '—'}
          unit={wallet ? code : undefined}
          delta={t('dashboard.chain.tokensValueNote')}
        />
        <Stat
          label={t('dashboard.panel.xlm')}
          value={wallet ? money(wallet.xlm, 0) : '—'}
          unit={wallet ? 'XLM' : undefined}
          delta={t('dashboard.panel.xlmNote')}
        />
        <Stat
          label={t('dashboard.chain.positions')}
          value={wallet ? String(holdings.length) : '—'}
          delta={t('dashboard.chain.positionsNote')}
        />
      </StatGrid>

      {holdings.length > 0 && (
        <div className="hidden border-t border-ink/10 px-5 py-5 sm:px-6 lg:block">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h3 className="text-[13px] font-medium text-ink">{t('dashboard.panel.pricesTitle')}</h3>
            <span className="text-[11px] text-ink-2">{t('dashboard.chain.pricesUnit')}</span>
          </div>
          <ul className="grid grid-cols-3 gap-x-3 gap-y-3">
            {holdings.slice(0, 9).map((h) => (
              <li key={h.contractId} className="min-w-0">
                <span className="block truncate text-[11px] text-ink-2">{h.ticker}</span>
                <span className="mt-0.5 inline-block text-[15px] text-ink tnum">
                  {h.price > 0 ? `${amount(h.price)} ${h.code}` : '—'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </GradientPanel>
  );
}
