import { useState, type SubmitEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { withIsland } from '@/components/island/withIsland';
import { container } from '@/core/container';
import { ApiError } from '@/core/http/HttpClient';
import { useI18n } from '@/hooks/useI18n';

const { security } = container.services;

/** Requests a password-reset link. Same answer whether the email exists or not. */
function ForgotPasswordPage() {
  const { t } = useI18n();
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
    <div className="max-w-md mx-auto py-12 space-y-6">
      <div className="text-center space-y-2">
        <KeyRound className="w-9 h-9 mx-auto" aria-hidden />
        <h1 className="text-3xl font-extrabold font-display">{t('pwd.forgotTitle')}</h1>
        <p className="text-neutral-600">{t('pwd.forgotLead')}</p>
      </div>
      <div className="p-6 rounded-3xl crystal-card space-y-4">
        {sent ? (
          <p className="text-sm" role="status">
            {t('pwd.sentBody')}
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <input
              required
              type="email"
              autoComplete="email"
              placeholder={t('auth.email')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-black/10 bg-white"
            />
            {error && (
              <p className="text-sm text-red-700" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full py-3 rounded-2xl bg-black text-white font-display font-bold disabled:opacity-50"
            >
              {busy ? t('pwd.sending') : t('pwd.send')}
            </button>
          </form>
        )}
        <p className="text-center">
          <a href="/login" className="text-xs text-neutral-600 underline">
            {t('pwd.backToLogin')}
          </a>
        </p>
      </div>
    </div>
  );
}

export default withIsland(ForgotPasswordPage);
