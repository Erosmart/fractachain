import { useEffect, useId, useRef, useState, type SubmitEvent } from 'react';
import { ArrowRight, Check, Circle, Wallet } from 'lucide-react';
import { withIsland } from '@/components/island/withIsland';
import { Notice } from '@/components/ui/kit';
import type { LoginResult } from '@/core/auth/AuthService';
import { afterAuthPath } from '@/core/auth/onboardingPath';
import { MIN_PASSWORD_LENGTH } from '@/core/auth/passwordRules';
import type { SessionUser } from '@/core/auth/SessionUser';
import { container } from '@/core/container';
import { errorMessage } from '@/core/errors';
import { ApiError } from '@/core/http/HttpClient';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';
import {
  FALLBACK_TERMS_VERSION,
  firstInvalid,
  passwordChecks,
  SIGNUP_FIELDS,
  validateSignup,
  type SignupError,
  type SignupField,
  type SignupInput,
} from '../model';
import AuthShell from './AuthShell';
import GoogleLoginButton from './GoogleLoginButton';
import LinkedText, { DocLink } from './LinkedText';

const { navigator, api } = container;

const EMPTY: SignupInput = {
  name: '',
  email: '',
  password: '',
  confirm: '',
  acceptTerms: false,
  acceptRisks: false,
};

