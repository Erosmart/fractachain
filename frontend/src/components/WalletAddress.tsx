'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export default function WalletAddress({
  address,
  compact = false,
}: {
  address?: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  if (!address) {
    return <span className="text-neutral-400 text-xs">Todavía no hay wallet</span>;
  }
  const short = address.length > 16 ? `${address.slice(0, 6)}…${address.slice(-6)}` : address;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // ignore
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={address}
      className={`inline-flex items-center gap-1.5 font-mono text-xs max-w-full min-w-0 ${compact ? '' : 'break-all text-left w-full'}`}
    >
      <span className={`min-w-0 ${compact ? 'truncate' : 'select-all break-all'}`}>{compact ? short : address}</span>
      {copied ? <Check className="w-3.5 h-3.5 shrink-0" /> : <Copy className="w-3.5 h-3.5 shrink-0" />}
      <span className="font-sans text-[10px] uppercase tracking-wide shrink-0">{copied ? 'Copiada' : 'Copiar'}</span>
    </button>
  );
}
