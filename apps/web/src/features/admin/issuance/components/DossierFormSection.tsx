import { useI18n } from '@/hooks/useI18n';
import { DOSSIER_NUMBER_FIELDS, DOSSIER_TEXT_FIELDS } from '../model';
import type { IssuanceAdmin } from '../hooks/useIssuanceAdmin';

/** Step 1 — the issuer's compliance dossier. */
export default function DossierFormSection({ admin }: { admin: IssuanceAdmin }) {
  const { t } = useI18n();
  const { form, setField, busy } = admin;

  return (
    <section className="p-6 rounded-3xl crystal-card space-y-4">
      <h2 className="font-section text-xl font-extrabold">{t('admIss.sec1')}</h2>
      <div className="grid sm:grid-cols-2 gap-3">
        {DOSSIER_TEXT_FIELDS.map((key) => (
          <label key={key} className="text-sm space-y-1">
            <span className="font-bold">{t(`admIss.f.${key}`)}</span>
            <input
              className="w-full px-3 py-2 rounded-xl border border-black/10"
              value={form[key]}
              onChange={(e) => setField(key, e.target.value)}
            />
          </label>
        ))}
        <label className="sm:col-span-2 text-sm space-y-1 p-4 rounded-2xl border border-black/15 bg-black/[0.03]">
          <span className="font-bold">{t('admIss.proceedsLabel')}</span>
          <input
            className="w-full px-3 py-2 rounded-xl border border-black/10 font-mono"
            placeholder={t('admIss.proceedsPh')}
            value={form.proceedsWallet}
            onChange={(e) => setField('proceedsWallet', e.target.value.trim())}
          />
          <span className="block text-xs text-neutral-600">{t('admIss.proceedsHelp')}</span>
        </label>
        {DOSSIER_NUMBER_FIELDS.map(([key, labelKey]) => (
          <label key={key} className="text-sm space-y-1">
            <span className="font-bold">
              {labelKey ? t(labelKey) : key === 'offeringSoftCapUsdc' ? 'Soft cap USDC' : 'Hard cap USDC'}
            </span>
            <input
              type="number"
              className="w-full px-3 py-2 rounded-xl border border-black/10"
              value={form[key]}
              onChange={(e) => setField(key, Number(e.target.value))}
              onFocus={(e) => e.target.select()}
            />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={admin.createListing}
          disabled={Boolean(busy)}
          className="px-5 py-3 rounded-2xl bg-black text-white font-display font-bold disabled:opacity-40"
        >
          {busy === 'create' ? t('admIss.saving') : t('admIss.saveFile')}
        </button>
        <button
          type="button"
          onClick={admin.fillDemo}
          disabled={Boolean(busy)}
          className="px-5 py-3 rounded-2xl border border-black/20 font-display font-bold disabled:opacity-40"
        >
          {busy === 'demo' ? t('admIss.generating') : t('admIss.demo')}
        </button>
      </div>
    </section>
  );
}
