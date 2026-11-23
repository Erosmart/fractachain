import { useState } from 'react';
import { Check, Copy, KeyRound } from 'lucide-react';
import { Card, StatusChip } from '@/components/ui/kit';
import WalletAddress from '@/components/ui/WalletAddress';
import type { SessionUser } from '@/core/auth/SessionUser';
import { errorMessage } from '@/core/errors';
import { explorerAccount } from '@/core/format/number';
import { useI18n } from '@/hooks/useI18n';

/** Wallet address, custody mode and — for custodial wallets — the secret key on demand. */
export function WalletKeyCard({
  user,
  fetchSecret,
}: {
  user: SessionUser;
  fetchSecret: () => Promise<string>;
}) {
  const { t } = useI18n();
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const reveal = async () => {
    try {
      setError('');
      setSecret(await fetchSecret());
    } catch (err) {
      setError(errorMessage(err, t('err.opFailed')));
    }
  };

  const copy = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard blocked: the secret is selectable
    }
  };

  return (
    <Card
      title={t('dashboard.portfolio.walletTitle')}
      href={user.publicKey ? explorerAccount(user.publicKey) : undefined}
      hrefLabel={t('dashboard.activity.explorer')}
      actions={
        <StatusChip tone="sky" icon={false}>
          {user.custodyMode === 'SELF'
            ? t('dashboard.portfolio.walletSelf')
            : t('dashboard.portfolio.walletCustodial')}
        </StatusChip>
      }
    >
      <div className="rounded-xl bg-surface-2 px-3 py-2.5 text-ink">
        <WalletAddress address={user.publicKey} />
      </div>
      {user.custodyMode === 'CUSTODIAL' && !secret && (
        <button type="button" onClick={() => void reveal()} className="btn btn-ghost btn-sm mt-3 -ml-2">
          <KeyRound className="h-4 w-4" aria-hidden="true" /> {t('dashboard.portfolio.reveal')}
        </button>
      )}
      {secret && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-warn">{t('dashboard.portfolio.revealWarn')}</p>
          <code className="block break-all rounded-xl bg-surface-2 p-3 font-mono text-[11px] text-ink select-all">
            {secret}
          </code>
          <div className="flex gap-2">
            <button type="button" onClick={() => void copy()} className="btn btn-secondary btn-sm">
              {copied ? (
                <Check className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4" aria-hidden="true" />
              )}
              {copied ? t('wallet.copied') : t('wallet.copy')}
            </button>
            <button type="button" onClick={() => setSecret(null)} className="btn btn-ghost btn-sm">
              {t('dashboard.portfolio.hide')}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="mt-2 text-xs text-bad" role="alert">
          {error}
        </p>
      )}
    </Card>
  );
}
