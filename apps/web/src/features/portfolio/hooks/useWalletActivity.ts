import { useEffect, useState } from 'react';
import { container } from '@/core/container';
import type { HorizonOperation } from '../model/activity';
import { fetchOperations } from '../model/horizon';

export type ActivityStatus = 'idle' | 'loading' | 'ready' | 'error';

/** The wallet's last operations from public Horizon (read-only, no session involved). */
export function useWalletActivity(publicKey: string | undefined) {
  const [ops, setOps] = useState<HorizonOperation[]>([]);
  const [status, setStatus] = useState<ActivityStatus>(publicKey ? 'loading' : 'idle');

  useEffect(() => {
    if (!publicKey) {
      setStatus('idle');
      setOps([]);
      return;
    }
    let alive = true;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    setStatus('loading');
    fetchOperations(publicKey, container.config.networkPassphrase, ctrl.signal)
      .then((rows) => {
        if (!alive) return;
        setOps(rows);
        setStatus('ready');
      })
      .catch(() => alive && setStatus('error'))
      .finally(() => clearTimeout(timer));
    return () => {
      alive = false;
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [publicKey]);

  return { ops, status };
}
