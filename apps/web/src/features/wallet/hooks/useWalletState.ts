import { useCallback, useEffect, useState } from 'react';
import type { WalletState } from '@/core/api/types';
import { container } from '@/core/container';

const { api } = container;

/** Balances of the signed-in wallet, read from the network through the API. */
export function useWalletState(publicKey: string | undefined) {
  const [state, setState] = useState<WalletState | null>(null);
  const [loading, setLoading] = useState(Boolean(publicKey));
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    if (!publicKey) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setState(await api.wallet.state(publicKey));
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [publicKey]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { state, loading, failed, reload };
}
