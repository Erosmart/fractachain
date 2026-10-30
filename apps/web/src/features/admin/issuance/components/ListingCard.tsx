import { useState, type ReactNode } from 'react';
import { ArrowUpRight, Check } from 'lucide-react';
import type { Listing } from '@fractachain/shared';
import { CapProgress, StatusChip } from '@/components/ui/kit';
import { explorerContract, explorerTx } from '@/core/format/number';
import { useI18n } from '@/hooks/useI18n';
import { CopyValue } from '../../shared/CopyValue';
import { formatDateTime } from '../../shared/datetime';
import type { IssuanceAdmin } from '../hooks/useIssuanceAdmin';
import { nextAction, STAGE_TONE, stageOf } from '../model';
import { assetFormat } from './PipelineBoard';

interface ListingCardProps {
  listing: Listing;
  admin: IssuanceAdmin;
  mintAmount: number;
  onMintAmount: (n: number) => void;
  dividendAmount: number;
  onDividendAmount: (n: number) => void;
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 min-w-0 text-sm text-ink">{children}</dd>
    </div>
  );
}

/** One row of the lifecycle: check when done, the next step is the primary button. */
function Step({
  index,
  done,
  current,
  title,
  children,
}: {
  index: number;
  done: boolean;
  current: boolean;
  title: string;
  children?: ReactNode;
}) {
  return (
    <li
      className={`rounded-2xl border px-3.5 py-3 ${current ? 'border-sky-strong/40 bg-sky-soft/50' : 'border-line bg-surface'}`}
      aria-current={current ? 'step' : undefined}
    >
      <div className={`flex items-center gap-2.5 ${children ? 'mb-2' : ''}`}>
        <span
          className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-semibold ${
            done
              ? 'bg-navy text-navy-ink'
              : current
                ? 'bg-sky-strong/15 text-ink'
                : 'bg-ink/[0.06] text-ink-2'
          }`}
          aria-hidden="true"
        >
          {done ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : index}
        </span>
        <span className="text-sm font-medium text-ink">{title}</span>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </li>
  );
}

/** Steps 2–4 for one listing: payout wallet, deploy, mint, open, close, dividends. */
export default function ListingCard({
  listing: l,
  admin,
  mintAmount,
  onMintAmount,
  dividendAmount,
  onDividendAmount,
}: ListingCardProps) {
  const { t, locale } = useI18n();
  const { busy } = admin;
  const [wallet, setWallet] = useState(l.dossier.proceedsWallet || '');
  const walletEditable = !(l.raisedUsdc > 0);
  const stage = stageOf(l, admin.paying.has(l.id));
  const next = nextAction(l);
  const fmt = assetFormat(l);
  const isXlm = l.dossier.paymentKind === 'XLM';
  const closed = l.status === 'CLOSED_SUCCESS' || l.status === 'CLOSED_FAILED';
  const walletId = `wallet-${l.id}`;
  // Steps stay available while they can still apply (the API re-validates each one).
  const canMint = l.status !== 'DRAFT' && !closed;
  const canOpen = l.status === 'DEPLOYED' || l.status === 'TOKENS_MINTED';
  const btn = (action: NonNullable<ReturnType<typeof nextAction>>) =>
    `btn btn-sm ${next === action ? 'btn-primary' : 'btn-secondary'}`;

  const payoutNote = l.proceedsPaidAt
    ? t('admIss.paidAt', { d: formatDateTime(l.proceedsPaidAt, locale) })
    : l.status === 'CLOSED_SUCCESS'
      ? t('admIss.closedNoPay')
      : t('admIss.paysOnClose');

  return (
    <article id={`listing-${l.id}`} className="card card-pad min-w-0 scroll-mt-24">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-medium tracking-[-0.01em] text-ink">
            {l.dossier.tokenTicker || l.dossier.ticker}
            <span className="text-ink-2"> · {l.dossier.legalName}</span>
          </h3>
          <p className="mt-0.5 truncate font-mono text-xs text-muted">{l.id}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone="neutral" icon={false}>
            {isXlm ? 'XLM' : 'USDC'}
          </StatusChip>
          <StatusChip tone={STAGE_TONE[stage]}>{t(`admin.issuance.stage.${stage}`)}</StatusChip>
        </div>
      </header>

      <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          <CapProgress
            raised={l.raisedUsdc}
            softCap={l.dossier.offeringSoftCapUsdc}
            hardCap={l.dossier.offeringHardCapUsdc}
            format={fmt}
          />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
            <Meta label={t('admin.issuance.raised')}>
              <span className="tnum">{fmt(l.raisedUsdc)}</span>
            </Meta>
            <Meta label={t('admin.issuance.minted')}>
              <span className="tnum">
                {l.tokensMinted.toLocaleString(locale === 'en' ? 'en-US' : 'es-AR')} /{' '}
                {l.dossier.sharesToTokenize.toLocaleString(locale === 'en' ? 'en-US' : 'es-AR')}
              </span>
            </Meta>
            <Meta label={t('admin.issuance.policy')}>
              {l.settlePolicy === 'ON_DATE'
                ? t('admIss.distDate', { d: formatDateTime(l.settleAt, locale) })
                : t('admIss.distMin')}
            </Meta>
          </dl>

          {(l.stockContract || l.licitacionContract || l.finalizeHash) && (
            <div>
              <p className="eyebrow mb-2">{t('admin.issuance.contracts')}</p>
              <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-3">
                {l.stockContract && (
                  <Meta label={t('admin.issuance.stockContract')}>
                    <CopyValue value={l.stockContract} href={explorerContract(l.stockContract)} />
                  </Meta>
                )}
                {l.licitacionContract && (
                  <Meta label={t('admin.issuance.licitacionContract')}>
                    <CopyValue value={l.licitacionContract} href={explorerContract(l.licitacionContract)} />
                  </Meta>
                )}
                {l.finalizeHash && (
                  <Meta label={t('admin.issuance.finalizeTx')}>
                    <CopyValue value={l.finalizeHash} href={explorerTx(l.finalizeHash)} />
                  </Meta>
                )}
              </dl>
            </div>
          )}

          <div className="rounded-2xl bg-surface-2 p-4">
            <p className="text-sm font-medium text-ink">{t('admin.issuance.payout')}</p>
            {walletEditable ? (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <label htmlFor={walletId} className="sr-only">
                  {t('admIss.walletPh')}
                </label>
                <input
                  id={walletId}
                  placeholder={t('admIss.walletPh')}
                  value={wallet}
                  onChange={(e) => setWallet(e.target.value)}
                  className="input font-mono text-xs"
                  spellCheck={false}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => admin.saveProceedsWallet(l.id, wallet)}
                  disabled={Boolean(busy)}
                  className="btn btn-secondary shrink-0"
                >
                  {t('admIss.saveWallet')}
                </button>
              </div>
            ) : (
              <div className="mt-2">
                {l.dossier.proceedsWallet ? (
                  <CopyValue value={l.dossier.proceedsWallet} head={8} tail={8} />
                ) : (
                  <span className="text-sm text-muted">{t('admIss.notConfigured')}</span>
                )}
              </div>
            )}
            <p className="mt-2 text-xs text-muted">{payoutNote}</p>
          </div>
        </div>

        <div className="min-w-0 space-y-3">
          <p className="eyebrow">{t('admin.issuance.steps')}</p>
          <ol className="space-y-2">
            <Step
              index={1}
              done={l.status !== 'DRAFT'}
              current={next === 'deploy'}
              title={t('admIss.deploy')}
            >
              {l.status === 'DRAFT' && (
                <button
                  type="button"
                  onClick={() => admin.act(l.id, 'deploy')}
                  disabled={Boolean(busy)}
                  className={btn('deploy')}
                >
                  {busy === `${l.id}:deploy` ? t('admIss.deploying') : t('admIss.deploy')}
                </button>
              )}
            </Step>
            <Step index={2} done={l.tokensMinted > 0} current={next === 'mint'} title={t('admIss.mint')}>
              {canMint && (
                <>
                  <label htmlFor={`mint-${l.id}`} className="sr-only">
                    {t('admin.issuance.mintAmount')}
                  </label>
                  <input
                    id={`mint-${l.id}`}
                    type="number"
                    min={1}
                    inputMode="numeric"
                    className="input h-8 w-28 text-sm"
                    value={mintAmount}
                    onChange={(e) => onMintAmount(Number(e.target.value))}
                    onFocus={(e) => e.target.select()}
                  />
                  <button
                    type="button"
                    onClick={() => admin.act(l.id, 'mint', { amount: mintAmount })}
                    disabled={Boolean(busy)}
                    className={btn('mint')}
                  >
                    {busy === `${l.id}:mint` ? t('admIss.minting') : t('admIss.mint')}
                  </button>
                </>
              )}
            </Step>
            <Step
              index={3}
              done={l.status === 'LISTED' || closed}
              current={next === 'licitacion'}
              title={t('admIss.open')}
            >
              {canOpen && (
                <button
                  type="button"
                  onClick={() =>
                    admin.openLicitacion(l.id, walletEditable ? wallet : l.dossier.proceedsWallet || '')
                  }
                  disabled={Boolean(busy)}
                  className={btn('licitacion')}
                >
                  {busy === `${l.id}:licitacion` ? t('admIss.opening') : t('admIss.open')}
                </button>
              )}
              {l.status === 'LISTED' && (
                <button
                  type="button"
                  onClick={() => admin.saveSettle(l.id)}
                  disabled={Boolean(busy)}
                  className="btn btn-ghost btn-sm"
                >
                  {t('admIss.saveSettle')}
                </button>
              )}
            </Step>
            <Step
              index={4}
              done={closed}
              current={next === 'close'}
              title={
                isXlm ? t('admIss.finalizeXlm') : t('admIss.closeNow', { n: l.dossier.offeringSoftCapUsdc })
              }
            >
              {l.status === 'LISTED' && (
                <button
                  type="button"
                  onClick={() => admin.closeListing(l)}
                  disabled={Boolean(busy)}
                  className={btn('close')}
                >
                  {isXlm
                    ? t('admIss.finalizeXlm')
                    : t('admIss.closeNow', { n: l.dossier.offeringSoftCapUsdc })}
                </button>
              )}
            </Step>
          </ol>

          {l.status === 'CLOSED_SUCCESS' && (
            <div className="rounded-2xl border border-line p-3.5">
              <p className="text-sm font-medium text-ink">{t('admin.issuance.dividends')}</p>
              <p className="mt-0.5 text-xs text-muted">{t('admIss.proRata')}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label htmlFor={`div-${l.id}`} className="sr-only">
                  {t('admin.issuance.dividendAmount')}
                </label>
                <input
                  id={`div-${l.id}`}
                  type="number"
                  min={0}
                  inputMode="decimal"
                  className="input h-8 w-32 text-sm"
                  value={dividendAmount}
                  onChange={(e) => onDividendAmount(Number(e.target.value))}
                  onFocus={(e) => e.target.select()}
                />
                <button
                  type="button"
                  onClick={() => admin.payDividend(l.id, dividendAmount)}
                  className="btn btn-primary btn-sm"
                >
                  {t('admIss.depositSplit')}
                </button>
              </div>
            </div>
          )}

          <a href={`/market/${encodeURIComponent(l.id)}`} className="btn btn-ghost btn-sm -ml-2">
            {t('admIss.publicPage')}
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
      </div>
    </article>
  );
}
