import { useCallback, useMemo, useRef, useState } from 'react';
import type { TxBuildRequest } from '@fractachain/shared';
import { container } from '@/core/container';
import { IDLE, TxRunner, type TxSnapshot } from '@/core/wallet/TxRunner';

/**
 * React binding of the single transaction flow. Self-custody: `prepare` →
 * review → `sign`. Custodial fallback: `custodial(action, fn)`. Every step
 * re-renders through one snapshot; `onSettled` runs once per finished
 * transaction (reload the page data there).
 */
export function useTxFlow(onSettled?: (snap: TxSnapshot) => void) {
  const [snap, setSnap] = useState<TxSnapshot>(IDLE);
  const settled = useRef(onSettled);
  settled.current = onSettled;
  const runner = useMemo(
    () =>
      new TxRunner(container.api.tx, container.wallet.signer, (next) => {
        setSnap(next);
        if (next.phase === 'done') settled.current?.(next);
      }),
    [],
  );
  const prepare = useCallback(
    (request: TxBuildRequest, expectedSigner?: string | null) => runner.prepare(request, expectedSigner),
    [runner],
  );
  const sign = useCallback(() => runner.sign(), [runner]);
  const retry = useCallback(() => runner.retry(), [runner]);
  const resign = useCallback(() => runner.backToReview(), [runner]);
  const reset = useCallback(() => runner.reset(), [runner]);
  const custodial = useCallback(
    (action: string, perform: Parameters<TxRunner['runCustodial']>[1]) =>
      runner.runCustodial(action, perform),
    [runner],
  );
  /** Something is in flight (the wallet or the network): other actions wait. */
  const busy = ['preparing', 'signing', 'submitting', 'confirming'].includes(snap.phase);
  /** A transaction is open, including the review step waiting for the investor. */
  const active = busy || snap.phase === 'review';

  return { snap, busy, active, prepare, sign, retry, resign, reset, custodial };
}

export type TxFlow = ReturnType<typeof useTxFlow>;
