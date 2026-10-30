import { useEffect, useState } from 'react';
import { RotateCcw, Scale, Zap } from 'lucide-react';
import RequireAdmin from '@/components/guards/RequireAdmin';
import { withIsland } from '@/components/island/withIsland';
import {
  Card,
  GradientPanel,
  Notice,
  PageHeader,
  RiskCallout,
  StatusChip,
  type Tone,
} from '@/components/ui/kit';
import { useI18n } from '@/hooks/useI18n';
import { CopyValue } from '../../shared/CopyValue';

interface TokenHolder {
  address: string;
  name: string;
  /** i18n key used instead of `name` when present. */
  nameKey?: string;
  tokensHeld: number;
  percentage: number;
  isDominant: boolean;
}

/** Sample scenario: per-contract holdings are not exposed by the API yet. */
const INITIAL_HOLDERS: TokenHolder[] = [
  {
    address: 'GD6CGAZZY4Z2HQAIBL4RHJJWHJULLCO5F5XW6VL3CECJWLDBCDKWB7KR',
    name: 'Fondo de Inversión Agrícola Sur (Dominante)',
    nameKey: 'admOpa.holderDominant',
    tokensHeld: 262000,
    percentage: 52.4,
    isDominant: true,
  },
  {
    address: 'GB78A...9182',
    name: 'Cresud S.A.C.I.F. y A.',
    tokensHeld: 95000,
    percentage: 19.0,
    isDominant: false,
  },
  {
    address: 'GC23M...4419',
    name: 'Molinos Agro S.A.',
    tokensHeld: 60000,
    percentage: 12.0,
    isDominant: false,
  },
  {
    address: 'GDK81...5520',
    name: 'Minoristas en Stellar DEX (142 cuentas)',
    nameKey: 'admOpa.holderRetail',
    tokensHeld: 83000,
    percentage: 16.6,
    isDominant: false,
  },
];

const OPA_THRESHOLD = 50;
const SQUEEZE_THRESHOLD = 95;

function regime(pct: number): { tone: Tone; key: string } {
  if (pct >= SQUEEZE_THRESHOLD) return { tone: 'bad', key: 'admin.opa.regime.squeeze' };
  if (pct >= OPA_THRESHOLD) return { tone: 'warn', key: 'admin.opa.regime.opa' };
  return { tone: 'good', key: 'admin.opa.regime.normal' };
}

