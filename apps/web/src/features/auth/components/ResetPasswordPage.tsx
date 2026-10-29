import { useEffect, useState, type SubmitEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { withIsland } from '@/components/island/withIsland';
import { afterAuthPath } from '@/core/auth/onboardingPath';
import { passwordProblem } from '@/core/auth/passwordRules';
import { container } from '@/core/container';
import { errorMessage } from '@/core/errors';
import { consumeUrlToken } from '@/core/security/otpauth';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';

const { navigator } = container;

/** Target of the reset email (`/reset-password?token=…`): new password, then signed in. */
function ResetPasswordPage() {
  const { resetPassword, isLoading } = useAuth();
  const { t } = useI18n();
  const [token, setToken] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setToken(consumeUrlToken('token'));
    setChecked(true);
  }, []);

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    setError('');
    const problem = passwordProblem(password, repeat);
    if (problem) {
      setError(t(problem === 'mismatch' ? 'pwd.mismatch' : 'pwd.tooShort'));
      return;
    }
    if (!token) return;
    try {
      const result = await resetPassword(token, password);
      // With 2FA the Navbar dialog asks for the code and redirects.
      if (result.status === 'signed-in') navigator.navigate(afterAuthPath(result.user));
    } catch (err) {
      setError(errorMessage(err, t('pwd.fail')));
    }
  };

  return (
    <div className="max-w-md mx-auto py-12 space-y-6">
      <div className="text-center space-y-2">
        <KeyRound className="w-9 h-9 mx-auto" aria-hidden />
        <h1 className="text-3xl font-extrabold font-display">{t('pwd.resetTitle')}</h1>
        <p className="text-neutral-600">{t('pwd.resetLead')}</p>
      </div>
      <div className="p-6 rounded-3xl crystal-card space-y-4">
        {checked && !token ? (
          <div className="space-y-3 text-center">
            <p className="text-sm text-red-700" role="alert">
              {t('pwd.missingToken')}
            </p>
            <a href="/forgot-password" className="text-sm font-display font-bold underline">
              {t('pwd.forgotTitle')}
            </a>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <input
              required
              minLength={8}
              type="password"
              autoComplete="new-password"
              placeholder={t('pwd.newPassword')}
              aria-label={t('pwd.newPassword')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-black/10 bg-white"
            />
            <input
              required
              minLength={8}
              type="password"
              autoComplete="new-password"
              placeholder={t('pwd.repeatPassword')}
              aria-label={t('pwd.repeatPassword')}
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-black/10 bg-white"
            />
            {error && (
              <p className="text-sm text-red-700" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={isLoading || !token}
              className="w-full py-3 rounded-2xl bg-black text-white font-display font-bold disabled:opacity-50"
            >
              {isLoading ? t('pwd.saving') : t('pwd.save')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default withIsland(ResetPasswordPage);
