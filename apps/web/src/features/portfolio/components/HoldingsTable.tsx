import { ArrowUpRight } from 'lucide-react';
import ExternalLink from '@/components/ui/ExternalLink';
import { assetAmount, shortId } from '@/components/tx/format';
import { explorerTx } from '@/core/format/number';
import { useI18n } from '@/hooks/useI18n';
import type { ChainHolding } from '../model/chain';
import { amount } from '../model/format';
import type { Task, TaskAction } from '../model/tasks';
import { PositionChip } from './PositionChip';

export interface HoldingsTableProps {
  holdings: ChainHolding[];
  /** Pending tasks; the ones with an action on a holding become its buttons. */
  tasks?: Task[];
  perform?: (action: TaskAction, listingId?: string) => void;
  isBusy?: (action: TaskAction, listingId?: string) => boolean;
  /** `preview`: fewer columns, no actions (Inicio). */
  variant?: 'full' | 'preview';
}

const ACTION_LABEL: Partial<Record<Task['kind'], string>> = {
  trustline: 'dashboard.tasks.trustlineAction',
  claim: 'dashboard.tasks.claimAction',
  receive: 'dashboard.tasks.receiveAction',
  refund: 'dashboard.tasks.refundAction',
};

function TradeLink({ h }: { h: ChainHolding }) {
  const { t } = useI18n();
  return (
    <a
      href={`/orderbook?listing=${encodeURIComponent(h.listingId)}`}
      className="arrow-btn"
      aria-label={t('dashboard.holdings.tradeAria', { ticker: h.ticker })}
      title={t('dashboard.holdings.trade')}
    >
      <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
    </a>
  );
}

/** The tender contract a holding was read from, linked to Stellar Expert. */
function ContractLink({ h }: { h: ChainHolding }) {
  const { t } = useI18n();
  return (
    <ExternalLink
      href={h.explorer}
      title={`${t('dashboard.chain.contract')}: ${h.contractId}`}
      className="inline-flex items-center gap-0.5 font-mono text-[11px] text-ink-2 underline-offset-2 hover:text-ink hover:underline"
    >
      {shortId(h.contractId)}
      <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
    </ExternalLink>
  );
}

function Actions({
  h,
  tasks,
  perform,
  isBusy,
}: Required<Pick<HoldingsTableProps, 'perform' | 'isBusy'>> & { h: ChainHolding; tasks: Task[] }) {
  const { t } = useI18n();
  const mine = tasks.filter((task) => task.listingId === h.listingId && task.action && !task.done);
  if (!mine.length && !h.finalizeHash) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {mine.map((task) => (
        <button
          key={task.id}
          type="button"
          className="btn btn-soft btn-sm"
          disabled={isBusy(task.action!, h.listingId)}
          aria-busy={isBusy(task.action!, h.listingId)}
          onClick={() => perform(task.action!, h.listingId)}
        >
          {t(ACTION_LABEL[task.kind] ?? 'dashboard.tasks.title')}
        </button>
      ))}
      {h.finalizeHash && (
        <ExternalLink
          href={explorerTx(h.finalizeHash)}
          className="inline-flex items-center gap-1 text-xs text-ink-2 underline underline-offset-2 hover:text-ink"
        >
          {t('dashboard.holdings.finalizeTx')}
          <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
        </ExternalLink>
      )}
    </div>
  );
}

/**
 * Holdings read from the tender contracts: units (`get_rwa_balance`), the
 * contract price and value in the tender's payment asset, the contract state
 * and its id ↗. Table on desktop, cards on phones.
 */
export function HoldingsTable({
  holdings,
  tasks = [],
  perform,
  isBusy,
  variant = 'full',
}: HoldingsTableProps) {
  const { t } = useI18n();
  const full = variant === 'full' && perform && isBusy;

  return (
    <>
      {/* Desktop / tablet */}
      <div className="-mx-2 hidden overflow-x-auto sm:block">
        <table className="table-clean">
          <thead>
            <tr>
              <th scope="col">{t('dashboard.holdings.asset')}</th>
              <th scope="col" className="!text-right">
                {t('dashboard.chain.units')}
              </th>
              <th scope="col" className="!text-right">
                {t('dashboard.holdings.price')}
              </th>
              <th scope="col" className="!text-right">
                {t('dashboard.holdings.value')}
              </th>
              <th scope="col">
                <span className="sr-only">{t('dashboard.holdings.trade')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => (
              <tr key={h.contractId} className="align-top">
                <td className="min-w-[14rem]">
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={`/market/${encodeURIComponent(h.listingId)}`}
                      className="font-medium text-ink hover:underline"
                    >
                      {h.ticker}
                    </a>
                    <PositionChip holding={h} />
                  </div>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                    {h.title && <span>{h.title}</span>}
                    <ContractLink h={h} />
                  </p>
                  {full && (
                    <div className="mt-2">
                      <Actions h={h} tasks={tasks} perform={perform} isBusy={isBusy} />
                    </div>
                  )}
                </td>
                <td className="text-right">{amount(h.units)}</td>
                <td className="text-right">{h.price > 0 ? assetAmount(h.price, h.code) : '—'}</td>
                <td className="text-right font-medium">{assetAmount(h.value, h.code)}</td>
                <td className="w-10 text-right">
                  <TradeLink h={h} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phones */}
      {variant === 'preview' ? (
        <ul className="divide-y divide-line/70 sm:hidden">
          {holdings.map((h) => (
            <li key={h.contractId} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <a href={`/market/${encodeURIComponent(h.listingId)}`} className="min-w-0 flex-1">
                <span className="block font-medium text-ink">{h.ticker}</span>
                <span className="block truncate text-xs text-muted">{h.title}</span>
              </a>
              <span className="text-right tnum">
                <span className="block text-sm font-medium text-ink">{assetAmount(h.value, h.code)}</span>
                <span className="block text-xs text-muted">
                  {amount(h.units)} {t('dashboard.chain.units').toLowerCase()}
                </span>
              </span>
              <TradeLink h={h} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-3 sm:hidden">
          {holdings.map((h) => (
            <li key={h.contractId} className="rounded-2xl border border-line bg-surface-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <a href={`/market/${encodeURIComponent(h.listingId)}`} className="font-medium text-ink">
                    {h.ticker}
                  </a>
                  <p className="truncate text-xs text-muted">{h.title}</p>
                </div>
                <TradeLink h={h} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <PositionChip holding={h} />
                <ContractLink h={h} />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <dt className="text-xs text-muted">{t('dashboard.chain.units')}</dt>
                  <dd className="tnum">{amount(h.units)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">{t('dashboard.holdings.value')}</dt>
                  <dd className="tnum font-medium">{assetAmount(h.value, h.code)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">{t('dashboard.holdings.price')}</dt>
                  <dd className="tnum">{h.price > 0 ? assetAmount(h.price, h.code) : '—'}</dd>
                </div>
              </dl>
              {full && (
                <div className="mt-3">
                  <Actions h={h} tasks={tasks} perform={perform} isBusy={isBusy} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
