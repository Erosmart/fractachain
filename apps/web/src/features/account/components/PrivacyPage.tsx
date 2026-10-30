import { useEffect, useId, useRef, useState, type SubmitEvent } from 'react';
import { AlertTriangle, ArrowUpRight, Download, FileText, Scale, Trash2 } from 'lucide-react';
import type { LegalVersions } from '@fractachain/shared';
import RequireAuth from '@/components/guards/RequireAuth';
import { withIsland } from '@/components/island/withIsland';
import { Card, Notice, PageHeader, StatusChip } from '@/components/ui/kit';
import { termsPath } from '@/core/auth/onboardingPath';
import type { SessionUser } from '@/core/auth/SessionUser';
import { container } from '@/core/container';
import { errorMessage } from '@/core/errors';
import { ApiError } from '@/core/http/HttpClient';
import { useI18n } from '@/hooks/useI18n';
import { useSession } from '@/hooks/useSession';
import { closeProof, closeRequest, confirmMatches, exportFileName } from '../privacy';

const { api, stores } = container;
const { signer } = container.wallet;

const DOCS = [
  ['/legal/terminos', 'terms'],
  ['/legal/privacidad', 'privacy'],
  ['/legal/cookies', 'cookies'],
  ['/legal/riesgos', 'risks'],
] as const;

