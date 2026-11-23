import { useEffect, useId, useState, type SubmitEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { withIsland } from '@/components/island/withIsland';
import { Notice } from '@/components/ui/kit';
import { afterAuthPath } from '@/core/auth/onboardingPath';
import { passwordProblem } from '@/core/auth/passwordRules';
import { container } from '@/core/container';
import { errorMessage } from '@/core/errors';
import { consumeUrlToken } from '@/core/security/otpauth';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';
import AuthShell from './AuthShell';

const { navigator } = container;

/** Target of the reset email (`/reset-password?token=…`): new password, then signed in. */
function ResetPasswordPage() {
  const { resetPassword, isLoading } = useAuth();
  const { t } = useI18n();
  const id = useId();
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
    <AuthShell
      icon={<KeyRound className="h-5 w-5" />}
      title={t('pwd.resetTitle')}
      subtitle={t('pwd.resetLead')}
    >
      {checked && !token ? (
        <div className="space-y-4">
          <Notice tone="bad">{t('pwd.missingToken')}</Notice>
          <a href="/forgot-password" className="btn btn-secondary w-full">
            {t('pwd.forgotTitle')}
          </a>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor={`${id}-new`} className="label">
              {t('pwd.newPassword')}
            </label>
            <input
              id={`${id}-new`}
              required
              minLength={8}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label htmlFor={`${id}-repeat`} className="label">
              {t('pwd.repeatPassword')}
            </label>
            <input
              id={`${id}-repeat`}
              required
              minLength={8}
              type="password"
              autoComplete="new-password"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              className="input"
            />
          </div>
          {error && <Notice tone="bad">{error}</Notice>}
          <button type="submit" disabled={isLoading || !token} className="btn btn-primary btn-lg w-full">
            {isLoading ? t('pwd.saving') : t('pwd.save')}
          </button>
        </form>
      )}
    </AuthShell>
  );
}

export default withIsland(ResetPasswordPage);
