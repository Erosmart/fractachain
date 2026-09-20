'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useI18n } from '../../../context/I18nContext';

export default function KycOnboardingPage() {
  const { user, submitKyc } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [legalName, setLegalName] = useState(user?.name || '');
  const [cuit, setCuit] = useState('');
  const [selfie, setSelfie] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!user) {
    router.replace('/login');
    return null;
  }

  const onFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setSelfie(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await submitKyc({ legalName, cuit, selfieDataUrl: selfie });
      router.push('/onboarding/pending');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

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
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-black/10"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-bold">{t('onboarding.cuit')}</span>
          <input
            required
            value={cuit}
            onChange={(e) => setCuit(e.target.value)}
            placeholder="20-12345678-3"
            className="w-full px-3 py-2.5 rounded-xl border border-black/10"
          />
        </label>
        <div className="space-y-2">
          <span className="text-sm font-bold">{t('onboarding.selfie')}</span>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full p-6 rounded-2xl border border-dashed border-black/20 flex flex-col items-center gap-2"
          >
            {selfie ? (
              // eslint-disable-next-line @next/next/no-img-element
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
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button
          type="submit"
          disabled={busy || !selfie}
          className="w-full py-3 rounded-2xl bg-black text-white font-display font-bold disabled:opacity-50"
        >
          {busy ? t('onboarding.sending') : t('onboarding.send')}
        </button>
      </form>
    </div>
  );
}
