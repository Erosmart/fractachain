import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, Download, Loader2, PenLine, RotateCcw, ShieldCheck, X } from 'lucide-react';
import ExternalLink from '@/components/ui/ExternalLink';
import { explorerAccount, explorerContract } from '@/core/format/number';
import { WALLET_CODES, type TxSnapshot } from '@/core/wallet/TxRunner';
import { useI18n } from '@/hooks/useI18n';
import { feeXlm, reviewArgs, shortId } from './format';

const FREIGHTER_URL = 'https://www.freighter.app/';

const TONE = {
  progress: 'bg-sky-soft text-ink',
  review: 'bg-surface text-ink ring-1 ring-line',
  good: 'bg-good-soft text-good',
  bad: 'bg-bad-soft text-bad',
} as const;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3 border-b border-line/70 py-2 last:border-b-0">
      <dt className="shrink-0 text-xs text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right text-[13px] text-ink tnum">{children}</dd>
    </div>
  );
}

function Countdown({ until }: { until: string }) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const left = Math.max(0, Math.round((Date.parse(until) - now) / 1000));
  return <>{t('offerings.flow.review.expiresIn', { n: left })}</>;
}

/**
 * The one transaction display (Instaward 1): what will be signed, where the
 * transaction is, and how it ended — hash and Stellar Expert link, or a
 * precise reason with the next step. Lives in an aria-live region; the review
 * step is the only one that asks for input.
 */
