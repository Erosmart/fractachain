import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Portfolio } from '@/core/api/types';
import { container } from '@/core/container';
import { errorMessage } from '@/core/errors';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';
import { positionsFrom, totalsFrom } from '../model/positions';
import { tasksFor, type Task, type TaskAction } from '../model/tasks';

export type LoadStatus = 'loading' | 'ready' | 'error';

export interface ActionMessage {
  tone: 'good' | 'bad';
  text: string;
}

/**
 * The investor's book (positions marked to market, balances, proceeds) plus
 * every action on it. Shared by Inicio and Portfolio; each action reloads the
 * book and reports through one message slot (announced via aria-live).
 */
export function usePortfolio() {
  const auth = useAuth();
  const { user } = auth;
  const sessionId = user?.id ?? null;
  const { t } = useI18n();
  const [book, setBook] = useState<Portfolio | null>(null);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<ActionMessage | null>(null);

  const load = useCallback(async () => {
    if (!sessionId) return;
    try {
      const data = await container.api.portfolio.get();
      setBook(data);
      setLoadedAt(new Date());
      setStatus('ready');
    } catch {
      // Keep the last good book on screen; only the first load shows an error.
      setStatus((s) => (s === 'ready' ? s : 'error'));
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load, user?.holdings?.length, user?.cashUsdc]);

  const positions = useMemo(
    () => positionsFrom(book, user?.holdings, t('misc.loadingQuote')),
    [book, user?.holdings, t],
  );
  const totals = useMemo(() => totalsFrom(book, positions), [book, positions]);
  const tasks = useMemo(() => tasksFor(user, book, positions), [user, book, positions]);

  const run = useCallback(
    async (key: string, fn: () => Promise<unknown>, done?: string) => {
      setBusy(key);
      setMessage(null);
      try {
        const result = await fn();
        await load();
        setMessage({
          tone: 'good',
          text: typeof result === 'string' ? result : (done ?? t('dashboard.portfolio.actionDone')),
        });
      } catch (err) {
        setMessage({ tone: 'bad', text: errorMessage(err, t('err.opFailed')) });
      } finally {
        setBusy(null);
      }
    },
    [load, t],
  );

  /** Tops the wallet up to the USDC grant (self-custody signs one trustline in Freighter). */
  const fundUsdc = useCallback(
    () =>
      run('fundUsdc', async () => {
        const data = await container.wallet.usdcFunding.ensureReady();
        return data?.already
          ? t('wallet.usdcAlready', { n: Number(data.balance).toLocaleString('es-AR') })
          : t('wallet.usdcFunded', { n: Number(data?.balance ?? 0).toLocaleString('es-AR') });
      }),
    [run, t],
  );

  const perform = useCallback(
    (action: TaskAction, listingId?: string) => {
      const id = listingId ?? '';
      switch (action) {
        case 'fundUsdc':
          return fundUsdc();
        case 'approve':
          return run(`approve-${id}`, () => auth.approveToken(id));
        case 'claim':
          return run(`claim-${id}`, () => auth.claimTokens(id));
        case 'distribute':
          return run(`dist-${id}`, () => auth.distributeTokens(id));
        case 'refund':
          return run(`refund-${id}`, () => auth.refundContribution(id));
        case 'dividend':
          return run(`div-${id}`, () => auth.claimDividends(id));
      }
    },
    [auth, fundUsdc, run],
  );

  const busyKeyFor = (action: TaskAction, listingId?: string) =>
    action === 'fundUsdc'
      ? 'fundUsdc'
      : `${{ approve: 'approve', claim: 'claim', distribute: 'dist', refund: 'refund', dividend: 'div' }[action]}-${listingId ?? ''}`;

  const performTask = (task: Task) => (task.action ? perform(task.action, task.listingId) : undefined);
  const isBusy = (action: TaskAction, listingId?: string) => busy === busyKeyFor(action, listingId);

  return {
    user,
    book,
    status,
    loadedAt,
    positions,
    totals,
    tasks,
    reload: load,
    perform,
    performTask,
    isBusy,
    busy,
    run,
    message,
    clearMessage: () => setMessage(null),
    fetchWalletSecret: auth.fetchWalletSecret,
  };
}

export type PortfolioState = ReturnType<typeof usePortfolio>;
