import { useEffect, useId, useState } from 'react';
import { RefreshCw, Scale, TriangleAlert } from 'lucide-react';
import { withIsland } from '@/components/island/withIsland';
import LiveContractLink from '@/components/ui/LiveContractLink';
import MockDisclaimer from '@/components/ui/MockDisclaimer';
import { Card, Notice } from '@/components/ui/kit';
import { formatInt } from '@/core/format/number';
import { money } from '@/core/market/money';
import { useI18n } from '@/hooks/useI18n';
import ContractBanner from './ContractBanner';

interface ForwardContract {
  id: string;
  producer: string;
  commodity: 'Soja' | 'Maíz' | 'Trigo';
  tons: number;
  strikePriceUsd: number;
  deliveryDate: string;
  penaltyClausePercent: number;
  rolloverBonusPercent: number;
}

const MOCK_FORWARDS: ForwardContract[] = [
  {
    id: 'FWD-SOJA-2026-01',
    producer: 'Agropecuaria Las Lilas S.A.',
    commodity: 'Soja',
    tons: 500,
    strikePriceUsd: 310,
    deliveryDate: '2027-05-15',
    penaltyClausePercent: 20,
    rolloverBonusPercent: 10,
  },
  {
    id: 'FWD-MAIZ-2026-04',
    producer: 'Don Horacio Cereales S.R.L.',
    commodity: 'Maíz',
    tons: 1200,
    strikePriceUsd: 175,
    deliveryDate: '2027-08-30',
    penaltyClausePercent: 20,
    rolloverBonusPercent: 10,
  },
];

type Clause = 'PENALTY' | 'ROLLOVER';

/** Production forwards (roadmap): demo contracts and a clause simulator. */
function ForwardsPage() {
  const { t, locale } = useI18n();
  const groupId = useId();
  const comLabel = (c: string) =>
    t(c === 'Soja' ? 'misc.comSoja' : c === 'Maíz' ? 'misc.comMaiz' : 'misc.comTrigo');
  const fmtDate = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString(locale === 'en' ? 'en-US' : 'es-AR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  const [selected, setSelected] = useState<ForwardContract>(MOCK_FORWARDS[0]);
  const [clause, setClause] = useState<Clause | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const total = selected.tons * selected.strikePriceUsd;
  const penalty = total * (selected.penaltyClausePercent / 100);
  const rolloverTons = selected.tons * (1 + selected.rolloverBonusPercent / 100);

  useEffect(() => setResult(null), [selected, clause]);

  const options: { key: Clause; Icon: typeof RefreshCw; title: string; body: string; value: string }[] = [
    {
      key: 'PENALTY',
      Icon: TriangleAlert,
      title: t('markets.forwards.penalty'),
      body: t('markets.forwards.penaltyBody'),
      value: `− ${money(penalty)}`,
    },
    {
      key: 'ROLLOVER',
      Icon: RefreshCw,
      title: t('markets.forwards.rollover'),
      body: t('markets.forwards.rolloverBody'),
      value: t('markets.forwards.tons', { n: formatInt(rolloverTons) }),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <MockDisclaimer product="Forwards" />
        <LiveContractLink kind="forward" />
      </div>
      <ContractBanner
        icon={<Scale className="h-5 w-5" />}
        title={t('markets.forwards.legalTitle')}
        body={t('markets.forwards.legalBody')}
        wasm="forward_contract.wasm"
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <Card
          title={t('markets.forwards.list')}
          subtitle={t('markets.forwards.listSub', { n: MOCK_FORWARDS.length })}
          className="self-start"
        >
          <ul className="space-y-2">
            {MOCK_FORWARDS.map((f) => {
              const on = selected.id === f.id;
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSelected(f)}
                    className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                      on ? 'border-sky bg-sky-soft' : 'border-line bg-surface hover:border-line-strong'
                    }`}
                  >
                    <span className="flex flex-wrap items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[13px] font-medium text-ink">{f.id}</span>
                          <span className="chip chip-neutral">{comLabel(f.commodity)}</span>
                        </span>
                        <span className="mt-1 block text-xs text-ink-2">{f.producer}</span>
                      </span>
                      <span className="chip-navy">
                        {t('markets.forwards.strike', { n: formatInt(f.strikePriceUsd) })}
                      </span>
                    </span>
                    <span className="mt-4 grid grid-cols-3 gap-3 border-t border-ink/10 pt-3 text-xs">
                      <span>
                        <span className="block text-muted">{t('markets.forwards.volume')}</span>
                        <span className="mt-0.5 block font-medium text-ink tnum">
                          {t('markets.forwards.tons', { n: formatInt(f.tons) })}
                        </span>
                      </span>
                      <span>
                        <span className="block text-muted">{t('markets.forwards.notional')}</span>
                        <span className="mt-0.5 block font-medium text-ink tnum">
                          {money(f.tons * f.strikePriceUsd)}
                        </span>
                      </span>
                      <span>
                        <span className="block text-muted">{t('markets.forwards.delivery')}</span>
                        <span className="mt-0.5 block font-medium text-ink tnum">
                          {fmtDate(f.deliveryDate)}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card
          title={t('markets.forwards.simTitle')}
          subtitle={t('markets.forwards.simSubtitle')}
          actions={<span className="chip chip-butter">{t('markets.simulator')}</span>}
          className="lg:sticky lg:top-24 lg:self-start"
          bodyClassName="space-y-4"
        >
          <dl className="grid grid-cols-2 gap-3 rounded-xl bg-surface-2 px-3.5 py-3 text-xs">
            <div className="min-w-0">
              <dt className="text-muted">{t('markets.forwards.selected')}</dt>
              <dd className="mt-0.5 truncate font-mono font-medium text-ink">{selected.id}</dd>
            </div>
            <div>
              <dt className="text-muted">{t('markets.forwards.totalDelivery')}</dt>
              <dd className="mt-0.5 font-medium text-ink tnum">{money(total)}</dd>
            </div>
          </dl>

          <fieldset>
            <legend className="label">{t('markets.forwards.pickClause')}</legend>
            <div className="space-y-2">
              {options.map(({ key, Icon, title, body, value }) => (
                <label
                  key={key}
                  className={`flex cursor-pointer gap-3 rounded-2xl border p-3.5 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-sky-strong ${
                    clause === key ? 'border-sky bg-sky-soft' : 'border-line hover:border-line-strong'
                  }`}
                >
                  <input
                    type="radio"
                    name={groupId}
                    value={key}
                    checked={clause === key}
                    onChange={() => setClause(key)}
                    className="sr-only"
                  />
                  <span
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface text-ink ring-1 ring-line"
                    aria-hidden="true"
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="text-sm font-medium text-ink">{title}</span>
                      <span className="text-sm text-ink tnum">{value}</span>
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-ink-2">{body}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <button
            type="button"
            className="btn btn-primary btn-lg w-full"
            disabled={!clause}
            onClick={() =>
              setResult(
                clause === 'PENALTY'
                  ? t('markets.forwards.simPenalty', { n: money(penalty) })
                  : t('markets.forwards.simRollover', { n: formatInt(rolloverTons) }),
              )
            }
          >
            {t('markets.forwards.simulate')}
          </button>
          <div aria-live="polite">{result && <Notice tone="good">{result}</Notice>}</div>
        </Card>
      </div>
    </div>
  );
}

export default withIsland(ForwardsPage);
