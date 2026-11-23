import { useEffect, useState, type SubmitEvent, type ReactNode } from 'react';
import { AlertTriangle, Camera, Fingerprint, ScanFace, ShieldCheck } from 'lucide-react';
import AuthenticatedImage from '@/components/ui/AuthenticatedImage';
import { Notice, StatusChip } from '@/components/ui/kit';
import type { KycQueueRow } from '@/core/api/AdminApi';
import { useI18n } from '@/hooks/useI18n';
import { CopyValue } from '../../shared/CopyValue';
import { formatDateTime, hoursSince, relativeAge } from '../../shared/datetime';
import {
  checkTone,
  composeReason,
  isKnownCheckStatus,
  namesMatch,
  providerTone,
  slaTone,
  STATUS_TONE,
} from '../model';

type Decision = 'APPROVED' | 'REJECTED' | 'REVOKED';

export interface KycDetailProps {
  row: KycQueueRow;
  now: number;
  busy: boolean;
  onDecide: (row: KycQueueRow, decision: Decision, reason?: string) => Promise<boolean>;
  /** Off when the detail opens under its own row (name and status are already there). */
  showHeader?: boolean;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 min-w-0 truncate text-sm text-ink">{children}</dd>
    </div>
  );
}

/** Didit's decision: provider status, the four checks and the identity read from the document. */
function ProviderDecision({ row, now }: { row: KycQueueRow; now: number }) {
  const { t } = useI18n();
  const v = row.verification!;
  const checks = [
    {
      key: 'document',
      icon: <Fingerprint className="h-3 w-3" aria-hidden="true" />,
      value: v.checks?.document,
    },
    { key: 'liveness', icon: <ScanFace className="h-3 w-3" aria-hidden="true" />, value: v.checks?.liveness },
    { key: 'faceMatch', icon: <Camera className="h-3 w-3" aria-hidden="true" />, value: v.checks?.faceMatch },
    { key: 'aml', icon: <ShieldCheck className="h-3 w-3" aria-hidden="true" />, value: v.checks?.aml },
  ] as const;
  const id = v.identity;
  const mismatch = id?.fullName ? !namesMatch(row.fullName, id.fullName) : false;
  const hits = v.checks?.amlHits;

  return (
    <section
      className="space-y-4 rounded-2xl border border-line bg-surface-2 p-4"
      aria-labelledby={`didit-${row.id}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`didit-${row.id}`} className="text-sm font-medium text-ink">
          {t('admin.kyc.provider')}
        </h3>
        <StatusChip tone={providerTone(v.status)}>{t(`admin.kyc.providerStatus.${v.status}`)}</StatusChip>
      </header>
      <p className="-mt-2 text-xs text-muted">
        {t('admin.kyc.providerUpdated', { when: relativeAge(v.updatedAt, now, t) })}
      </p>

      <div>
        <p className="eyebrow mb-2">{t('admin.kyc.checks')}</p>
        <ul className="grid grid-cols-1 gap-1.5">
          {checks.map((c) => (
            <li
              key={c.key}
              className="flex min-w-0 items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2"
            >
              <span className="flex min-w-0 items-center gap-2 text-xs text-ink-2">
                {c.icon}
                <span className="truncate">{t(`admin.kyc.check.${c.key}`)}</span>
              </span>
              <StatusChip tone={checkTone(c.value)} icon={false}>
                {isKnownCheckStatus(c.value)
                  ? t(`admin.kyc.checkStatus.${c.value}`)
                  : (c.value ?? t('admin.kyc.checkNone'))}
                {c.key === 'aml' && typeof hits === 'number' && hits > 0
                  ? ` · ${hits === 1 ? t('admin.kyc.amlHitsOne') : t('admin.kyc.amlHits', { n: hits })}`
                  : ''}
              </StatusChip>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="eyebrow mb-2">{t('admin.kyc.identity')}</p>
        {id && (id.fullName || id.documentType || id.documentNumberLast4) ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Field label={t('admin.kyc.docName')}>{id.fullName || '—'}</Field>
            <Field label={t('admin.kyc.docType')}>{id.documentType || '—'}</Field>
            <Field label={t('admin.kyc.docNumber')}>
              {id.documentNumberLast4 ? t('admin.kyc.docNumberMasked', { n: id.documentNumberLast4 }) : '—'}
            </Field>
            <Field label={t('admin.kyc.issuingState')}>
              {[id.issuingState, id.nationality].filter(Boolean).join(' · ') || '—'}
            </Field>
          </dl>
        ) : (
          <p className="text-sm text-muted">{t('admin.kyc.noIdentity')}</p>
        )}
        {mismatch && (
          <p className="mt-3 flex gap-2 rounded-xl bg-warn-soft px-3 py-2 text-xs text-warn" role="note">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {t('admin.kyc.nameMismatch')}
          </p>
        )}
      </div>
    </section>
  );
}

/** Manual flow: the selfie is the only liveness evidence. */
function ManualEvidence({ row }: { row: KycQueueRow }) {
  const { t } = useI18n();
  const placeholder = (
    <div className="grid aspect-[4/3] w-full place-items-center rounded-xl bg-surface text-xs text-muted">
      {t('admin.kyc.noSelfie')}
    </div>
  );
  return (
    <section className="space-y-3 rounded-2xl border border-line bg-surface-2 p-4">
      <div>
        <h3 className="text-sm font-medium text-ink">{t('admin.kyc.manualTitle')}</h3>
        <p className="mt-0.5 text-xs text-muted">{t('admin.kyc.manualBody')}</p>
      </div>
      {row.selfieUrl ? (
        <AuthenticatedImage
          path={row.selfieUrl}
          alt={t('admin.kyc.selfieAlt', { name: row.fullName })}
          className="aspect-[4/3] w-full rounded-xl object-cover"
          fallback={placeholder}
        />
      ) : (
        placeholder
      )}
    </section>
  );
}

/** Reason picker for decline / revoke (predefined reasons + free text). */
function ReasonForm({
  kind,
  busy,
  onCancel,
  onSubmit,
}: {
  kind: 'REJECTED' | 'REVOKED';
  busy: boolean;
  onCancel: () => void;
  onSubmit: (reason: string) => void;
}) {
  const { t, messages } = useI18n();
  const options = kind === 'REJECTED' ? messages.admin.kyc.rejectReasons : messages.admin.kyc.revokeReasons;
  const [choice, setChoice] = useState(0);
  const [detail, setDetail] = useState('');
  const [error, setError] = useState('');
  const isOther = choice === options.length - 1;
  const formId = `reason-${kind}`;

  const submit = (e: SubmitEvent) => {
    e.preventDefault();
    const reason = composeReason(options, choice, detail);
    if (!reason) {
      setError(t('admin.kyc.reasonRequired'));
      return;
    }
    onSubmit(reason);
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-line p-4">
      {kind === 'REVOKED' && (
        <p className="flex gap-2 rounded-xl bg-bad-soft px-3 py-2 text-xs text-bad" role="note">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {t('admin.kyc.revokeWarn')}
        </p>
      )}
      <div>
        <label className="label" htmlFor={`${formId}-choice`}>
          {t('admin.kyc.reason')}
        </label>
        <select
          id={`${formId}-choice`}
          className="input"
          value={choice}
          onChange={(e) => {
            setChoice(Number(e.target.value));
            setError('');
          }}
        >
          {options.map((o, i) => (
            <option key={o} value={i}>
              {o}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor={`${formId}-detail`}>
          {t('admin.kyc.reasonOther')}
        </label>
        <textarea
          id={`${formId}-detail`}
          className="input"
          rows={2}
          maxLength={400}
          required={isOther}
          placeholder={t('admin.kyc.reasonOtherPh')}
          value={detail}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${formId}-error` : undefined}
          onChange={(e) => {
            setDetail(e.target.value);
            setError('');
          }}
        />
        {error && (
          <p id={`${formId}-error`} className="mt-1 text-xs text-bad">
            {error}
          </p>
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={busy}>
          {t('admin.common.cancel')}
        </button>
        <button
          type="submit"
          className={`btn btn-sm ${kind === 'REVOKED' ? 'btn-danger' : 'btn-primary'}`}
          disabled={busy}
        >
          {kind === 'REVOKED' ? t('admin.kyc.revokeConfirm') : t('admin.kyc.rejectConfirm')}
        </button>
      </div>
    </form>
  );
}

/** Everything compliance needs to decide one request. */
export function KycDetail({ row, now, busy, onDecide, showHeader = true }: KycDetailProps) {
  const { t, locale } = useI18n();
  const [mode, setMode] = useState<'idle' | 'REJECTED' | 'REVOKED'>('idle');
  useEffect(() => setMode('idle'), [row.id]);
  const age = hoursSince(row.createdAt, now);

  const decide = async (decision: Decision, reason?: string) => {
    if (await onDecide(row, decision, reason)) setMode('idle');
  };

  return (
    <article className="space-y-5" aria-label={t('admin.kyc.detail')}>
      {showHeader && (
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-medium tracking-[-0.01em] text-ink">
              {row.fullName || '—'}
            </h2>
            <p className="truncate text-sm text-muted">{row.email || row.id}</p>
          </div>
          <StatusChip tone={STATUS_TONE[row.status]}>{t(`admin.kyc.status.${row.status}`)}</StatusChip>
        </header>
      )}

      <div className="flex flex-wrap gap-2">
        <StatusChip tone={row.verification ? 'sky' : 'neutral'} icon={false}>
          {row.verification ? t('admin.kyc.didit') : t('admin.kyc.manual')}
        </StatusChip>
        {row.status === 'PENDING' && (
          <StatusChip tone={slaTone(row.status, age)}>
            {relativeAge(row.createdAt, now, t)} · {age >= 72 ? t('admin.kyc.slaLate') : t('admin.kyc.sla')}
          </StatusChip>
        )}
        {row.isGafiHighRisk && <StatusChip tone="bad">{t('admin.kyc.gafi')}</StatusChip>}
      </div>

      <section>
        <p className="eyebrow mb-2">{t('admin.kyc.declared')}</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Field label={t('admin.kyc.document')}>
            <span className="tnum">{row.docNumber || '—'}</span>
          </Field>
          <Field label={t('admin.kyc.country')}>{row.country || '—'}</Field>
          <Field label={t('admin.kyc.created')}>{formatDateTime(row.createdAt, locale)}</Field>
          <Field label={t('admin.kyc.wallet')}>
            {row.walletAddress ? (
              <CopyValue value={row.walletAddress} label={t('admin.common.copy')} />
            ) : (
              <span className="text-muted">{t('admin.kyc.noWallet')}</span>
            )}
          </Field>
        </dl>
      </section>

      {row.verification ? <ProviderDecision row={row} now={now} /> : <ManualEvidence row={row} />}

      {mode === 'idle' ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {row.status !== 'APPROVED' && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void decide('APPROVED')}
              >
                {busy ? t('admin.kyc.approving') : t('admin.kyc.approve')}
              </button>
            )}
            {row.status === 'PENDING' && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => setMode('REJECTED')}
              >
                {t('admin.kyc.reject')}
              </button>
            )}
            {row.status === 'APPROVED' && (
              <button
                type="button"
                className="btn btn-danger"
                disabled={busy}
                onClick={() => setMode('REVOKED')}
              >
                {t('admin.kyc.revoke')}
              </button>
            )}
          </div>
          {row.status !== 'APPROVED' && <p className="text-xs text-muted">{t('admin.kyc.approveNote')}</p>}
        </div>
      ) : (
        <ReasonForm
          kind={mode}
          busy={busy}
          onCancel={() => setMode('idle')}
          onSubmit={(reason) => void decide(mode, reason)}
        />
      )}
    </article>
  );
}

/** Placeholder for the detail column when nothing is selected. */
export function KycDetailEmpty() {
  const { t } = useI18n();
  return <Notice tone="sky">{t('admin.kyc.selectHint')}</Notice>;
}
