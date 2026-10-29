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
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="twofa-title"
    >
      <form onSubmit={submit} className="w-full max-w-sm p-6 rounded-3xl bg-white shadow-2xl space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-[#2f6f28]" aria-hidden />
          <h2 id="twofa-title" className="text-lg font-extrabold font-display">
            {t('twofa.title')}
          </h2>
        </div>
        <p className="text-sm text-neutral-600">{recovery ? t('twofa.recoveryLabel') : t('twofa.lead')}</p>
        <label className="block space-y-1">
          <span className="text-xs font-bold text-neutral-500">
            {recovery ? t('twofa.recoveryLabel') : t('twofa.codeLabel')}
          </span>
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
            className="w-full px-3 py-2.5 rounded-xl border border-black/10 bg-white font-mono text-lg tracking-widest text-center"
          />
        </label>
        {error && (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={isLoading || !code.trim()}
          className="w-full py-3 rounded-2xl bg-black text-white font-display font-bold disabled:opacity-50"
        >
          {isLoading ? t('twofa.verifying') : t('twofa.verify')}
        </button>
        <div className="flex items-center justify-between text-xs">
          <button type="button" onClick={() => setRecovery((r) => !r)} className="text-neutral-600 underline">
            {recovery ? t('twofa.useApp') : t('twofa.useRecovery')}
          </button>
          <button type="button" onClick={cancelTwoFactor} className="text-neutral-500">
            {t('twofa.cancel')}
          </button>
        </div>
      </form>
    </div>
  );
}
