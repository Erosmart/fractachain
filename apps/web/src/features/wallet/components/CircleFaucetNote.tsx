import { ExternalLink as ExternalIcon } from 'lucide-react';
import ExternalLink from '@/components/ui/ExternalLink';
import CopyAddress from '@/features/account/components/CopyAddress';
import { useI18n } from '@/hooks/useI18n';

export const CIRCLE_FAUCET_URL = 'https://faucet.circle.com';

/**
 * Plan B for test USDC when the platform's demo pool is not set up: Circle's
 * public faucet (Stellar Testnet) paying straight to the investor's address.
 */
export default function CircleFaucetNote({
  address,
  className = '',
}: {
  address: string;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <div className={`rounded-xl bg-sky-soft px-3.5 py-3 text-sm text-ink ${className}`} role="status">
      <p className="font-medium">{t('account.walletPage.faucetTitle')}</p>
      <p className="mt-1 text-[13px] text-ink-2">{t('account.walletPage.faucetBody')}</p>
      <div className="mt-2 rounded-lg border border-line bg-surface px-3 py-2">
        <CopyAddress address={address} full />
      </div>
      <ExternalLink href={CIRCLE_FAUCET_URL} className="btn btn-secondary btn-sm mt-3">
        {t('account.walletPage.faucetCta')}
        <ExternalIcon className="h-3.5 w-3.5" aria-hidden="true" />
      </ExternalLink>
    </div>
  );
}
