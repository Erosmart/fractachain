import { Sparkles } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { DOSSIER_GROUPS, type DossierField } from '../model';
import type { IssuanceAdmin } from '../hooks/useIssuanceAdmin';

/** Step 1 — the issuer's compliance dossier, grouped as compliance reads it. */
export default function DossierFormSection({
  admin,
  onClose,
}: {
  admin: IssuanceAdmin;
  onClose?: () => void;
}) {
  const { t } = useI18n();
  const { form, setField, busy } = admin;

  const input = (f: DossierField) => {
    const id = `dossier-${f.key}`;
    const value = form[f.key];
    return (
      <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2 lg:col-span-3' : ''}>
        <label htmlFor={id} className="label">
          {t(f.label)}
        </label>
        {f.type === 'textarea' ? (
          <textarea
            id={id}
            rows={2}
            className="input"
            value={String(value)}
            onChange={(e) => setField(f.key, e.target.value as never)}
          />
        ) : (
          <input
            id={id}
            type={f.type === 'number' ? 'number' : 'text'}
            inputMode={f.type === 'number' ? 'decimal' : undefined}
            className={`input ${f.mono ? 'font-mono text-xs' : ''}`}
            value={value}
            spellCheck={f.mono ? false : undefined}
            onChange={(e) =>
              setField(f.key, (f.type === 'number' ? Number(e.target.value) : e.target.value) as never)
            }
            onFocus={f.type === 'number' ? (e) => e.target.select() : undefined}
          />
        )}
      </div>
    );
  };

  return (
    <section className="card card-pad space-y-6" aria-labelledby="dossier-title" id="dossier">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="dossier-title" className="title">
            {t('admin.issuance.dossier')}
          </h2>
          <p className="subtitle mt-0.5">{t('admin.issuance.dossierSub')}</p>
        </div>
        <button
          type="button"
          onClick={admin.fillDemo}
          disabled={Boolean(busy)}
          className="btn btn-soft btn-sm"
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          {busy === 'demo' ? t('admIss.generating') : t('admIss.demo')}
        </button>
      </header>

      {DOSSIER_GROUPS.map((group) => (
        <fieldset key={group.title} className="space-y-3">
          <legend className="eyebrow mb-3">{t(group.title)}</legend>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{group.fields.map(input)}</div>
        </fieldset>
      ))}

      <fieldset className="rounded-2xl bg-surface-2 p-4">
        <legend className="sr-only">{t('admin.issuance.groupPayout')}</legend>
        <label htmlFor="dossier-proceedsWallet" className="label">
          {t('admIss.proceedsLabel')}
        </label>
        <input
          id="dossier-proceedsWallet"
          className="input font-mono text-xs"
          placeholder={t('admIss.proceedsPh')}
          value={form.proceedsWallet}
          spellCheck={false}
          autoComplete="off"
          aria-describedby="dossier-proceeds-help"
          onChange={(e) => setField('proceedsWallet', e.target.value.trim())}
        />
        <p id="dossier-proceeds-help" className="mt-2 text-xs leading-relaxed text-muted">
          {t('admIss.proceedsHelp')}
        </p>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={admin.createListing}
          disabled={Boolean(busy)}
          className="btn btn-primary"
        >
          {busy === 'create' ? t('admIss.saving') : t('admIss.saveFile')}
        </button>
        {onClose && (
          <button type="button" onClick={onClose} className="btn btn-ghost">
            {t('admin.common.cancel')}
          </button>
        )}
      </div>
    </section>
  );
}