export default function TxPanel({
  snap,
  onSign,
  onRetry,
  onResign,
  onClose,
  className = '',
}: {
  snap: TxSnapshot;
  onSign: () => void;
  onRetry: () => void;
  /** Back to the review to sign the same transaction again (wallet errors). */
  onResign?: () => void;
  onClose: () => void;
  className?: string;
}) {
  const { t } = useI18n();
  const k = (key: string, vars?: Record<string, string | number>) => t(`offerings.flow.${key}`, vars);
  const title = snap.action ? k(`actions.${snap.action}`) : '';
  const root = useRef<HTMLDivElement>(null);

  // Bring the panel into view when it needs the investor (review, result).
  useEffect(() => {
    if (snap.phase !== 'review' && snap.phase !== 'done' && snap.phase !== 'error') return;
    root.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (snap.phase === 'review')
      root.current?.querySelector<HTMLButtonElement>('button.btn-primary')?.focus({ preventScroll: true });
  }, [snap.phase]);
  const build = snap.build;

  let body: React.ReactNode = null;
  let tone: keyof typeof TONE = 'progress';
  let Icon = Loader2;
  let spin = true;
  let heading = snap.phase === 'idle' ? '' : k(`phases.${snap.phase}`);

  switch (snap.phase) {
    case 'preparing':
    case 'confirming':
      break;
    case 'submitting':
      if (snap.custodial) body = <p className="mt-1 text-[13px] text-ink-2">{k('custodialSubmitting')}</p>;
      break;
    case 'signing':
      Icon = PenLine;
      spin = false;
      body = <p className="mt-1 text-[13px] text-ink-2">{k('signingHint')}</p>;
      break;
    case 'review':
      tone = 'review';
      Icon = ShieldCheck;
      spin = false;
      body = build ? (
        <>
          <dl className="mt-2">
            {build.contractId && (
              <Row label={k('review.contract')}>
                <ExternalLink
                  href={explorerContract(build.contractId)}
                  className="inline-flex items-center gap-1 font-mono text-xs underline-offset-2 hover:underline"
                >
                  {shortId(build.contractId)}
                  <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                </ExternalLink>
              </Row>
            )}
            {build.function && (
              <Row label={k('review.function')}>
                <span className="font-mono text-xs">{build.function}()</span>
              </Row>
            )}
            {reviewArgs(build)
              .filter((a) => !/^(buyer|investor|user|from|source)$/i.test(a.name))
              .map((a) => (
                <Row key={a.name} label={/amount/i.test(a.name) ? k('review.amount') : a.name}>
                  {a.value}
                </Row>
              ))}
            {build.asset && (
              <Row label={k('review.asset')}>
                <ExternalLink
                  href={build.asset.explorer || explorerContract(build.asset.contractId)}
                  className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
                >
                  {build.asset.code} ·{' '}
                  <span className="font-mono text-xs">{shortId(build.asset.contractId)}</span>
                  <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                </ExternalLink>
              </Row>
            )}
            <Row label={k('review.signer')}>
              <ExternalLink
                href={explorerAccount(build.source)}
                className="font-mono text-xs underline-offset-2 hover:underline"
              >
                {shortId(build.source)}
              </ExternalLink>
            </Row>
            <Row label={k('review.network')}>{build.network}</Row>
            <Row label={k('review.fee')}>{feeXlm(build.fee)}</Row>
            <Row label={k('review.expires')}>
              <Countdown until={build.expiresAt} />
            </Row>
          </dl>
          <p className="mt-2 text-xs text-muted">{k('review.note')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary flex-1" onClick={onSign}>
              <PenLine className="h-4 w-4" aria-hidden="true" />
              {k('review.sign')}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {k('review.cancel')}
            </button>
          </div>
        </>
      ) : null;
      break;
    case 'done':
      tone = 'good';
      Icon = Check;
      spin = false;
      body = (
        <p className="mt-1 text-[13px] text-ink-2">
          {snap.custodial && !snap.outcome?.hash ? k('doneCustodial') : k('done')}
        </p>
      );
      break;
    case 'error': {
      tone = 'bad';
      Icon = X;
      spin = false;
      const err = snap.error;
      const facts = {
        network: err?.facts?.network ?? '—',
        expected: err?.facts?.expected ? shortId(err.facts.expected) : '—',
        actual: err?.facts?.actual ? shortId(err.facts.actual) : '—',
      };
      const text = err
        ? err.code === 'UNKNOWN' && err.message
          ? err.message
          : k(`errors.${err.code}`, facts)
        : '';
      body = (
        <>
          <p className="mt-1 text-[13px] text-ink-2">{text}</p>
          {err?.detail || (err && !WALLET_CODES.has(err.code) && err.code !== 'UNKNOWN' && err.message) ? (
            <details className="mt-1.5 text-xs text-ink-2">
              <summary className="cursor-pointer font-medium">{k('detail')}</summary>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-surface/70 p-2 font-mono text-[11px]">
                {err?.detail || err?.message}
              </pre>
            </details>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {err?.code === 'WALLET_NOT_INSTALLED' && (
              <ExternalLink href={FREIGHTER_URL} className="btn btn-primary btn-sm">
                <Download className="h-4 w-4" aria-hidden="true" />
                {k('install')}
              </ExternalLink>
            )}
            {err &&
              WALLET_CODES.has(err.code) &&
              err.code !== 'WALLET_NOT_INSTALLED' &&
              snap.build &&
              onResign && (
                <button type="button" className="btn btn-primary btn-sm" onClick={onResign}>
                  <PenLine className="h-4 w-4" aria-hidden="true" />
                  {k('resign')}
                </button>
              )}
            {err?.retryable && !snap.custodial && (
              <button type="button" className="btn btn-primary btn-sm" onClick={onRetry}>
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                {k('retry')}
              </button>
            )}
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
              {k('close')}
            </button>
          </div>
        </>
      );
      heading = k('phases.error');
      break;
    }
  }

  const hash = snap.outcome?.hash;
  const explorer = snap.outcome?.explorer;
  return (
    <div ref={root} aria-live="polite" aria-label={k('region')} className={`scroll-mt-28 ${className}`}>
      {snap.phase !== 'idle' && (
        <div className={`rounded-xl px-3.5 py-3 text-sm ${TONE[tone]}`}>
          <p className="flex items-center gap-2 font-medium">
            <Icon className={`h-4 w-4 shrink-0 ${spin ? 'animate-spin' : ''}`} aria-hidden="true" />
            {title ? `${title} · ${heading}` : heading}
          </p>
          {body}
          {hash && explorer && (
            <ExternalLink
              href={explorer}
              className="mt-1.5 inline-flex items-center gap-1 text-[13px] font-medium text-ink underline underline-offset-2"
            >
              {k('view')}
              <span className="font-mono text-xs text-ink-2">{hash.slice(0, 10)}…</span>
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </ExternalLink>
          )}
          {snap.phase === 'done' && (
            <div className="mt-2">
              <button
                type="button"
                className="text-xs font-medium text-ink-2 underline underline-offset-2"
                onClick={onClose}
              >
                {k('close')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