/** Takeover-bid (OPA) and squeeze-out governance simulator. */
function AdminOpa() {
  const { t, locale } = useI18n();
  const [holders, setHolders] = useState<TokenHolder[]>(INITIAL_HOLDERS);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const dominant = holders.find((h) => h.isDominant) ?? holders[0];
  const pct = dominant.percentage;
  const state = regime(pct);
  const loc = locale === 'en' ? 'en-US' : 'es-AR';
  const nf = (n: number) => n.toLocaleString(loc);
  const pf = (n: number) => n.toLocaleString(loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const total = holders.reduce((s, h) => s + h.tokensHeld, 0);

  useEffect(() => {
    if (!actionMessage) return;
    const timer = setTimeout(() => setActionMessage(null), 6000);
    return () => clearTimeout(timer);
  }, [actionMessage]);

  const simulateSqueezeOut = () => {
    setHolders((prev) => [
      { ...prev[0], percentage: 96.2, tokensHeld: 481000 },
      { ...prev[1], percentage: 1.8, tokensHeld: 9000 },
      { ...prev[2], percentage: 1.0, tokensHeld: 5000 },
      { ...prev[3], percentage: 1.0, tokensHeld: 5000 },
    ]);
    setActionMessage(t('admOpa.squeezeMsg'));
  };

  const reset = () => {
    setHolders(INITIAL_HOLDERS);
    setActionMessage(null);
  };

  const holderName = (h: TokenHolder) => (h.nameKey ? t(h.nameKey) : h.name);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <StatusChip tone="peach" icon={false}>
            {t('admin.opa.simulation')}
          </StatusChip>
        }
        title={t('admin.opa.title')}
        subtitle={t('admin.opa.lead')}
        actions={
          <button type="button" className="btn btn-secondary" onClick={reset}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {t('admin.opa.reset')}
          </button>
        }
      />

      <RiskCallout>{t('admin.opa.simulationNote')}</RiskCallout>

      <div aria-live="polite">{actionMessage && <Notice tone="sky">{actionMessage}</Notice>}</div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <Card title={t('admin.opa.concentration')} subtitle={t('admin.opa.issue')}>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <p className="flex items-baseline gap-1.5 text-ink">
                <span className="numeral text-[56px]">{pf(pct)}</span>
                <span className="text-sm text-ink-2">%</span>
              </p>
              <StatusChip tone={state.tone}>{t(state.key)}</StatusChip>
            </div>
            <p className="mt-1 text-xs text-muted">
              {t('admin.opa.dominant')}: {holderName(dominant)}
            </p>

            {/* Track with the two legal thresholds marked. */}
            <div className="mt-6">
              <div
                className="relative h-2 rounded-full bg-sky-soft"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
                aria-label={t('admin.opa.concentration')}
              >
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500"
                  style={{
                    width: `${pct}%`,
                    background: 'linear-gradient(90deg, rgb(var(--sky-strong)), rgb(var(--sky)))',
                  }}
                />
                {[OPA_THRESHOLD, SQUEEZE_THRESHOLD].map((m) => (
                  <div
                    key={m}
                    className={`absolute -top-1 h-4 w-[2px] rounded-full ${pct >= m ? 'bg-ink' : 'bg-ink/45'}`}
                    style={{ left: `calc(${m}% - 1px)` }}
                    aria-hidden="true"
                  />
                ))}
              </div>
              <div className="relative mt-2 h-4 text-[11px] text-muted tnum" aria-hidden="true">
                <span className="absolute left-0">0 %</span>
                <span
                  className="absolute -translate-x-1/2 whitespace-nowrap"
                  style={{ left: `${OPA_THRESHOLD}%` }}
                >
                  {t('admin.opa.opaMark')}
                </span>
                <span
                  className="absolute -translate-x-full whitespace-nowrap"
                  style={{ left: `${SQUEEZE_THRESHOLD}%` }}
                >
                  {t('admin.opa.squeezeMark')}
                </span>
              </div>
            </div>
          </Card>

          <section className="card min-w-0 overflow-hidden" aria-labelledby="holders-title">
            <header className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-5 sm:px-6 sm:pt-6">
              <h2 id="holders-title" className="title">
                {t('admin.opa.holders')}
              </h2>
              <span className="text-xs text-muted tnum">{t('admin.opa.total', { n: nf(total) })}</span>
            </header>
            <ul className="mt-3 divide-y divide-line md:hidden">
              {holders.map((h) => (
                <li key={h.address} className="space-y-1.5 px-5 py-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 text-sm font-medium text-ink">{holderName(h)}</span>
                    <span className="shrink-0 text-sm text-ink tnum">{pf(h.percentage)} %</span>
                  </div>
                  {h.isDominant && <StatusChip tone="warn">{t('admin.opa.obliged')}</StatusChip>}
                  <p className="text-xs text-muted tnum">
                    {nf(h.tokensHeld)} {t('admOpa.tokensUnit')}
                  </p>
                </li>
              ))}
            </ul>
            <div className="mt-3 hidden overflow-x-auto md:block">
              <table className="table-clean">
                <thead>
                  <tr>
                    <th scope="col" className="!pl-6">
                      {t('admin.opa.thHolder')}
                    </th>
                    <th scope="col">{t('admOpa.thAddress')}</th>
                    <th scope="col" className="!text-right">
                      {t('admOpa.thTokens')}
                    </th>
                    <th scope="col" className="!pr-6 !text-right">
                      {t('admOpa.thPct')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {holders.map((h) => (
                    <tr key={h.address}>
                      <td className="!pl-6">
                        <span className="block text-sm text-ink">{holderName(h)}</span>
                        {h.isDominant && (
                          <StatusChip tone="warn" className="mt-1">
                            {t('admin.opa.obliged')}
                          </StatusChip>
                        )}
                      </td>
                      <td>
                        {h.address.includes('...') ? (
                          <span className="font-mono text-xs text-muted">{h.address}</span>
                        ) : (
                          <CopyValue value={h.address} />
                        )}
                      </td>
                      <td className="text-right">{nf(h.tokensHeld)}</td>
                      <td className="!pr-6 text-right">{pf(h.percentage)} %</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="min-w-0 space-y-6">
          <GradientPanel title={t('admin.opa.actions')}>
            <div className="space-y-2 px-5 py-5 sm:px-6">
              <button
                type="button"
                onClick={() => setActionMessage(t('admOpa.opaMsg'))}
                className="btn btn-primary w-full"
              >
                <Zap className="h-4 w-4" aria-hidden="true" />
                {t('admin.opa.notify')}
              </button>
              <button type="button" onClick={simulateSqueezeOut} className="btn btn-secondary w-full">
                <Scale className="h-4 w-4" aria-hidden="true" />
                {t('admin.opa.simulate')}
              </button>
            </div>
          </GradientPanel>

          <Card title={t('admin.opa.legal')}>
            <div className="space-y-3 text-[13px] leading-relaxed text-ink-2">
              <p>
                <span className="font-medium text-ink">{t('admOpa.art86Label')}</span> {t('admOpa.art86Body')}
              </p>
              <p>
                <span className="font-medium text-ink">{t('admOpa.art91Label')}</span> {t('admOpa.art91Body')}
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function AdminOpaPage() {
  return (
    <RequireAdmin>
      <AdminOpa />
    </RequireAdmin>
  );
}

export default withIsland(AdminOpaPage);
