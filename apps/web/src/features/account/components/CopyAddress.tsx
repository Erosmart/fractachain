import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';

export function shortAddress(address: string): string {
  return address.length > 16 ? `${address.slice(0, 6)}…${address.slice(-6)}` : address;
}

/** Stellar address with a copy button; the full key stays selectable. */
export default function CopyAddress({ address, full = false }: { address: string; full?: boolean }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await window.navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard blocked: the address stays selectable
    }
  };
  return (
    <span className="flex min-w-0 items-center gap-2">
      <code
        className={`min-w-0 select-all font-mono text-[13px] text-ink ${full ? 'break-all' : 'truncate'}`}
        title={address}
      >
        {full ? address : shortAddress(address)}
      </code>
      <button
        type="button"
        onClick={() => void copy()}
        className="icon-btn h-8 w-8 rounded-lg"
        aria-label={copied ? t('account.wallet.copied') : t('account.wallet.copy')}
        title={copied ? t('account.wallet.copied') : t('account.wallet.copy')}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? t('account.wallet.copied') : ''}
      </span>
    </span>
  );
}