function ConsentCard({ user, legal }: { user: SessionUser; legal: LegalVersions | null }) {
  const { t, locale } = useI18n();
  const date = user.termsAcceptedAt
    ? new Date(user.termsAcceptedAt).toLocaleDateString(locale === 'es' ? 'es-AR' : 'en-US', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;
  const accepted = user.termsAccepted !== false;
  return (
    <Card title={t('account.privacy.consentTitle')}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip tone={accepted ? 'good' : 'warn'}>
          {accepted
            ? user.termsVersion && date
              ? t('account.privacy.consentBody', { version: user.termsVersion, date })
              : t('shell.kit.done')
            : t('account.privacy.consentPending')}
        </StatusChip>
        {legal?.termsVersion && (
          <span className="text-xs text-muted">
            {t('account.privacy.consentCurrent', { version: legal.termsVersion })}
          </span>
        )}
      </div>
      {!accepted && (
        <a href={termsPath('/account/privacidad')} className="btn btn-primary btn-sm mt-4">
          {t('account.privacy.consentAccept')}
        </a>
      )}
      <ul className="mt-5 grid gap-2 sm:grid-cols-2">
        {DOCS.map(([href, key]) => (
          <li key={key}>
            <a
              href={href}
              className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 text-sm text-ink transition-colors hover:border-line-strong hover:bg-surface-2"
            >
              <FileText className="h-4 w-4 shrink-0 text-ink-2" aria-hidden="true" />
              <span className="flex-1">{t(`account.privacy.docs.${key}`)}</span>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-ink-2" aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ExportCard() {
  const { t } = useI18n();
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState('');
  const download = async () => {
    setError('');
    setState('busy');
    try {
      const blob = await api.account.exportData();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = exportFileName();
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setState('done');
    } catch (err) {
      setError(errorMessage(err));
      setState('idle');
    }
  };
  return (
    <Card title={t('account.privacy.exportTitle')} subtitle={t('account.privacy.exportBody')}>
      <div className="flex flex-wrap items-center gap-3" aria-live="polite">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void download()}
          disabled={state === 'busy'}
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          {state === 'busy' ? t('account.privacy.exporting') : t('account.privacy.exportAction')}
        </button>
        {state === 'done' && <StatusChip tone="good">{t('account.privacy.exportDone')}</StatusChip>}
      </div>
      {error && (
        <Notice tone="bad" className="mt-3">
          {error}
        </Notice>
      )}
    </Card>
  );
}

function CloseAccount({ user, onClosed }: { user: SessionUser; onClosed: () => void }) {
  const { t, messages } = useI18n();
  const ids = useId();
  const proof = closeProof(user);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reauth, setReauth] = useState(false);
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) firstField.current?.focus();
  }, [open]);

  const word = t('account.privacy.confirmWord');
  const ready = confirmMatches(typed) && (proof !== 'password' || password.length > 0);

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!ready) return;
    setError('');
    setReauth(false);
    setBusy(true);
    try {
      const signature = proof === 'wallet' ? await signer.signCloseChallenge() : undefined;
      await api.account.close(closeRequest(proof, { password, signature }));
      onClosed();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'WRONG_PASSWORD') {
        setError(t('account.password.wrongCurrent'));
      } else if (err instanceof ApiError && err.status === 401) {
        if (proof === 'password') setError(t('account.password.wrongCurrent'));
        else setReauth(true);
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card card-pad border-bad/30" aria-labelledby={`${ids}-title`}>
      <h2 id={`${ids}-title`} className="flex items-center gap-3 text-[17px] font-medium text-ink">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-bad-soft text-bad" aria-hidden="true">
          <Trash2 className="h-4 w-4" />
        </span>
        {t('account.privacy.closeTitle')}
      </h2>
      <p className="mt-3 text-sm text-ink-2">{t('account.privacy.closeBody')}</p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl bg-surface-2 p-4">
          <p className="text-sm font-medium text-ink">{t('account.privacy.keptTitle')}</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[13px] text-ink-2">
            {messages.account.privacy.kept.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl bg-warn-soft p-4 text-warn">
          <p className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            {t('account.privacy.blockedTitle')}
          </p>
          <p className="mt-2 text-[13px]">{t('account.privacy.blocked')}</p>
        </div>
      </div>

      {!open ? (
        <button
          type="button"
          className="btn btn-danger mt-5"
          onClick={() => setOpen(true)}
          aria-expanded="false"
        >
          {t('account.privacy.closeStart')}
        </button>
      ) : (
        <form onSubmit={submit} noValidate className="mt-5 space-y-4 rounded-xl border border-line p-4">
          <div>
            <label htmlFor={`${ids}-confirm`} className="label">
              {t('account.privacy.confirmLabel', { word })}
            </label>
            <input
              ref={firstField}
              id={`${ids}-confirm`}
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="input max-w-xs font-mono uppercase"
            />
          </div>
          {proof === 'password' && (
            <div>
              <label htmlFor={`${ids}-password`} className="label">
                {t('account.privacy.passwordLabel')}
              </label>
              <input
                id={`${ids}-password`}
                type="password"
                autoComplete="current-password"
                value={password}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${ids}-error` : undefined}
                onChange={(e) => setPassword(e.target.value)}
                className="input max-w-sm aria-[invalid=true]:border-bad"
              />
            </div>
          )}
          {proof === 'wallet' && <p className="text-[13px] text-ink-2">{t('account.privacy.walletNote')}</p>}
          {proof === 'session' && <p className="text-[13px] text-ink-2">{t('account.privacy.googleNote')}</p>}
          <div aria-live="polite">
            {error && (
              <p
                id={`${ids}-error`}
                role="alert"
                className="rounded-xl bg-bad-soft px-3.5 py-2.5 text-sm text-bad"
              >
                {error}
              </p>
            )}
            {reauth && (
              <Notice tone="warn">
                {t('account.privacy.reauth')}{' '}
                <a
                  href={`/login?next=${encodeURIComponent('/account/privacidad')}`}
                  className="font-medium underline underline-offset-2"
                >
                  {t('account.privacy.signInAgain')}
                </a>
              </Notice>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn btn-danger" disabled={!ready || busy}>
              {busy ? t('account.privacy.closing') : t('account.privacy.closeAction')}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setOpen(false);
                setTyped('');
                setPassword('');
                setError('');
                setReauth(false);
              }}
            >
              {t('account.privacy.cancel')}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function ClosedScreen() {
  const { t } = useI18n();
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <section className="card card-pad mx-auto max-w-xl text-center" aria-live="polite">
      <h1 ref={ref} tabIndex={-1} className="text-[26px] font-normal tracking-[-0.02em] text-ink">
        {t('account.privacy.closedTitle')}
      </h1>
      <p className="mt-2 text-sm text-ink-2">{t('account.privacy.closedBody')}</p>
      <a href="/" className="btn btn-primary mt-6">
        {t('account.privacy.goHome')}
      </a>
    </section>
  );
}

function Privacy({ onClosed }: { onClosed: () => void }) {
  const { user } = useSession();
  const { t } = useI18n();
  const [legal, setLegal] = useState<LegalVersions | null>(null);

  useEffect(() => {
    void api.account
      .legal()
      .then(setLegal)
      .catch(() => undefined);
  }, []);

  if (!user) return null;

  return (
    <div className="space-y-5">
      <PageHeader title={t('account.privacy.title')} subtitle={t('account.privacy.subtitle')} />
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <ConsentCard user={user} legal={legal} />
        <div className="space-y-5">
          <ExportCard />
          <Card title={t('account.privacy.rightsTitle')} subtitle={t('account.privacy.rightsBody')}>
            <a href="/contacto?tema=privacidad" className="btn btn-secondary">
              <Scale className="h-4 w-4" aria-hidden="true" />
              {t('account.privacy.rightsAction')}
            </a>
          </Card>
        </div>
      </div>
      <CloseAccount user={user} onClosed={onClosed} />
    </div>
  );
}

function PrivacyPage() {
  const [closed, setClosed] = useState(false);
  // Once closed the session is gone: the confirmation renders outside the auth guard.
  if (closed) return <ClosedScreen />;
  return (
    <RequireAuth>
      <Privacy
        onClosed={() => {
          setClosed(true);
          // The API already ended every session: drop the local one without another request.
          stores.session.clear();
        }}
      />
    </RequireAuth>
  );
}

export default withIsland(PrivacyPage);
