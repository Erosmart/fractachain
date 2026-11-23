import { useId, useState, type SubmitEvent } from 'react';
import { KeyRound, MailCheck } from 'lucide-react';
import { withIsland } from '@/components/island/withIsland';
import { Notice } from '@/components/ui/kit';
import { container } from '@/core/container';
import { ApiError } from '@/core/http/HttpClient';
import { useI18n } from '@/hooks/useI18n';
import AuthShell from './AuthShell';

const { security } = container.services;

/** Requests a password-reset link. Same answer whether the email exists or not. */
function ForgotPasswordPage() {
  const { t } = useI18n();
  const id = useId();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await security.requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      // Only transport/rate-limit/validation problems surface; never "no such account".
      setError(err instanceof ApiError ? err.message : t('err.opFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      icon={sent ? <MailCheck className="h-5 w-5" /> : <KeyRound className="h-5 w-5" />}
      title={t('pwd.forgotTitle')}
      subtitle={t('pwd.forgotLead')}
    >
      {sent ? (
        <Notice tone="good">{t('pwd.sentBody')}</Notice>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor={`${id}-email`} className="label">
              {t('auth.email')}
            </label>
            <input
              id={`${id}-email`}
              required
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
            />
          </div>
          {error && <Notice tone="bad">{error}</Notice>}
          <button type="submit" disabled={busy} className="btn btn-primary btn-lg w-full">
            {busy ? t('pwd.sending') : t('pwd.send')}
          </button>
        </form>
      )}
      <p className="mt-6 text-center">
        <a href="/login" className="text-sm text-ink-2 underline-offset-2 hover:text-ink hover:underline">
          {t('pwd.backToLogin')}
        </a>
      </p>
    </AuthShell>
  );
}

export default withIsland(ForgotPasswordPage);
