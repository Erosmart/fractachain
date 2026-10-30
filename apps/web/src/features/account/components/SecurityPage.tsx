import { useState, type ReactNode, type SubmitEvent } from 'react';
import { Check, Copy, KeyRound, LogOut, Mail } from 'lucide-react';
import RequireAuth from '@/components/guards/RequireAuth';
import { withIsland } from '@/components/island/withIsland';
import { Notice, PageHeader, StatusChip } from '@/components/ui/kit';
import type { TwoFactorSetup } from '@/core/api/types';
import { container } from '@/core/container';
import { errorMessage } from '@/core/errors';
import { formatSecret, totpQrDataUrl } from '@/core/security/otpauth';
import { useI18n } from '@/hooks/useI18n';
import { useSession } from '@/hooks/useSession';

const { security } = container.services;
const { navigator } = container;

type Stage =
  | { kind: 'idle' }
  | { kind: 'setup'; setup: TwoFactorSetup; qr: string | null }
  | { kind: 'recovery'; codes: string[] };

function Section({
  icon,
  title,
  status,
  children,
}: {
  icon: ReactNode;
  title: string;
  status?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card card-pad space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-3 text-[17px] font-medium text-ink">
          <span
            className="grid h-9 w-9 place-items-center rounded-xl bg-sky-soft text-ink"
            aria-hidden="true"
          >
            {icon}
          </span>
          {title}
        </h2>
        {status}
      </header>
      {children}
    </section>
  );
}

/** Code input shared by enable and disable. */
function CodeField({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <label className="block max-w-xs">
      <span className="label">{label}</span>
      <input
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="text"
        autoComplete="one-time-code"
        maxLength={32}
        className="input font-mono tracking-widest"
      />
    </label>
  );
}

