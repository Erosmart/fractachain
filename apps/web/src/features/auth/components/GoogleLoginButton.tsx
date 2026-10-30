import { useState } from 'react';
import { Notice } from '@/components/ui/kit';
import type { SessionUser } from '@/core/auth/SessionUser';
import { errorMessage } from '@/core/errors';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';

interface GoogleLoginButtonProps {
  label?: string;
  onSuccess?: (user: SessionUser) => void;
  className?: string;
}

export default function GoogleLoginButton({ label, onSuccess, className = '' }: GoogleLoginButtonProps) {
  const { loginWithGoogle, isLoading } = useAuth();
  const { t } = useI18n();
  const [error, setError] = useState('');

  const handleLogin = async () => {
    setError('');
    try {
      const result = await loginWithGoogle();
      // With 2FA the Navbar dialog takes over and redirects when done.
      if (result.status === 'signed-in') onSuccess?.(result.user);
    } catch (err) {
      setError(errorMessage(err, t('misc.googleUnavailable')));
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={isLoading}
        onClick={handleLogin}
        className={`btn btn-secondary ${className}`}
      >
        {/* Official Google "G" (brand colors are part of the mark). */}
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
          />
          <path
            fill="#34A853"
            d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
          />
          <path
            fill="#FBBC05"
            d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
          />
          <path
            fill="#EA4335"
            d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
          />
        </svg>
        <span>{isLoading ? t('auth.googleLoading') : label || t('auth.google')}</span>
      </button>
      {error ? (
        <Notice tone="bad" className="mt-2">
          {error}
        </Notice>
      ) : null}
    </>
  );
}
