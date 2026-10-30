import { useEffect, useState } from 'react';
import { MailWarning, ShieldAlert, X } from 'lucide-react';
import { container } from '@/core/container';
import { errorMessage } from '@/core/errors';
import { useI18n } from '@/hooks/useI18n';
import { useSession } from '@/hooks/useSession';

const { security } = container.services;
const sessionStore = container.stores.session;
const DISMISS_KEY = 'fc_email_notice_dismissed';

function readDismissed(): string | null {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

function writeDismissed(userId: string): void {
  try {
    window.sessionStorage.setItem(DISMISS_KEY, userId);
  } catch {
    // storage disabled: the banner simply comes back on the next page
  }
}

/**
 * Account notices shown under the navigation bar:
 * - email/password accounts that have not confirmed their address (dismissible
 *   for the browser session; never blocks navigation);
 * - an account-level refusal reported by the API (admin route without 2FA).
 */
export default function AccountNotices() {
  const { user, notice } = useSession();
  const { t } = useI18n();
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    setDismissedFor(readDismissed());
  }, []);

  const needsEmail = Boolean(
    user && user.authProvider === 'email' && !user.emailVerified && dismissedFor !== user.id,
  );
  const needsTwoFactor = notice?.code === 'TWO_FACTOR_REQUIRED';
  if (!needsEmail && !needsTwoFactor) return null;

  const resend = async () => {
    setError('');
    setStatus('sending');
    try {
      await security.resendVerification();
      setStatus('sent');
    } catch (err) {
      setError(errorMessage(err));
      setStatus('idle');
    }
  };

  return (
    <div className="border-t border-line/70 bg-butter-soft">
      {needsTwoFactor && (
        <div
          className="mx-auto flex max-w-[1440px] items-center gap-2 px-4 py-2 text-xs text-ink sm:px-6 sm:text-sm lg:px-8"
          role="alert"
        >
          <ShieldAlert className="h-4 w-4 shrink-0 text-warn" aria-hidden="true" />
          <span className="flex-1">{notice?.message || t('verify.twoFaBanner')}</span>
          <a href="/account/security" className="whitespace-nowrap font-medium underline underline-offset-2">
            {t('verify.twoFaCta')}
          </a>
          <button
            type="button"
            onClick={() => sessionStore.dismissNotice()}
            aria-label={t('verify.dismiss')}
            className="rounded-md p-1 text-ink-2 hover:bg-ink/5 hover:text-ink"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
      {needsEmail && user && (
        <div
          className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-2 px-4 py-2 text-xs text-ink sm:px-6 sm:text-sm lg:px-8"
          role="status"
        >
          <MailWarning className="h-4 w-4 shrink-0 text-warn" aria-hidden="true" />
          <span className="flex-1 min-w-0">
            {status === 'sent' ? t('verify.sent') : t('verify.bannerText', { email: user.email })}
          </span>
          {error && <span className="text-bad">{error}</span>}
          {status !== 'sent' && (
            <button
              type="button"
              onClick={() => void resend()}
              disabled={status === 'sending'}
              className="whitespace-nowrap font-medium underline underline-offset-2 disabled:opacity-50"
            >
              {status === 'sending' ? t('verify.sending') : t('verify.resend')}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              writeDismissed(user.id);
              setDismissedFor(user.id);
            }}
            aria-label={t('verify.dismiss')}
            className="rounded-md p-1 text-ink-2 hover:bg-ink/5 hover:text-ink"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
