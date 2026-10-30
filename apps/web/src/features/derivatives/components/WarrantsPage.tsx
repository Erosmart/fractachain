import { useEffect, useId, useState } from 'react';
import { Building } from 'lucide-react';
import { withIsland } from '@/components/island/withIsland';
import LiveContractLink from '@/components/ui/LiveContractLink';
import MockDisclaimer from '@/components/ui/MockDisclaimer';
import { Card, Gauge, GradientPanel, Notice, PillTabs } from '@/components/ui/kit';
import { formatAmount, formatInt } from '@/core/format/number';
import { money } from '@/core/market/money';
import { useI18n } from '@/hooks/useI18n';
import ContractBanner from './ContractBanner';

type Commodity = 'Soja' | 'Maíz' | 'Trigo';

interface WarrantRecord {
  id: string;
  certificateNumber: string;
  warehouseCompany: string;
  commodity: Commodity;
  tons: number;
  collateralValueUsd: number;
  loanAmountUsd: number;
  ltvPercent: number;
  healthFactor: number;
}

const MOCK_WARRANTS: WarrantRecord[] = [
  {
    id: 'WAR-9643-001',
    certificateNumber: 'CD-CU-2026-9481',
    warehouseCompany: 'Control Union Argentina S.A. (Almacén Gral. Depósito)',
    commodity: 'Soja',
    tons: 1000,
    collateralValueUsd: 310000,
    loanAmountUsd: 170500,
    ltvPercent: 55,
    healthFactor: 1.36,
  },
  {
    id: 'WAR-9643-002',
    certificateNumber: 'CD-SGS-2026-1120',
    warehouseCompany: 'SGS Argentina Warrant S.A.',
    commodity: 'Maíz',
    tons: 2500,
    collateralValueUsd: 437500,
    loanAmountUsd: 240625,
    ltvPercent: 55,
    healthFactor: 1.36,
  },
];

const PRICE_MAP: Record<Commodity, number> = { Soja: 310, Maíz: 175, Trigo: 220 };
const LIQUIDATION_LTV = 75;

