import { ArrowUpRight, Check, Loader2, PenLine, X } from 'lucide-react';
import ExternalLink from '@/components/ui/ExternalLink';

export type OpState = 'signing' | 'pending' | 'confirmed' | 'done' | 'failed';

export interface OpStatusValue {
  state: OpState;
  message: string;
  hash?: string | null;
  explorer?: string | null;
  /** Raw technical error (contract trap, RPC dump), kept behind a disclosure. */
  detail?: string;
}

const TECHNICAL = /HostError|simulation failed|Error\(|Diagnostic|tx_failed|op_[a-z_]+/i;

/**
 * Splits an error into a friendly message and its technical detail: contract
 * traps and RPC dumps are not something to show an investor verbatim.
 */
export function humanizeError(raw: string, friendly: string): Pick<OpStatusValue, 'message' | 'detail'> {
  return TECHNICAL.test(raw) || raw.length > 180 ? { message: friendly, detail: raw } : { message: raw };
}

const STYLE = {
  signing: { cls: 'bg-sky-soft text-ink', Icon: PenLine, spin: false },
  pending: { cls: 'bg-sky-soft text-ink', Icon: Loader2, spin: true },
  confirmed: { cls: 'bg-good-soft text-good', Icon: Check, spin: false },
  done: { cls: 'bg-good-soft text-good', Icon: Check, spin: false },
  failed: { cls: 'bg-bad-soft text-bad', Icon: X, spin: false },
} as const;

/**
 * Status of the last operation (icon + label + message, Stellar Expert link
 * when there is a hash). The live region stays mounted so every update is
 * announced politely.
 */
export default function OpStatus({
  tx,
  title,
  stateLabel,
  regionLabel,
  viewLabel,
  detailLabel,
  className = '',
}: {
  tx: OpStatusValue | null;
  /** What the operation was ("Aporte"), shown before the state. */
  title?: string;
  stateLabel: (state: OpState) => string;
  regionLabel: string;
  viewLabel: string;
  detailLabel: string;
  className?: string;
}) {
  const style = tx ? STYLE[tx.state] : null;
  const label = tx ? stateLabel(tx.state) : '';
  return (
    <div aria-live="polite" aria-label={regionLabel} className={className}>
      {tx && style && (
        <div className={`rounded-xl px-3.5 py-3 text-sm ${style.cls}`}>
          <p className="flex items-center gap-2 font-medium">
            <style.Icon
              className={`h-4 w-4 shrink-0 ${style.spin ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            {title ? `${title} · ${label}` : label}
          </p>
          {tx.message && tx.message !== label && <p className="mt-1 text-[13px] text-ink-2">{tx.message}</p>}
          {tx.detail && (
            <details className="mt-1.5 text-xs text-ink-2">
              <summary className="cursor-pointer font-medium">{detailLabel}</summary>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-surface/70 p-2 font-mono text-[11px]">
                {tx.detail}
              </pre>
            </details>
          )}
          {tx.explorer && (
            <ExternalLink
              href={tx.explorer}
              className="mt-1.5 inline-flex items-center gap-1 text-[13px] font-medium text-ink underline underline-offset-2"
            >
              {viewLabel}
              {tx.hash ? <span className="font-mono text-xs text-ink-2">{tx.hash.slice(0, 10)}…</span> : null}
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </ExternalLink>
          )}
        </div>
      )}
    </div>
  );
}
