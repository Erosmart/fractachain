import { useEffect, useRef, useState } from 'react';
import { MailCheck, MailX } from 'lucide-react';
import { withIsland } from '@/components/island/withIsland';
import { container } from '@/core/container';
import { errorMessage } from '@/core/errors';
import { consumeUrlToken } from '@/core/security/otpauth';
import { useI18n } from '@/hooks/useI18n';
import { useSession } from '@/hooks/useSession';

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
    <div className="max-w-md mx-auto py-16 text-center space-y-5">
      {state.kind === 'fail' ? (
        <MailX className="w-10 h-10 mx-auto" aria-hidden />
      ) : (
        <MailCheck className="w-10 h-10 mx-auto" aria-hidden />
      )}
      <h1 className="text-3xl font-extrabold font-display">{t('verify.title')}</h1>
      <p className="text-neutral-600" role={state.kind === 'fail' ? 'alert' : 'status'}>
        {state.kind === 'working'
          ? t('verify.working')
          : state.kind === 'ok'
            ? t('verify.ok')
            : state.message}
      </p>
      {state.kind !== 'working' && (
        <a
          href={user ? '/dashboard' : '/login'}
          className="inline-block px-6 py-3 rounded-2xl bg-black text-white font-display font-bold"
        >
          {user ? t('verify.goDashboard') : t('verify.goLogin')}
        </a>
      )}
    </div>
  );
}

export default withIsland(VerifyEmailPage);
