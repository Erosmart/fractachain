import type { ReactNode } from 'react';
import ExternalLink from '@/components/ui/ExternalLink';
import { explorerAccount } from '@/core/format/number';
import { shortId } from '../../model';

/** Label/value pairs read from a contract (two columns from small screens up). */
export function Facts({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map(({ label, value }) => (
        <div key={label} className="min-w-0 border-b border-line/70 pb-2.5">
          <dt className="text-xs text-muted">{label}</dt>
          <dd className="mt-0.5 break-words text-sm text-ink tnum">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A Stellar account (G…) shortened, linked to Stellar Expert. */
export function AccountLink({ address }: { address: string | null }) {
  if (!address) return <>—</>;
  return (
    <ExternalLink
      href={explorerAccount(address)}
      title={address}
      className="font-mono text-[13px] underline decoration-line-strong underline-offset-2 hover:decoration-ink"
    >
      {shortId(address, 5, 5)}
    </ExternalLink>
  );
}

/** Amount with the payment asset the contract actually uses (never a hard-coded code). */
export function AssetAmount({ value, code, digits = 2 }: { value: number; code: string; digits?: number }) {
  return (
    <span className="tnum">
      {value.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: digits })}{' '}
      <span className="text-xs text-ink-2">{code}</span>
    </span>
  );
}