/** Warrants / certificates of deposit (roadmap): demo vaults and a loan calculator. */
function WarrantsPage() {
  const { t } = useI18n();
  const ids = { tons: useId(), ltv: useId() };
  const comLabel = (c: string) =>
    t(c === 'Soja' ? 'misc.comSoja' : c === 'Maíz' ? 'misc.comMaiz' : 'misc.comTrigo');
  const [commodity, setCommodity] = useState<Commodity>('Soja');
  const [tonsStr, setTonsStr] = useState('500');
  const [ltv, setLtv] = useState(55);
  const [result, setResult] = useState<string | null>(null);

  const tons = Math.max(0, Number(tonsStr) || 0);
  const price = PRICE_MAP[commodity];
  const collateral = tons * price;
  const loan = collateral * (ltv / 100);

  useEffect(() => setResult(null), [commodity, tons, ltv]);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <MockDisclaimer product="Warrants" />
        <LiveContractLink kind="warrant" />
      </div>
      <ContractBanner
        icon={<Building className="h-5 w-5" />}
        title={t('markets.warrants.certTitle')}
        body={t('markets.warrants.certBody')}
        wasm="warrant_vault.wasm"
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <Card
          title={t('markets.warrants.list')}
          subtitle={t('markets.warrants.listSub', { n: MOCK_WARRANTS.length })}
          className="self-start"
        >
          <ul className="space-y-2">
            {MOCK_WARRANTS.map((w) => (
              <li key={w.id} className="rounded-2xl border border-line p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[13px] font-medium text-ink">{w.id}</span>
                      <span className="chip chip-neutral max-w-full truncate font-mono">
                        {w.certificateNumber}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-ink-2">{w.warehouseCompany}</p>
                  </div>
                  <span className="chip-navy">LTV {w.ltvPercent} %</span>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3 text-xs sm:grid-cols-3">
                  <div className="col-span-2 min-w-0 sm:col-span-1">
                    <dt className="text-muted">
                      {t('markets.warrants.collateral')} · {comLabel(w.commodity)}
                    </dt>
                    <dd className="mt-0.5 font-medium text-ink tnum">
                      {t('markets.forwards.tons', { n: formatInt(w.tons) })} · {money(w.collateralValueUsd)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">{t('markets.warrants.loan')}</dt>
                    <dd className="mt-0.5 font-medium text-ink tnum">{money(w.loanAmountUsd)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">{t('markets.warrants.health')}</dt>
                    <dd className="mt-0.5 font-medium text-good tnum">
                      {t('markets.warrants.healthValue', { n: formatAmount(w.healthFactor, 2) })}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </Card>

        <GradientPanel
          title={t('markets.warrants.calcTitle')}
          subtitle={t('markets.warrants.calcSubtitle')}
          className="lg:sticky lg:top-24 lg:self-start"
        >
          <div className="px-4 pt-2">
            <Gauge
              value={ltv}
              max={LIQUIDATION_LTV}
              marker={60}
              display={`${ltv}%`}
              caption={t('markets.warrants.gaugeCaption')}
              minLabel="0"
              maxLabel="75 %"
              ariaLabel={t('markets.warrants.gaugeAria', { n: ltv })}
            />
          </div>
          <div className="m-3 space-y-4 rounded-2xl bg-surface p-4 shadow-card sm:p-5">
            <div>
              <p className="label">{t('markets.warrants.commodity')}</p>
              <PillTabs
                label={t('markets.warrants.commodity')}
                active={commodity}
                onChange={(k) => setCommodity(k as Commodity)}
                className="w-full [&>button]:flex-1 [&>button]:justify-center"
                items={(['Soja', 'Maíz', 'Trigo'] as const).map((c) => ({ key: c, label: comLabel(c) }))}
              />
              <p className="mt-1.5 text-xs text-muted tnum">
                {t('markets.warrants.perTon', { n: formatInt(price) })}
              </p>
            </div>
            <div>
              <label htmlFor={ids.tons} className="label">
                {t('markets.warrants.tons')}
              </label>
              <input
                id={ids.tons}
                className="input tnum"
                type="text"
                inputMode="numeric"
                value={tonsStr}
                onChange={(e) => setTonsStr(e.target.value.replace(/[^\d]/g, ''))}
                onFocus={(e) => e.target.select()}
              />
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <label htmlFor={ids.ltv} className="label">
                  {t('markets.warrants.ltv')}
                </label>
                <span className="text-sm font-medium text-ink tnum">{ltv} %</span>
              </div>
              <input
                id={ids.ltv}
                type="range"
                min={50}
                max={60}
                step={1}
                value={ltv}
                aria-label={t('markets.warrants.ltvAria')}
                aria-valuetext={`${ltv} %`}
                onChange={(e) => setLtv(Number(e.target.value))}
                className="h-2 w-full cursor-pointer accent-[rgb(var(--sky-strong))]"
              />
              <div className="mt-1 flex justify-between text-[11px] text-muted">
                <span>{t('markets.warrants.conservative')}</span>
                <span>{t('markets.warrants.maxLaw')}</span>
              </div>
            </div>
            <dl className="space-y-1.5 rounded-xl bg-surface-2 px-3.5 py-3 text-[13px]">
              <div className="flex justify-between">
                <dt className="text-ink-2">{t('markets.warrants.grainValue')}</dt>
                <dd className="text-ink tnum">{money(collateral)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-2">{t('markets.warrants.liqPrice')}</dt>
                <dd className="text-ink tnum">
                  {t('markets.warrants.perTon', { n: formatAmount(price * 0.75, 1) })}
                </dd>
              </div>
              <div className="flex items-baseline justify-between border-t border-line pt-1.5">
                <dt className="font-medium text-ink">{t('markets.warrants.loanReceive')}</dt>
                <dd className="text-lg font-medium text-ink tnum">{money(loan)}</dd>
              </div>
            </dl>
            <button
              type="button"
              className="btn btn-primary btn-lg w-full"
              disabled={tons <= 0}
              onClick={() =>
                setResult(
                  t('markets.warrants.simLoan', {
                    n: money(loan),
                    tons: formatInt(tons),
                    c: comLabel(commodity),
                  }),
                )
              }
            >
              {t('markets.warrants.simulate')}
            </button>
            <div aria-live="polite">{result && <Notice tone="good">{result}</Notice>}</div>
          </div>
        </GradientPanel>
      </div>
    </div>
  );
}

export default withIsland(WarrantsPage);