function RegisterPage() {
  const { user, register, loginWithWallet, isLoading } = useAuth();
  const { t } = useI18n();
  const ids = useId();
  const id = (f: SignupField) => `${ids}-${f}`;
  const [form, setForm] = useState<SignupInput>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<SignupField, SignupError>>>({});
  const [failure, setFailure] = useState('');
  const [version, setVersion] = useState(FALLBACK_TERMS_VERSION);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    void api.account
      .legal()
      .then((v) => v?.termsVersion && setVersion(v.termsVersion))
      .catch(() => undefined);
  }, []);

  // Signed in already (e.g. came back with the back button): continue where they belong.
  useEffect(() => {
    if (user) navigator.replace(afterAuthPath(user, navigator.searchParam('next')));
  }, [user]);

  const goAfterAuth = (u: SessionUser) => navigator.navigate(afterAuthPath(u, navigator.searchParam('next')));
  const onResult = (result: LoginResult) => {
    if (result.status === 'signed-in') goAfterAuth(result.user);
  };

  const set = <K extends SignupField>(key: K, value: SignupInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const focusField = (f: SignupField) =>
    formRef.current?.querySelector<HTMLElement>(`#${CSS.escape(id(f))}`)?.focus();

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    setFailure('');
    const found = validateSignup(form);
    setErrors(found);
    const first = firstInvalid(SIGNUP_FIELDS, found);
    if (first) {
      focusField(first);
      return;
    }
    try {
      onResult(
        await register({
          name: form.name,
          email: form.email,
          password: form.password,
          termsVersion: version,
        }),
      );
    } catch (err) {
      if (err instanceof ApiError && err.code === 'CONFLICT') {
        setErrors({ email: 'exists' });
        focusField('email');
      } else if (err instanceof ApiError && err.code === 'TERMS_REQUIRED') {
        setErrors({ acceptTerms: 'terms' });
        focusField('acceptTerms');
      } else {
        setFailure(errorMessage(err, t('misc.loginFail')));
      }
    }
  };

  const handleWallet = async () => {
    setFailure('');
    try {
      onResult(await loginWithWallet());
    } catch (err) {
      setFailure(errorMessage(err, t('misc.loginWalletFail')));
    }
  };

  const errorText = (f: SignupField) => {
    const key = errors[f];
    if (!key) return null;
    return t(`account.signup.errors.${key}`, { n: MIN_PASSWORD_LENGTH });
  };
  const fieldProps = (f: SignupField) => ({
    id: id(f),
    'aria-invalid': errors[f] ? true : undefined,
    'aria-describedby': errors[f] ? `${id(f)}-error` : undefined,
  });
  const FieldError = ({ f }: { f: SignupField }) =>
    errors[f] ? (
      <p id={`${id(f)}-error`} className="mt-1.5 text-xs text-bad">
        {errorText(f)}
        {errors[f] === 'exists' && (
          <>
            {' '}
            <a href="/login" className="font-medium underline underline-offset-2">
              {t('account.signup.signIn')}
            </a>
            {' · '}
            <a href="/forgot-password" className="font-medium underline underline-offset-2">
              {t('pwd.forgotLink')}
            </a>
          </>
        )}
      </p>
    ) : null;

  const checks = passwordChecks(form.password, form.confirm);
  const newTab = t('account.signup.newTab');
  const hasErrors = Object.values(errors).some(Boolean);

  return (
    <AuthShell
      aside
      eyebrow={t('account.signup.eyebrow')}
      title={t('account.signup.title')}
      subtitle={t('account.signup.subtitle')}
    >
      <form ref={formRef} onSubmit={submit} noValidate className="space-y-4">
        {hasErrors && (
          <Notice tone="bad" className="text-[13px]">
            {t('account.signup.errors.summary')}
          </Notice>
        )}
        <div>
          <label htmlFor={id('name')} className="label">
            {t('account.signup.name')}
          </label>
          <input
            {...fieldProps('name')}
            type="text"
            autoComplete="name"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            className="input aria-[invalid=true]:border-bad"
          />
          <FieldError f="name" />
        </div>
        <div>
          <label htmlFor={id('email')} className="label">
            {t('account.signup.email')}
          </label>
          <input
            {...fieldProps('email')}
            type="email"
            autoComplete="email"
            inputMode="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            className="input aria-[invalid=true]:border-bad"
          />
          <FieldError f="email" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={id('password')} className="label">
              {t('account.signup.password')}
            </label>
            <input
              {...fieldProps('password')}
              type="password"
              autoComplete="new-password"
              aria-describedby={[errors.password ? `${id('password')}-error` : '', `${ids}-rules`]
                .filter(Boolean)
                .join(' ')}
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
              className="input aria-[invalid=true]:border-bad"
            />
            <FieldError f="password" />
          </div>
          <div>
            <label htmlFor={id('confirm')} className="label">
              {t('account.signup.confirm')}
            </label>
            <input
              {...fieldProps('confirm')}
              type="password"
              autoComplete="new-password"
              value={form.confirm}
              onChange={(e) => set('confirm', e.target.value)}
              className="input aria-[invalid=true]:border-bad"
            />
            <FieldError f="confirm" />
          </div>
        </div>
        <ul id={`${ids}-rules`} className="space-y-1 text-xs" aria-live="polite">
          {(
            [
              ['length', t('account.signup.rules.length', { n: MIN_PASSWORD_LENGTH })],
              ['match', t('account.signup.rules.match')],
            ] as const
          ).map(([key, label]) => (
            <li key={key} className={`flex items-center gap-1.5 ${checks[key] ? 'text-good' : 'text-muted'}`}>
              {checks[key] ? (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Circle className="h-3 w-3" aria-hidden="true" />
              )}
              {label}
            </li>
          ))}
        </ul>

        <div className="space-y-3 rounded-xl border border-line bg-surface-2 p-4">
          {(
            [
              [
                'acceptTerms',
                <LinkedText
                  key="t"
                  text={t('account.signup.acceptTerms')}
                  parts={{
                    terms: (
                      <DocLink href="/legal/terms" newTab={newTab}>
                        {t('account.signup.termsLink')}
                      </DocLink>
                    ),
                    privacy: (
                      <DocLink href="/legal/privacy" newTab={newTab}>
                        {t('account.signup.privacyLink')}
                      </DocLink>
                    ),
                  }}
                />,
              ],
              [
                'acceptRisks',
                <LinkedText
                  key="r"
                  text={t('account.signup.acceptRisks')}
                  parts={{
                    risks: (
                      <DocLink href="/legal/risks" newTab={newTab}>
                        {t('account.signup.risksLink')}
                      </DocLink>
                    ),
                  }}
                />,
              ],
            ] as const
          ).map(([f, label]) => (
            <div key={f}>
              <div className="flex items-start gap-3">
                <input
                  {...fieldProps(f)}
                  type="checkbox"
                  checked={form[f]}
                  onChange={(e) => set(f, e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--navy))]"
                />
                <label htmlFor={id(f)} className="text-[13px] leading-relaxed text-ink-2">
                  {label}
                </label>
              </div>
              <FieldError f={f} />
            </div>
          ))}
        </div>

        {failure && <Notice tone="bad">{failure}</Notice>}
        <button type="submit" disabled={isLoading} className="btn btn-primary btn-lg w-full">
          {isLoading ? t('account.signup.submitting') : t('account.signup.submit')}
          {!isLoading && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
        </button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs text-muted" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        {t('account.signup.or')}
        <span className="h-px flex-1 bg-line" />
      </div>
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
      <p className="mt-3 text-xs text-muted">{t('account.signup.altNote')}</p>

      <p className="mt-6 text-sm text-ink-2">
        {t('account.signup.haveAccount')}{' '}
        <a href="/login" className="font-medium text-ink underline underline-offset-2">
          {t('account.signup.signIn')}
        </a>
      </p>
    </AuthShell>
  );
}

export default withIsland(RegisterPage);
