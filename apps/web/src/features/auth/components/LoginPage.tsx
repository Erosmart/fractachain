import { useEffect, useId, useState, type SubmitEvent } from 'react';
import { ArrowRight, Wallet } from 'lucide-react';
import { withIsland } from '@/components/island/withIsland';
import { Notice, StatusChip } from '@/components/ui/kit';
import WalletAddress from '@/components/ui/WalletAddress';
import type { LoginResult } from '@/core/auth/AuthService';
import { afterAuthPath } from '@/core/auth/onboardingPath';
import type { SessionUser } from '@/core/auth/SessionUser';
import { container } from '@/core/container';
import { errorMessage } from '@/core/errors';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';
import AuthShell from './AuthShell';
import GoogleLoginButton from './GoogleLoginButton';

const { navigator } = container;

function LoginPage() {
  const { user, loginWithEmail, loginWithWallet, linkFreighterWallet, isLoading, logout } = useAuth();
  const { t } = useI18n();
  const ids = useId();
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // `/login?mode=register` (and the old /register route) opens the sign-up wording.
  useEffect(() => setRegister(navigator.searchParam('mode') === 'register'), []);

  const goAfterAuth = (u: SessionUser) => navigator.navigate(afterAuthPath(u, navigator.searchParam('next')));
  /** A 2FA account stops here: the dialog (mounted in the Navbar) finishes the login. */
  const onResult = (result: LoginResult) => {
    if (result.status === 'signed-in') goAfterAuth(result.user);
  };

  const handleEmail = async (e: SubmitEvent) => {
    e.preventDefault();
    setError('');
    try {
      // The name only matters when the account is created: signing in with it would rename the account.
      onResult(await loginWithEmail(email, password, register ? name : ''));
    } catch (err) {
      setError(errorMessage(err, t('misc.loginFail')));
    }
  };

  const handleWallet = async () => {
    setError('');
    try {
      onResult(await loginWithWallet());
    } catch (err) {
      setError(errorMessage(err, t('misc.loginWalletFail')));
    }
  };

  if (user) {
    return (
      <AuthShell title={t('landing.auth.alreadyTitle')} subtitle={user.email}>
        <div className="space-y-4">
          {user.kycStatus !== 'APPROVED' && (
            <div className="flex items-start gap-3 rounded-xl bg-sky-soft px-4 py-3">
              <StatusChip tone="sky">{t(`shell.kyc.${user.kycStatus}`)}</StatusChip>
              <p className="text-[13px] text-ink-2">{t('landing.auth.kycNote')}</p>
            </div>
          )}
          <div className="rounded-xl border border-line bg-surface-2 px-4 py-3">
            <p className="eyebrow mb-1.5">{t('landing.auth.walletLabel')}</p>
            <WalletAddress address={user.publicKey} />
          </div>
          {notice && <Notice tone="good">{notice}</Notice>}
          {error && <Notice tone="bad">{error}</Notice>}
          <button type="button" onClick={() => goAfterAuth(user)} className="btn btn-primary btn-lg w-full">
            {t('auth.continue')}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
          {user.custodyMode !== 'SELF' && (
            <button
              type="button"
              onClick={() =>
                linkFreighterWallet()
                  .then(() => setNotice(t('auth.linkWalletHint')))
                  .catch((err: unknown) => setError(errorMessage(err)))
              }
              disabled={isLoading}
              className="btn btn-secondary w-full"
            >
              {t('auth.linkWallet')}
            </button>
          )}
          <button type="button" onClick={logout} className="btn btn-ghost w-full">
            {t('auth.logout')}
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      aside
      eyebrow={t('landing.auth.eyebrow')}
      title={register ? t('landing.auth.registerTitle') : t('landing.auth.title')}
      subtitle={register ? t('landing.auth.registerSubtitle') : t('landing.auth.subtitle')}
    >
      <div className="grid gap-2.5 sm:grid-cols-2">
        <GoogleLoginButton className="w-full" onSuccess={goAfterAuth} />
        <button
          type="button"
          onClick={handleWallet}
          disabled={isLoading}
          className="btn btn-secondary w-full"
        >
          <Wallet className="h-4 w-4" aria-hidden="true" />
          {isLoading ? t('auth.walletLoading') : t('auth.wallet')}
        </button>
      </div>

      <div className="my-6 flex items-center gap-3 text-xs text-muted" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        {t('auth.orEmail')}
        <span className="h-px flex-1 bg-line" />
      </div>

      <form onSubmit={handleEmail} className="space-y-4">
        {register && (
          <div>
            <label htmlFor={`${ids}-name`} className="label">
              {t('landing.auth.name')}{' '}
              <span className="font-normal text-muted">· {t('landing.auth.nameHint')}</span>
            </label>
            <input
              id={`${ids}-name`}
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
            />
          </div>
        )}
        <div>
          <label htmlFor={`${ids}-email`} className="label">
            {t('auth.email')}
          </label>
          <input
            id={`${ids}-email`}
            required
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
          />
        </div>
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor={`${ids}-password`} className="label">
              {t('landing.auth.password')}
            </label>
            {!register && (
              <a
                href="/forgot-password"
                className="mb-1.5 text-xs text-ink-2 underline-offset-2 hover:text-ink hover:underline"
              >
                {t('pwd.forgotLink')}
              </a>
            )}
          </div>
          <input
            id={`${ids}-password`}
            required
            minLength={6}
            type="password"
            autoComplete={register ? 'new-password' : 'current-password'}
            aria-describedby={`${ids}-password-hint`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
          />
          <p id={`${ids}-password-hint`} className="mt-1.5 text-xs text-muted">
            {t('landing.auth.passwordHint')}
          </p>
        </div>
        {error && <Notice tone="bad">{error}</Notice>}
        <button type="submit" disabled={isLoading} className="btn btn-primary btn-lg w-full">
          {isLoading ? t('auth.entering') : t('auth.continue')}
          {!isLoading && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
        </button>
      </form>

      <p className="mt-6 text-xs text-muted">{t('landing.auth.kycNote')}</p>
      <p className="mt-1 text-xs text-muted">{t('landing.auth.terms')}</p>
    </AuthShell>
  );
}

export default withIsland(LoginPage);
