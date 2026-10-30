import { ArrowUpRight } from 'lucide-react';
import ExternalLink from '@/components/ui/ExternalLink';
import type { Position } from '@/core/api/types';
import { explorerTx } from '@/core/format/number';
import { useI18n } from '@/hooks/useI18n';
import { amount, money, signed, signedPct } from '../model/format';
import { averagePrice } from '../model/positions';
import type { Task, TaskAction } from '../model/tasks';
import { PositionChip } from './PositionChip';

export interface HoldingsTableProps {
  positions: Position[];
  /** Pending tasks; the ones with an action on a position become its buttons. */
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
  dividend: 'dashboard.tasks.dividendAction',
};

const pnlClass = (n: number) => (n > 0 ? 'text-good' : n < 0 ? 'text-bad' : 'text-ink-2');

function TradeLink({ p }: { p: Position }) {
  const { t } = useI18n();
  return (
    <a
      href={`/orderbook?listing=${encodeURIComponent(p.listingId)}`}
      className="arrow-btn"
      aria-label={t('dashboard.holdings.tradeAria', { ticker: p.tokenTicker })}
      title={t('dashboard.holdings.trade')}
    >
      <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
    </a>
  );
}

function Actions({
  p,
  tasks,
  perform,
  isBusy,
}: Required<Pick<HoldingsTableProps, 'perform' | 'isBusy'>> & { p: Position; tasks: Task[] }) {
  const { t } = useI18n();
  const mine = tasks.filter((task) => task.listingId === p.listingId && task.action && !task.done);
  if (!mine.length && !p.finalizeHash && !p.refundHash) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {mine.map((task) => (
        <button
          key={task.id}
          type="button"
          className={`btn btn-sm ${task.kind === 'trustline' || task.kind === 'claim' ? 'btn-primary' : 'btn-secondary'}`}
          disabled={isBusy(task.action!, p.listingId)}
          aria-busy={isBusy(task.action!, p.listingId)}
          onClick={() => perform(task.action!, p.listingId)}
        >
          {t(ACTION_LABEL[task.kind] ?? 'dashboard.holdings.actions')}
        </button>
      ))}
      {p.finalizeHash && (
        <ExternalLink
          href={explorerTx(p.finalizeHash)}
          className="text-xs text-ink-2 underline underline-offset-2 hover:text-ink"
        >
          {t('dashboard.holdings.finalizeTx')}
        </ExternalLink>
      )}
      {p.refundHash && (
        <ExternalLink
          href={explorerTx(p.refundHash)}
          className="text-xs text-ink-2 underline underline-offset-2 hover:text-ink"
        >
          {t('dashboard.holdings.refundTx')}
        </ExternalLink>
      )}
    </div>
  );
}

/**
 * Holdings: a table on desktop, one card per asset on phones. Values are in
 * USDC; P/L carries its sign (never color alone).
 */
export function HoldingsTable({
  positions,
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
                {t('dashboard.holdings.qty')}
              </th>
              {variant === 'full' && (
                <th scope="col" className="!text-right">
                  {t('dashboard.holdings.avg')}
                </th>
              )}
              <th scope="col" className="!text-right">
                {t('dashboard.holdings.price')}
              </th>
              <th scope="col" className="!text-right">
                {t('dashboard.holdings.value')}
              </th>
              <th scope="col" className="!text-right">
                {t('dashboard.holdings.result')}
              </th>
              <th scope="col">
                <span className="sr-only">{t('dashboard.holdings.trade')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <tr key={p.listingId} className="align-top">
                <td className="min-w-[14rem]">
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={`/market/${encodeURIComponent(p.listingId)}`}
                      className="font-medium text-ink hover:underline"
                    >
                      {p.tokenTicker}
                    </a>
                    <PositionChip position={p} />
                  </div>
                  <p className="mt-0.5 text-xs text-muted">{p.legalName}</p>
                  {full && (
                    <div className="mt-2">
                      <Actions p={p} tasks={tasks} perform={perform} isBusy={isBusy} />
                    </div>
                  )}
                </td>
                <td className="text-right">
                  {amount(p.shares)}
                  {variant === 'full' && p.tokensOwed > 0 && (
                    <span className="block text-xs text-muted">
                      {t('dashboard.holdings.owed', { n: amount(p.tokensOwed) })}
                    </span>
                  )}
                </td>
                {variant === 'full' && <td className="text-right">{money(averagePrice(p))}</td>}
                <td className="text-right">
                  {p.marketPrice > 0 ? money(p.marketPrice) : '—'}
                  {variant === 'full' && (
                    <span className="block text-xs text-muted">{p.priceSourceLabel}</span>
                  )}
                </td>
                <td className="text-right font-medium">{money(p.marketValue)}</td>
                <td className={`text-right ${pnlClass(p.pnl)}`}>
                  {signed(p.pnl)}
                  <span className="block text-xs">{signedPct(p.pnlPct)}</span>
                </td>
                <td className="w-10 text-right">
                  <TradeLink p={p} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phones */}
      {variant === 'preview' ? (
        <ul className="divide-y divide-line/70 sm:hidden">
          {positions.map((p) => (
            <li key={p.listingId} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <a href={`/market/${encodeURIComponent(p.listingId)}`} className="min-w-0 flex-1">
                <span className="block font-medium text-ink">{p.tokenTicker}</span>
                <span className="block truncate text-xs text-muted">{p.legalName}</span>
              </a>
              <span className="text-right tnum">
                <span className="block text-sm font-medium text-ink">{money(p.marketValue)}</span>
                <span className={`block text-xs ${pnlClass(p.pnl)}`}>{signedPct(p.pnlPct)}</span>
              </span>
              <TradeLink p={p} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-3 sm:hidden">
          {positions.map((p) => (
            <li key={p.listingId} className="rounded-2xl border border-line bg-surface-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <a href={`/market/${encodeURIComponent(p.listingId)}`} className="font-medium text-ink">
                    {p.tokenTicker}
                  </a>
                  <p className="truncate text-xs text-muted">{p.legalName}</p>
                </div>
                <TradeLink p={p} />
              </div>
              <div className="mt-2">
                <PositionChip position={p} />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <dt className="text-xs text-muted">{t('dashboard.holdings.qty')}</dt>
                  <dd className="tnum">{amount(p.shares)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">{t('dashboard.holdings.value')}</dt>
                  <dd className="tnum font-medium">{money(p.marketValue)} USDC</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">{t('dashboard.holdings.avg')}</dt>
                  <dd className="tnum">{money(averagePrice(p))}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">{t('dashboard.holdings.result')}</dt>
                  <dd className={`tnum ${pnlClass(p.pnl)}`}>
                    {signed(p.pnl)} · {signedPct(p.pnlPct)}
                  </dd>
                </div>
              </dl>
              {full && (
                <div className="mt-3">
                  <Actions p={p} tasks={tasks} perform={perform} isBusy={isBusy} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