function SecurityPage() {
  const { user, notice } = useSession();
  const { t } = useI18n();
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [resend, setResend] = useState<'idle' | 'sending' | 'sent'>('idle');

  if (!user) return null;

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await work();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const startSetup = () =>
    run(async () => {
      const setup = await security.startTwoFactorSetup();
      const qr = await totpQrDataUrl(setup.otpauthUrl).catch(() => null);
      setCode('');
      setStage({ kind: 'setup', setup, qr });
    });

  const confirmSetup = (e: SubmitEvent) => {
    e.preventDefault();
    void run(async () => {
      const codes = await security.enableTwoFactor(code);
      setCode('');
      setStage({ kind: 'recovery', codes });
      setMessage(t('sec.enabledOk'));
    });
  };

  const disable = (e: SubmitEvent) => {
    e.preventDefault();
    void run(async () => {
      await security.disableTwoFactor(code);
      setCode('');
      setMessage(t('sec.disabledOk'));
    });
  };

  const copyCodes = async (codes: string[]) => {
    try {
      await window.navigator.clipboard?.writeText(codes.join('\n'));
      setCopied(true);
    } catch {
      // clipboard blocked: the codes stay selectable on screen
    }
  };

  const revokeAll = () =>
    run(async () => {
      await security.revokeAllSessions();
      navigator.replace('/login');
    });

  const resendEmail = async () => {
    setResend('sending');
    try {
      await security.resendVerification();
      setResend('sent');
    } catch (err) {
      setError(errorMessage(err));
      setResend('idle');
    }
  };

  const adminNeeds2fa = (user.isAdmin && !user.twoFactorEnabled) || notice?.code === 'TWO_FACTOR_REQUIRED';
  const emailAccount = user.authProvider === 'email';

  return (
    <div className="space-y-6">
      <PageHeader title={t('sec.title')} subtitle={t('sec.lead')} />

      {adminNeeds2fa && !user.twoFactorEnabled && <Notice tone="warn">{t('sec.adminRequired')}</Notice>}
      {message && <Notice tone="good">{message}</Notice>}
      {error && <Notice tone="bad">{error}</Notice>}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <Section
            icon={<KeyRound className="h-4 w-4" />}
            title={t('sec.twoFaTitle')}
            status={
              <StatusChip tone={user.twoFactorEnabled ? 'good' : 'neutral'}>
                {user.twoFactorEnabled ? t('sec.twoFaOn') : t('sec.twoFaOff')}
              </StatusChip>
            }
          >
            <p className="text-sm text-ink-2">{t('sec.twoFaBody')}</p>

            {stage.kind === 'recovery' && (
              <div className="space-y-3 rounded-2xl bg-butter-soft p-4">
                <p className="font-medium text-ink">{t('sec.recoveryTitle')}</p>
                <p className="text-sm text-ink-2">{t('sec.recoveryWarn')}</p>
                <ul className="grid grid-cols-2 gap-2 font-mono text-sm">
                  {stage.codes.map((c) => (
                    <li
                      key={c}
                      className="select-all rounded-lg border border-line bg-surface px-2 py-1 text-ink"
                    >
                      {c}
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void copyCodes(stage.codes)}
                    className="btn btn-secondary btn-sm"
                  >
                    {copied ? (
                      <Check className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Copy className="h-4 w-4" aria-hidden="true" />
                    )}
                    {copied ? t('sec.copied') : t('sec.copy')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStage({ kind: 'idle' })}
                    className="btn btn-primary btn-sm"
                  >
                    {t('sec.done')}
                  </button>
                </div>
              </div>
            )}

            {stage.kind === 'setup' && (
              <form onSubmit={confirmSetup} className="space-y-4">
                <p className="text-sm text-ink">{t('sec.setupScan')}</p>
                {/* White on purpose, also in dark mode: authenticator apps need a light QR quiet zone. */}
                {stage.qr && (
                  <img
                    src={stage.qr}
                    alt={t('sec.qrAlt')}
                    width={220}
                    height={220}
                    className="rounded-xl border border-line bg-white p-2"
                  />
                )}
                <div className="space-y-1">
                  <p className="text-xs text-muted">{t('sec.setupManual')}</p>
                  <code className="block w-fit select-all break-all rounded-xl bg-surface-2 px-3 py-2 font-mono text-sm text-ink ring-1 ring-line">
                    {formatSecret(stage.setup.secret)}
                  </code>
                </div>
                <p className="text-sm text-ink">{t('sec.setupConfirm')}</p>
                <CodeField value={code} onChange={setCode} label={t('twofa.codeLabel')} />
                <div className="flex flex-wrap gap-2">
                  <button type="submit" disabled={busy || !code.trim()} className="btn btn-primary">
                    {busy ? t('sec.confirming') : t('sec.confirm')}
                  </button>
                  <button type="button" onClick={() => setStage({ kind: 'idle' })} className="btn btn-ghost">
                    {t('sec.cancelSetup')}
                  </button>
                </div>
              </form>
            )}

            {stage.kind === 'idle' && !user.twoFactorEnabled && (
              <button
                type="button"
                onClick={() => void startSetup()}
                disabled={busy}
                className="btn btn-primary"
              >
                {busy ? t('sec.starting') : t('sec.enable')}
              </button>
            )}

            {stage.kind === 'idle' && user.twoFactorEnabled && (
              <form onSubmit={disable} className="space-y-3">
                <p className="text-sm text-ink-2">{t('sec.disableBody')}</p>
                <CodeField value={code} onChange={setCode} label={t('twofa.codeLabel')} />
                <button type="submit" disabled={busy || !code.trim()} className="btn btn-danger">
                  {t('sec.disable')}
                </button>
              </form>
            )}
          </Section>
        </div>

        <div className="min-w-0 space-y-5">
          <Section
            icon={<Mail className="h-4 w-4" />}
            title={t('sec.emailTitle')}
            status={
              emailAccount ? (
                <StatusChip tone={user.emailVerified ? 'good' : 'warn'}>
                  {user.emailVerified ? t('sec.emailVerified') : t('sec.emailUnverified')}
                </StatusChip>
              ) : undefined
            }
          >
            <p className="break-all text-sm text-ink">{user.email}</p>
            {emailAccount ? (
              <div className="flex flex-wrap items-center gap-3">
                {!user.emailVerified && (
                  <button
                    type="button"
                    onClick={() => void resendEmail()}
                    disabled={resend !== 'idle'}
                    className="btn btn-secondary btn-sm"
                  >
                    {resend === 'sent'
                      ? t('verify.sent')
                      : resend === 'sending'
                        ? t('verify.sending')
                        : t('verify.resend')}
                  </button>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted">{t('sec.emailNa')}</p>
            )}
          </Section>

          <Section icon={<LogOut className="h-4 w-4" />} title={t('sec.sessionsTitle')}>
            <p className="text-sm text-ink-2">{t('sec.sessionsBody')}</p>
            {confirmRevoke ? (
              <div
                className="space-y-3 rounded-2xl bg-bad-soft/60 p-4"
                role="alertdialog"
                aria-label={t('sec.revokeConfirm')}
              >
                <p className="text-sm font-medium text-ink">{t('sec.revokeConfirm')}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void revokeAll()}
                    disabled={busy}
                    className="btn btn-danger btn-sm"
                  >
                    {busy ? t('sec.revoking') : t('sec.revokeYes')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRevoke(false)}
                    className="btn btn-ghost btn-sm"
                  >
                    {t('sec.cancelSetup')}
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmRevoke(true)} className="btn btn-secondary">
                {t('sec.revokeAll')}
              </button>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

function SecurityRoute() {
  return (
    <RequireAuth>
      <SecurityPage />
    </RequireAuth>
  );
}

export default withIsland(SecurityRoute);
