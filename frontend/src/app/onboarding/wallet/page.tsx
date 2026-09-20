'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Landmark } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useI18n } from '../../../context/I18nContext';

export default function WalletOnboardingPage() {
  const { user, chooseCustody, revealedSecret, isLoading } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const pick = async (mode: 'CUSTODIAL' | 'SELF') => {
    setError('');
    setBusy(true);
    try {
      await chooseCustody(mode);
      if (mode === 'CUSTODIAL') router.push('/onboarding/kyc');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!user) {
    router.replace('/login');
    return null;
  }

  if (user.custodyMode && !revealedSecret) {
    router.replace('/onboarding/kyc');
    return null;
  }

  return (
    <div className="max-w-3xl mx-auto py-12 space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-extrabold font-display">{t('onboarding.walletTitle')}</h1>
        <p className="text-neutral-600">{t('onboarding.walletLead')}</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <button
          type="button"
          disabled={busy || isLoading}
          onClick={() => pick('CUSTODIAL')}
          className="p-6 rounded-3xl crystal-card text-left space-y-3 hover:border-black/20"
        >
          <Landmark className="w-7 h-7" />
          <h2 className="font-section text-xl font-extrabold">{t('onboarding.custodialTitle')}</h2>
          <p className="text-neutral-600 text-sm">
            {t('onboarding.custodialBody')}
          </p>
        </button>
        <button
          type="button"
          disabled={busy || isLoading}
          onClick={() => pick('SELF')}
          className="p-6 rounded-3xl crystal-card text-left space-y-3 hover:border-black/20"
        >
          <KeyRound className="w-7 h-7" />
          <h2 className="font-section text-xl font-extrabold">{t('onboarding.selfTitle')}</h2>
          <p className="text-neutral-600 text-sm">
            {t('onboarding.selfBody')}
          </p>
        </button>
      </div>

      {revealedSecret && (
        <div className="p-6 rounded-3xl border border-black/10 bg-white space-y-3">
          <p className="font-bold">{t('onboarding.secretWarn')}</p>
          <code className="block p-3 rounded-xl bg-neutral-100 text-xs break-all">{revealedSecret}</code>
          <button
            type="button"
            onClick={() => router.push('/onboarding/kyc')}
            className="px-5 py-3 rounded-2xl bg-black text-white font-display font-bold"
          >
            {t('onboarding.secretCta')}
          </button>
        </div>
      )}
      {error && <p className="text-red-700 text-sm">{error}</p>}
    </div>
  );
}
