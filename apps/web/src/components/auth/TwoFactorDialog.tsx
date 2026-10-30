import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { ShieldCheck } from 'lucide-react';
import { afterAuthPath } from '@/core/auth/onboardingPath';
import { container } from '@/core/container';
import { errorMessage } from '@/core/errors';
import { ApiError } from '@/core/http/HttpClient';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';

const { navigator } = container;

/**
 * Second step of every login when the account has 2FA. Mounted once (in the
 * Navbar, present on every page), so it works whatever entry point started
 * the login: email form, Freighter, Google or a password reset.
 */
export default function TwoFactorDialog() {
  const { pendingTwoFactor, completeTwoFactor, cancelTwoFactor, isLoading } = useAuth();
  const { t } = useI18n();
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!pendingTwoFactor) return;
    setCode('');
    setError('');
    inputRef.current?.focus();
  }, [pendingTwoFactor, recovery]);

  useEffect(() => {
    if (!pendingTwoFactor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelTwoFactor();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pendingTwoFactor, cancelTwoFactor]);

  if (!pendingTwoFactor) return null;

  const expired = Boolean(pendingTwoFactor.expiresAt && Date.parse(pendingTwoFactor.expiresAt) <= Date.now());

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    setError('');
    if (expired) {
      setError(t('twofa.expired'));
      return;
    }
    try {
      const user = await completeTwoFactor(code);
      navigator.navigate(afterAuthPath(user, navigator.searchParam('next')));
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? t('twofa.invalid')
          : errorMessage(err, t('twofa.invalid')),
      );
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/30 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="twofa-title"
    >
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-5 rounded-card border border-line bg-surface p-6 shadow-lift animate-fade-up"
      >
        <div className="flex items-center gap-3">
          <span
            className="grid h-10 w-10 place-items-center rounded-xl bg-sky-soft text-ink"
            aria-hidden="true"
          >
            <ShieldCheck className="h-5 w-5" />
          </span>
          <h2 id="twofa-title" className="text-lg font-medium text-ink">
            {t('twofa.title')}
          </h2>
        </div>
        <p className="text-sm text-ink-2">{recovery ? t('twofa.recoveryLabel') : t('twofa.lead')}</p>
        <label className="block">
          <span className="label">{recovery ? t('twofa.recoveryLabel') : t('twofa.codeLabel')}</span>
          <input
            ref={inputRef}
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode={recovery ? 'text' : 'numeric'}
            autoComplete="one-time-code"
            pattern={recovery ? undefined : '[0-9 ]{6,7}'}
            maxLength={recovery ? 32 : 7}
            placeholder={recovery ? t('twofa.recoveryPh') : t('twofa.codePh')}
            className="input h-12 text-center font-mono text-lg tracking-[0.3em]"
          />
        </label>
        {error && (
          <p className="rounded-xl bg-bad-soft px-3.5 py-2.5 text-sm text-bad" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={isLoading || !code.trim()} className="btn btn-primary btn-lg w-full">
          {isLoading ? t('twofa.verifying') : t('twofa.verify')}
        </button>
        <div className="flex items-center justify-between gap-3 text-xs">
          <button
            type="button"
            onClick={() => setRecovery((r) => !r)}
            className="rounded text-ink-2 underline underline-offset-2 hover:text-ink"
          >
            {recovery ? t('twofa.useApp') : t('twofa.useRecovery')}
          </button>
          <button type="button" onClick={cancelTwoFactor} className="rounded text-muted hover:text-ink">
            {t('twofa.cancel')}
          </button>
        </div>
      </form>
    </div>
  );
}
