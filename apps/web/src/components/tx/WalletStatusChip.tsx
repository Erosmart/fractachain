import { useCallback, useEffect, useState } from 'react';
import { StatusChip } from '@/components/ui/kit';
import { container } from '@/core/container';
import type { WalletDetection } from '@/core/wallet/WalletSigner';
import { useI18n } from '@/hooks/useI18n';
import { shortId } from './format';

export type WalletState = 'checking' | 'missing' | 'locked' | 'wrongNetwork' | 'mismatch' | 'ready';

/** What the detection means for an investor whose linked address is `expected`. */
export function walletState(d: WalletDetection | null, expected?: string | null): WalletState {
  if (!d) return 'checking';
  if (!d.installed) return 'missing';
  if (d.networkPassphrase && !d.networkOk) return 'wrongNetwork';
  if (!d.allowed || !d.address) return 'locked';
  if (expected && d.address !== expected) return 'mismatch';
  return 'ready';
}

/** Detects Freighter without opening it; refreshes when the tab regains focus. */
export function useWalletDetection(enabled = true) {
  const [detection, setDetection] = useState<WalletDetection | null>(null);
  const refresh = useCallback(() => {
    void container.wallet.signer
      .detect()
      .then(setDetection)
      .catch(() =>
        setDetection({
          installed: false,
          allowed: false,
          address: null,
          network: null,
          networkPassphrase: null,
          networkOk: false,
        }),
      );
  }, []);
  useEffect(() => {
    if (!enabled) return;
    refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [enabled, refresh]);
  return { detection, refresh };
}

const TONE = {
  checking: 'neutral',
  missing: 'warn',
  locked: 'neutral',
  wrongNetwork: 'bad',
  mismatch: 'warn',
  ready: 'good',
} as const;

/**
 * "Freighter · Testnet · GABC…XYZ" — the wallet status before the investor
 * clicks anything (self-custody accounts). Custodial accounts get a plain chip.
 */
export default function WalletStatusChip({
  custodial,
  expected,
  className = '',
}: {
  custodial: boolean;
  expected?: string | null;
  className?: string;
}) {
  const { t } = useI18n();
  const { detection } = useWalletDetection(!custodial);
  if (custodial) {
    return (
      <StatusChip tone="sky" className={className}>
        {t('offerings.wallet.custodial')}
      </StatusChip>
    );
  }
  const state = walletState(detection, expected);
  const label =
    state === 'wrongNetwork'
      ? t('offerings.wallet.wrongNetwork', { network: detection?.network ?? '?' })
      : state === 'ready' && detection?.address
        ? `${t('offerings.wallet.ready')} · ${shortId(detection.address)}`
        : t(`offerings.wallet.${state}`);
  return (
    <StatusChip tone={TONE[state]} className={className}>
      {label}
    </StatusChip>
  );
}
