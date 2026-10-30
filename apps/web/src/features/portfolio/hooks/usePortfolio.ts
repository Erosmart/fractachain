import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChainPortfolio } from '@fractachain/shared';
import type { Portfolio } from '@/core/api/types';
import { container } from '@/core/container';
import { explorerTx } from '@/core/format/number';
import { useTxFlow } from '@/components/tx/useTxFlow';
import { useAuth } from '@/hooks/useAuth';
import { holdingsFromChain, valueByCode, valueIn, walletFromChain } from '../model/chain';
import { tasksFor, type Task, type TaskAction } from '../model/tasks';

export type LoadStatus = 'loading' | 'ready' | 'error' | 'noWallet';

/**
 * The investor's book as Stellar has it (Instaward 1, D3): XLM and USDC
 * balances and the units held in each tender contract, read through
 * `/api/chain/portfolio`. Platform records only label the holdings and keep
 * the DEX-token bookkeeping and the company proceeds. Every action runs
 * through the one transaction flow (Freighter for self-custody).
 */
export function usePortfolio() {
  const auth = useAuth();
  const { user } = auth;
  const sessionId = user?.id ?? null;
  const address = user?.publicKey || null;
  const selfCustody = user?.custodyMode === 'SELF';
  const [chain, setChain] = useState<ChainPortfolio | null>(null);
  const [book, setBook] = useState<Portfolio | null>(null);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    if (!sessionId) return;
    if (!address) {
      setStatus('noWallet');
      return;
    }
    // Labels and DEX bookkeeping; the page works without them.
    void container.api.portfolio
      .get()
      .then(setBook)
      .catch(() => undefined);
    try {
      const data = await container.api.chain.portfolio(address);
      setChain(data);
      setLoadedAt(new Date(data.readAt || Date.now()));
      setStatus('ready');
    } catch {
      // Keep the last good read on screen; never fall back to platform balances.
      setStatus((s) => (s === 'ready' ? s : 'error'));
    }
  }, [sessionId, address]);

  useEffect(() => {
    void load();
  }, [load, user?.holdings?.length]);

  const flow = useTxFlow(() => {
    void load();
    void auth.refreshUser().catch(() => undefined);
  });

  const holdings = useMemo(() => holdingsFromChain(chain, book), [chain, book]);
  const wallet = useMemo(() => walletFromChain(chain), [chain]);
  const byCode = useMemo(() => valueByCode(holdings), [holdings]);
  const usdcCode = wallet?.usdc?.asset.code ?? 'USDC';
  const tokensValue = useMemo(() => valueIn(holdings, usdcCode), [holdings, usdcCode]);
  const tasks = useMemo(() => tasksFor(user, wallet, holdings), [user, wallet, holdings]);

  const perform = useCallback(
    (action: TaskAction, listingId?: string) => {
      const id = listingId ?? '';
      switch (action) {
        case 'enableUsdc':
          return flow.prepare({ action: 'usdc_trustline' }, address);
        case 'fundUsdc':
          return flow.custodial('fund', async () => {
            const res = await container.api.wallet.fundUsdc();
            const hash = res?.hash ?? null;
            return { hash, explorer: hash ? explorerTx(hash) : null };
          });
        case 'refund':
          return selfCustody
            ? flow.prepare({ action: 'refund', listingId: id }, address)
            : flow.custodial('refund', async () => {
                const data = await auth.refundContribution(id);
                const hash = data?.onChain?.hash ?? null;
                return { hash, explorer: data?.onChain?.explorer ?? (hash ? explorerTx(hash) : null) };
              });
        case 'approve':
          return flow.custodial('trustline', async () => void (await auth.approveToken(id)));
        case 'claim':
          return flow.custodial('distribute', async () => {
            const data = await auth.claimTokens(id);
            if (data?.distribution?.error) throw new Error(data.distribution.error);
            const hash = data?.distribution?.hash ?? null;
            return { hash, explorer: hash ? explorerTx(hash) : null };
          });
        case 'distribute':
          return flow.custodial('distribute', async () => {
            const data = await auth.distributeTokens(id);
            const hash = data?.hash ?? null;
            return { hash, explorer: hash ? explorerTx(hash) : null };
          });
      }
    },
    [auth, flow, address, selfCustody],
  );

  const performTask = (task: Task) => (task.action ? perform(task.action, task.listingId) : undefined);
  /** One action at a time: the flow shows which one runs. */
  const isBusy = (_action: TaskAction, _listingId?: string) => flow.busy;

  return {
    user,
    book,
    chain,
    wallet,
    holdings,
    byCode,
    tokensValue,
    usdcCode,
    status,
    loadedAt,
    tasks,
    flow,
    reload: load,
    perform,
    performTask,
    isBusy,
    fetchWalletSecret: auth.fetchWalletSecret,
  };
}

export type PortfolioState = ReturnType<typeof usePortfolio>;
