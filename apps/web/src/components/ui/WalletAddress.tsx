import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';

/** Stellar address with copy-to-clipboard. `compact` shows `GABC12…XYZ789`. */
export default function WalletAddress({ address, compact = false }: { address?: string; compact?: boolean }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  if (!address) {
    return <span className="text-xs text-muted">{t('misc.noWallet')}</span>;
  }
  const short = address.length > 16 ? `${address.slice(0, 6)}…${address.slice(-6)}` : address;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard blocked: the address stays selectable
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={address}
      className={`group inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md text-xs text-ink ${
        compact ? '' : 'w-full text-left'
      }`}
    >
      <span className={`min-w-0 font-mono ${compact ? 'truncate' : 'select-all break-all'}`}>
        {compact ? short : address}
      </span>
      {copied ? (
        <Check className="h-3.5 w-3.5 shrink-0 text-good" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5 shrink-0 text-muted group-hover:text-ink" aria-hidden="true" />
      )}
      <span className="shrink-0 text-[11px] text-muted group-hover:text-ink" aria-live="polite">
        {copied ? t('misc.copied') : t('misc.copy')}
      </span>
    </button>
  );
}
