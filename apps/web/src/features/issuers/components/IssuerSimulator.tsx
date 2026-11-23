import { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { withIsland } from '@/components/island/withIsland';
import { CapProgress, Notice } from '@/components/ui/kit';
import { formatAmount, formatInt } from '@/core/format/number';
import { useI18n } from '@/hooks/useI18n';
import { DEFAULT_SIMULATION, issuerContactHref, simulate, type SimulatorInput } from '../simulator';

/** Form fields, in order; each key is also its label key in `landing.issuerPage.sim`. */
const FIELDS: (keyof SimulatorInput)[] = [
  'quantity',
  'unit',
  'price',
  'supply',
  'softCap',
  'hardCap',
  'days',
];

/** Client-side estimate of an offering's numbers. Sends nothing anywhere. */
function IssuerSimulator() {
  const { locale, messages, t } = useI18n();
  const s = messages.landing.issuerPage.sim;
  const [form, setForm] = useState<SimulatorInput>(DEFAULT_SIMULATION);
  const [now] = useState(() => Date.now());
  const result = useMemo(() => simulate(form, now), [form, now]);
  const unit = form.unit.trim() || s.unitPlaceholder;
  const usdc = (n: number) => `${formatAmount(n, n < 100 ? 2 : 0)} USDC`;
  const close = result.closeAt
    ? new Intl.DateTimeFormat(locale === 'es' ? 'es-AR' : 'en-US', { dateStyle: 'long' }).format(
        result.closeAt,
      )
    : '—';
  const rows: [string, string][] = [
    [s.sold, result.sold ? formatInt(result.sold) : '—'],
    [s.kept, result.sold && !result.errors.supply ? formatInt(result.kept) : '—'],
    [t('landing.issuerPage.sim.perUnit', { unit }), result.perUnit ? usdc(result.perUnit) : '—'],
    [s.minTicket, result.price ? usdc(result.price) : '—'],
    [s.close, close],
  ];

  return (
    <section className="card card-pad" aria-labelledby="sim-title">
      <h2 id="sim-title" className="title">
        {s.title}
      </h2>
      <p className="subtitle mt-0.5">{s.subtitle}</p>
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map((key) => (
            <div key={key}>
              <label htmlFor={`sim-${key}`} className="label">
                {s[key]}
              </label>
              <input
                id={`sim-${key}`}
                className="input tnum"
                inputMode={key === 'unit' ? undefined : 'decimal'}
                placeholder={key === 'unit' ? s.unitPlaceholder : undefined}
                value={form[key]}
                onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <div className="min-w-0 space-y-5">
          <CapProgress raised={0} softCap={result.softCap} hardCap={result.hardCap} format={usdc} />
          <p className="text-xs text-muted">{s.bar}</p>
          <dl className="space-y-2.5 border-t border-line pt-5 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="text-ink-2">{k}</dt>
                <dd className="text-right font-medium text-ink tnum">{v}</dd>
              </div>
            ))}
          </dl>
          {result.errors.supply && (
            <Notice tone="warn">
              {t('landing.issuerPage.sim.errSupply', {
                n: formatInt(result.errors.supply.needed),
                s: formatInt(result.errors.supply.supply),
              })}
            </Notice>
          )}
          {result.errors.caps && <Notice tone="warn">{s.errCaps}</Notice>}
          <a
            href={issuerContactHref(
              t('landing.issuerPage.sim.summary', {
                quantity: form.quantity,
                unit,
                price: form.price,
                supply: form.supply,
                soft: form.softCap,
                hard: form.hardCap,
                days: form.days,
              }),
              result.hardCap,
            )}
            className="btn btn-primary w-full"
          >
            {s.apply}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}

export default withIsland(IssuerSimulator);
