import { useEffect, useRef, useState } from 'react';
import { MailCheck, MailX } from 'lucide-react';
import { withIsland } from '@/components/island/withIsland';
import { Notice } from '@/components/ui/kit';
import { container } from '@/core/container';
import { errorMessage } from '@/core/errors';
import { consumeUrlToken } from '@/core/security/otpauth';
import { useI18n } from '@/hooks/useI18n';
import { useSession } from '@/hooks/useSession';
import AuthShell from './AuthShell';

const { security } = container.services;

type State = { kind: 'working' } | { kind: 'ok' } | { kind: 'fail'; message: string };

/** Target of the link in the verification email (`/verify-email?token=…`). */
function VerifyEmailPage() {
  const { user } = useSession();
  const { t } = useI18n();
  const [state, setState] = useState<State>({ kind: 'working' });
  const started = useRef(false);

  useEffect(() => {
    // StrictMode mounts twice in dev: a verification token is single-use.
    if (started.current) return;
    started.current = true;
    const token = consumeUrlToken('token');
    if (!token) {
      setState({ kind: 'fail', message: t('verify.missingToken') });
      return;
    }
    security
      .verifyEmail(token)
      .then(() => setState({ kind: 'ok' }))
      .catch((err: unknown) => setState({ kind: 'fail', message: errorMessage(err, t('verify.fail')) }));
  }, [t]);

  return (
    <AuthShell
      icon={state.kind === 'fail' ? <MailX className="h-5 w-5" /> : <MailCheck className="h-5 w-5" />}
      title={t('verify.title')}
    >
      <div className="space-y-5">
        {state.kind === 'working' ? (
          <p className="text-sm text-ink-2" role="status" aria-live="polite">
            {t('verify.working')}
          </p>
        ) : state.kind === 'ok' ? (
          <Notice tone="good">{t('verify.ok')}</Notice>
        ) : (
          <Notice tone="bad">{state.message}</Notice>
        )}
        {state.kind !== 'working' && (
          <a href={user ? '/dashboard' : '/login'} className="btn btn-primary btn-lg w-full">
            {user ? t('landing.auth.goHome') : t('verify.goLogin')}
          </a>
        )}
      </div>
    </AuthShell>
  );
}

export default withIsland(VerifyEmailPage);
