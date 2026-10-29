import { useEffect, useState } from 'react';
import { KeyRound, Landmark, Wallet } from 'lucide-react';
import { withIsland } from '@/components/island/withIsland';
import BrandLogo from '@/components/ui/BrandLogo';
import { container } from '@/core/container';
import { errorMessage } from '@/core/errors';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';

const { navigator } = container;

/** Step 1 of onboarding: custodial wallet, generated self-custody key, or Freighter. */
function WalletOnboardingPage() {
  const { user, chooseCustody, linkFreighterWallet, revealedSecret, isLoading } = useAuth();
  const { t } = useI18n();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const mustLogin = !isLoading && !user;
  const alreadyChosen = Boolean(user?.custodyMode && !revealedSecret);

  useEffect(() => {
    if (mustLogin) navigator.replace('/login');
    else if (alreadyChosen) navigator.replace('/onboarding/kyc');
  }, [mustLogin, alreadyChosen]);

  const pick = async (mode: 'CUSTODIAL' | 'SELF', publicKey?: string) => {
    setError('');
    setBusy(true);
    try {
      await chooseCustody(mode, publicKey);
      if (mode === 'CUSTODIAL' || publicKey) navigator.navigate('/onboarding/kyc');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const pickFreighter = async () => {
    setError('');
    setBusy(true);
    try {
      // Signs a challenge: the backend checks the investor controls the key and
      // stores publicKey + custodyMode=SELF before moving on to KYC.
      await linkFreighterWallet();
      navigator.navigate('/onboarding/kyc');
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  if (isLoading) return <p className="py-16 text-center text-neutral-500">{t('auth.loading')}</p>;
  if (mustLogin || alreadyChosen) return null;

  return (
    <div className="max-w-3xl mx-auto py-12 space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-extrabold font-display">{t('onboarding.walletTitle')}</h1>
        <p className="text-neutral-600">{t('onboarding.walletLead')}</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <button
          type="button"
          disabled={busy || isLoading}
          onClick={() => pick('CUSTODIAL')}
          className="p-6 rounded-3xl crystal-card text-left space-y-3 hover:border-black/20"
        >
          <Landmark className="w-7 h-7" />
          <h2 className="font-section text-xl font-extrabold">{t('onboarding.custodialTitle')}</h2>
          <p className="text-neutral-600 text-sm">{t('onboarding.custodialBody')}</p>
        </button>
        <button
          type="button"
          disabled={busy || isLoading}
          onClick={() => pick('SELF')}
          className="p-6 rounded-3xl crystal-card text-left space-y-3 hover:border-black/20"
        >
          <KeyRound className="w-7 h-7" />
          <h2 className="font-section text-xl font-extrabold">{t('onboarding.selfTitle')}</h2>
          <p className="text-neutral-600 text-sm">{t('onboarding.selfBody')}</p>
        </button>
        <button
          type="button"
          disabled={busy || isLoading}
          onClick={pickFreighter}
          className="p-6 rounded-3xl crystal-card text-left space-y-3 hover:border-black/20"
        >
          <BrandLogo slug="freighter" alt="Freighter" className="h-7 w-auto object-contain object-left" fallback={<Wallet className="w-7 h-7" />} />
          <h2 className="font-section text-xl font-extrabold">{t('onboarding.freighterTitle')}</h2>
          <p className="text-neutral-600 text-sm">{t('onboarding.freighterBody')}</p>
        </button>
      </div>

      {revealedSecret && (
        <div className="p-6 rounded-3xl border border-black/10 bg-white space-y-3">
          <p className="font-bold">{t('onboarding.secretWarn')}</p>
          <code className="block p-3 rounded-xl bg-neutral-100 text-xs break-all">{revealedSecret}</code>
          <button
            type="button"
            onClick={() => {
              container.stores.session.setRevealedSecret(null);
              navigator.navigate('/onboarding/kyc');
            }}
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

export default withIsland(WalletOnboardingPage);
