import { Coins } from 'lucide-react';
import { Card, EmptyState } from '@/components/ui/kit';
import type { Position } from '@/core/api/types';
import { useI18n } from '@/hooks/useI18n';
import { money, shortDate } from '../model/format';
import type { TaskAction } from '../model/tasks';

interface Distribution {
  id: string;
  listingId: string;
  tokenTicker: string;
  totalUsdc: number;
  perShare: number;
  createdAt: string;
}

type WithDistributions = Position & { distributions?: Distribution[] };

/** Dividends paid by the investor's assets, and what is waiting to be collected. */
export function IncomeCard({
  positions,
  perform,
  isBusy,
}: {
  positions: Position[];
  perform: (action: TaskAction, listingId?: string) => void;
  isBusy: (action: TaskAction, listingId?: string) => boolean;
}) {
  const { t, locale } = useI18n();
  const pending = positions.filter((p) => p.pendingDividendUsdc > 0);
  const paid = (positions as WithDistributions[])
    .flatMap((p) => p.distributions ?? [])
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <Card title={t('dashboard.portfolio.incomeTitle')} subtitle={t('dashboard.portfolio.incomeSub')}>
      {pending.length > 0 && (
        <ul className="mb-4 space-y-2">
          {pending.map((p) => (
            <li
              key={p.listingId}
              className="flex items-center justify-between gap-3 rounded-xl bg-butter-soft px-3.5 py-2.5"
            >
              <span className="text-sm text-ink">
                {t('dashboard.portfolio.pendingRow', {
                  ticker: p.tokenTicker,
                  n: money(p.pendingDividendUsdc),
                })}
              </span>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={isBusy('dividend', p.listingId)}
                onClick={() => perform('dividend', p.listingId)}
              >
                {t('dashboard.tasks.dividendAction')}
              </button>
            </li>
          ))}
        </ul>
      )}
      {paid.length === 0 ? (
        pending.length === 0 && (
          <EmptyState
            icon={<Coins className="h-5 w-5" />}
            title={t('dashboard.portfolio.incomeEmpty')}
            className="!py-6"
          />
        )
      ) : (
        <div className="-mx-2 overflow-x-auto">
          <table className="table-clean">
            <thead>
              <tr>
                <th scope="col">{t('dashboard.portfolio.incomeDate')}</th>
                <th scope="col">{t('dashboard.portfolio.incomeAsset')}</th>
                <th scope="col" className="!text-right">
                  {t('dashboard.portfolio.incomePerToken')}
                </th>
                <th scope="col" className="!text-right">
                  {t('dashboard.portfolio.incomeTotal')}
                </th>
              </tr>
            </thead>
            <tbody>
              {paid.map((d) => (
                <tr key={d.id}>
                  <td>{shortDate(new Date(d.createdAt), locale)}</td>
                  <td>{d.tokenTicker}</td>
                  <td className="text-right">{money(d.perShare, 4)}</td>
                  <td className="text-right">{money(d.totalUsdc)} USDC</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
