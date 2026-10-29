import { useState, type ReactNode, type SubmitEvent } from 'react';
import { Check, Copy, KeyRound, LogOut, Mail, ShieldCheck } from 'lucide-react';
import RequireAuth from '@/components/guards/RequireAuth';
import { withIsland } from '@/components/island/withIsland';
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

function Card({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="p-5 sm:p-6 rounded-3xl crystal-card space-y-4">
      <h2 className="text-lg font-extrabold font-display inline-flex items-center gap-2">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Badge({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-[11px] font-display font-bold ${on ? 'bg-leaf-100 text-[#2f6f28]' : 'bg-black/5 text-neutral-600'}`}
    >
      {label}
    </span>
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
    <label className="block space-y-1 max-w-xs">
      <span className="text-xs font-bold text-neutral-500">{label}</span>
      <input
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="text"
        autoComplete="one-time-code"
        maxLength={32}
        className="w-full px-3 py-2.5 rounded-xl border border-black/10 bg-white font-mono tracking-widest"
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
    <div className="max-w-3xl mx-auto space-y-6 py-4">
      <div>
        <p className="font-lcd text-[11px] uppercase tracking-[0.2em] text-neutral-500 inline-flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" /> {t('sec.kicker')}
        </p>
        <h1 className="text-2xl sm:text-3xl font-extrabold font-display">{t('sec.title')}</h1>
        <p className="text-neutral-600 mt-1">{t('sec.lead')}</p>
      </div>

      {adminNeeds2fa && !user.twoFactorEnabled && (
        <p
          className="p-3 rounded-2xl border border-amber-300/80 bg-amber-50 text-sm text-amber-900"
          role="alert"
        >
          {t('sec.adminRequired')}
        </p>
      )}
      {message && (
        <p className="text-sm font-bold text-green-700" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <Card icon={<KeyRound className="w-5 h-5" />} title={t('sec.twoFaTitle')}>
        <div className="flex items-center gap-2">
          <Badge
            on={user.twoFactorEnabled}
            label={user.twoFactorEnabled ? t('sec.twoFaOn') : t('sec.twoFaOff')}
          />
        </div>
        <p className="text-sm text-neutral-600">{t('sec.twoFaBody')}</p>

        {stage.kind === 'recovery' && (
          <div className="p-4 rounded-2xl border border-amber-300/80 bg-amber-50 space-y-3">
            <p className="font-display font-extrabold">{t('sec.recoveryTitle')}</p>
            <p className="text-sm text-amber-900">{t('sec.recoveryWarn')}</p>
            <ul className="grid grid-cols-2 gap-2 font-mono text-sm">
              {stage.codes.map((c) => (
                <li key={c} className="px-2 py-1 rounded-lg bg-white border border-black/10 select-all">
                  {c}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void copyCodes(stage.codes)}
                className="px-4 py-2 rounded-xl border border-black/10 bg-white text-sm font-display font-bold inline-flex items-center gap-2"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? t('sec.copied') : t('sec.copy')}
              </button>
              <button
                type="button"
                onClick={() => setStage({ kind: 'idle' })}
                className="px-4 py-2 rounded-xl bg-black text-white text-sm font-display font-bold"
              >
                {t('sec.done')}
              </button>
            </div>
          </div>
        )}

        {stage.kind === 'setup' && (
          <form onSubmit={confirmSetup} className="space-y-4">
            <p className="text-sm">{t('sec.setupScan')}</p>
            {stage.qr && (
              <img
                src={stage.qr}
                alt={t('sec.qrAlt')}
                width={220}
                height={220}
                className="rounded-xl border border-black/10 bg-white p-2"
              />
            )}
            <div className="space-y-1">
              <p className="text-xs text-neutral-500">{t('sec.setupManual')}</p>
              <code className="block w-fit px-3 py-2 rounded-xl bg-black/5 font-mono text-sm select-all break-all">
                {formatSecret(stage.setup.secret)}
              </code>
            </div>
            <p className="text-sm">{t('sec.setupConfirm')}</p>
            <CodeField value={code} onChange={setCode} label={t('twofa.codeLabel')} />
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={busy || !code.trim()}
                className="px-4 py-2.5 rounded-xl bg-black text-white text-sm font-display font-bold disabled:opacity-50"
              >
                {busy ? t('sec.confirming') : t('sec.confirm')}
              </button>
              <button
                type="button"
                onClick={() => setStage({ kind: 'idle' })}
                className="px-4 py-2.5 rounded-xl border border-black/10 text-sm font-display font-bold"
              >
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
            className="px-4 py-2.5 rounded-xl bg-black text-white text-sm font-display font-bold disabled:opacity-50"
          >
            {busy ? t('sec.starting') : t('sec.enable')}
          </button>
        )}

        {stage.kind === 'idle' && user.twoFactorEnabled && (
          <form onSubmit={disable} className="space-y-3">
            <p className="text-sm text-neutral-600">{t('sec.disableBody')}</p>
            <CodeField value={code} onChange={setCode} label={t('twofa.codeLabel')} />
            <button
              type="submit"
              disabled={busy || !code.trim()}
              className="px-4 py-2.5 rounded-xl border border-black/15 text-sm font-display font-bold disabled:opacity-50"
            >
              {t('sec.disable')}
            </button>
          </form>
        )}
      </Card>

      <Card icon={<Mail className="w-5 h-5" />} title={t('sec.emailTitle')}>
        <p className="text-sm font-mono break-all">{user.email}</p>
        {emailAccount ? (
          <div className="flex flex-wrap items-center gap-3">
            <Badge
              on={user.emailVerified}
              label={user.emailVerified ? t('sec.emailVerified') : t('sec.emailUnverified')}
            />
            {!user.emailVerified && (
              <button
                type="button"
                onClick={() => void resendEmail()}
                disabled={resend !== 'idle'}
                className="text-sm font-display font-bold underline disabled:opacity-60"
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
          <p className="text-sm text-neutral-500">{t('sec.emailNa')}</p>
        )}
      </Card>

      <Card icon={<LogOut className="w-5 h-5" />} title={t('sec.sessionsTitle')}>
        <p className="text-sm text-neutral-600">{t('sec.sessionsBody')}</p>
        {confirmRevoke ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold">{t('sec.revokeConfirm')}</span>
            <button
              type="button"
              onClick={() => void revokeAll()}
              disabled={busy}
              className="px-4 py-2 rounded-xl bg-black text-white text-sm font-display font-bold disabled:opacity-50"
            >
              {busy ? t('sec.revoking') : t('sec.revokeYes')}
            </button>
            <button
              type="button"
              onClick={() => setConfirmRevoke(false)}
              className="px-4 py-2 rounded-xl border border-black/10 text-sm font-display font-bold"
            >
              {t('sec.cancelSetup')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmRevoke(true)}
            className="px-4 py-2.5 rounded-xl border border-black/15 text-sm font-display font-bold"
          >
            {t('sec.revokeAll')}
          </button>
        )}
      </Card>
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
