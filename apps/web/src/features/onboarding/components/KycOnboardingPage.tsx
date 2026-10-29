import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { Camera } from 'lucide-react';
import { withIsland } from '@/components/island/withIsland';
import { container } from '@/core/container';
import { errorMessage } from '@/core/errors';
import { imageToDataUrl } from '@/core/media/imageToDataUrl';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';

const { navigator } = container;

/** Step 2 of onboarding: legal name, CUIT and selfie. */
function KycOnboardingPage() {
  const { user, submitKyc, isLoading } = useAuth();
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const isWalletAccount = user?.authProvider === 'wallet';
  const [legalName, setLegalName] = useState(user?.name || '');
  const [kycEmail, setKycEmail] = useState('');
  const [cuit, setCuit] = useState('');
  const [selfie, setSelfie] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showKycModal, setShowKycModal] = useState(true);

  const mustLogin = !isLoading && !user;
  useEffect(() => {
    if (mustLogin) navigator.replace('/login');
  }, [mustLogin]);

  const onFile = async (file: File) => {
    setSelfie(await imageToDataUrl(file));
  };

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await submitKyc({
        legalName,
        cuit,
        selfieDataUrl: selfie || undefined,
        email: isWalletAccount ? kycEmail : undefined,
      });
      navigator.navigate('/onboarding/pending');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) return <p className="py-16 text-center text-neutral-500">{t('auth.loading')}</p>;
  if (!user) return null;

  return (
    <div className="max-w-lg mx-auto py-12 space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-extrabold font-display">{t('onboarding.kycTitle')}</h1>
        <p className="text-neutral-600">{t('onboarding.kycLead')}</p>
      </div>
      <form onSubmit={submit} className="p-6 rounded-3xl crystal-card space-y-4">
        <label className="block space-y-1 text-sm">
          <span className="font-bold">{t('onboarding.fullName')}</span>
          <input
            required
            autoComplete="name"
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-black/10"
          />
        </label>
        {isWalletAccount && (
          <label className="block space-y-1 text-sm">
            <span className="font-bold">{t('onboarding.kycEmail')}</span>
            <input
              required
              type="email"
              autoComplete="email"
              value={kycEmail}
              onChange={(e) => setKycEmail(e.target.value)}
              placeholder="tu@mail.com"
              className="w-full px-3 py-2.5 rounded-xl border border-black/10"
            />
          </label>
        )}
        <label className="block space-y-1 text-sm">
          <span className="font-bold">{t('onboarding.cuit')}</span>
          <input
            required
            inputMode="numeric"
            value={cuit}
            onChange={(e) => setCuit(e.target.value)}
            placeholder="20-12345678-3"
            className="w-full px-3 py-2.5 rounded-xl border border-black/10"
          />
        </label>
        <div className="space-y-2">
          <span className="text-sm font-bold">
            {t('onboarding.selfie')}
            {isWalletAccount && <span className="ml-2 text-xs font-normal text-neutral-500">({t('onboarding.selfieOptional')})</span>}
          </span>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full p-6 rounded-2xl border border-dashed border-black/20 flex flex-col items-center gap-2"
          >
            {selfie ? (
              <img src={selfie} alt="Selfie" className="h-36 w-36 object-cover rounded-full" />
            ) : (
              <>
                <Camera className="w-8 h-8" />
                <span className="text-sm text-neutral-600">{t('onboarding.selfieCta')}</span>
              </>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="user"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFile(file);
            }}
          />
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button
          type="submit"
          disabled={busy || (!isWalletAccount && !selfie)}
          className="w-full py-3 rounded-2xl bg-black text-white font-display font-bold disabled:opacity-50"
        >
          {busy ? t('onboarding.sending') : t('onboarding.send')}
        </button>
      </form>
      {showKycModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="kyc-modal-title">
          <div className="max-w-sm w-full rounded-3xl bg-white p-6 space-y-4 shadow-2xl">
            <h2 id="kyc-modal-title" className="text-xl font-extrabold font-display">
              {t('onboarding.kycModalTitle')}
            </h2>
            <p className="text-sm text-neutral-600">{t('onboarding.kycModalBody')}</p>
            <button
              type="button"
              autoFocus
              onClick={() => setShowKycModal(false)}
              className="w-full py-3 rounded-2xl bg-black text-white font-display font-bold"
            >
              {t('onboarding.kycModalCta')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default withIsland(KycOnboardingPage);
