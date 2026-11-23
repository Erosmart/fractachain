import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { SettlePolicy } from '@fractachain/shared';
import RequireAdmin from '@/components/guards/RequireAdmin';
import { withIsland } from '@/components/island/withIsland';
import { EmptyState, Notice, PageHeader } from '@/components/ui/kit';
import { useI18n } from '@/hooks/useI18n';
import { RefreshButton } from '../../shared/RefreshButton';
import { useIssuanceAdmin } from '../hooks/useIssuanceAdmin';
import DossierFormSection from './DossierFormSection';
import ListingCard from './ListingCard';
import PipelineBoard from './PipelineBoard';
import StockCatalogSection from './StockCatalogSection';

/** Two big radio cards: distribute at the soft cap, or on a date. */
function SettlePolicyCard({
  policy,
  onPolicy,
  settleAt,
  onSettleAt,
}: {
  policy: SettlePolicy;
  onPolicy: (p: SettlePolicy) => void;
  settleAt: string;
  onSettleAt: (v: string) => void;
}) {
  const { t } = useI18n();
  const option = (value: SettlePolicy, label: string) => (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition-colors ${
        policy === value
          ? 'border-navy bg-surface-2 text-ink'
          : 'border-line text-ink-2 hover:border-line-strong'
      }`}
    >
      <input
        type="radio"
        name="issuance-settle"
        className="h-4 w-4 accent-[rgb(var(--navy))]"
        checked={policy === value}
        onChange={() => onPolicy(value)}
      />
      {label}
    </label>
  );
  return (
    <section className="card card-pad" aria-labelledby="settle-title">
      <h2 id="settle-title" className="title">
        {t('admin.issuance.settle')}
      </h2>
      <p className="subtitle mt-0.5">{t('admin.issuance.settleSub')}</p>
      <fieldset className="mt-4 grid gap-2 sm:grid-cols-2">
        <legend className="sr-only">{t('admin.issuance.settle')}</legend>
        {option('ON_MIN', t('admIss.onMin'))}
        {option('ON_DATE', t('admIss.onDate'))}
      </fieldset>
      {policy === 'ON_DATE' && (
        <div className="mt-3 max-w-xs">
          <label htmlFor="issuance-settle-at" className="label">
            {t('admTest.closeDate')}
          </label>
          <input
            id="issuance-settle-at"
            type="datetime-local"
            className="input"
            value={settleAt}
            onChange={(e) => onSettleAt(e.target.value)}
          />
        </div>
      )}
    </section>
  );
}

/** Issuer console: pipeline, dossier → deploy → mint → open → close, dividends and the Merval catalog. */
function AdminIssuance() {
  const { t } = useI18n();
  const admin = useIssuanceAdmin();
  const [mintAmount, setMintAmount] = useState(1000);
  const [dividendAmount, setDividendAmount] = useState(1000);
  const [showForm, setShowForm] = useState(false);
  const listings = [...admin.listings].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('admin.issuance.title')}
        subtitle={t('admin.issuance.lead')}
        actions={
          <>
            <RefreshButton onClick={() => void admin.reload()} busy={admin.loading} />
            <button
              type="button"
              className="btn btn-primary"
              aria-expanded={showForm}
              aria-controls="dossier"
              onClick={() => setShowForm((v) => !v)}
            >
              {showForm ? (
                <X className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Plus className="h-4 w-4" aria-hidden="true" />
              )}
              {showForm ? t('admin.issuance.hideForm') : t('admin.issuance.newIssuance')}
            </button>
          </>
        }
      />

      <div aria-live="polite">{admin.notice && <Notice tone="sky">{admin.notice}</Notice>}</div>

      {showForm && <DossierFormSection admin={admin} onClose={() => setShowForm(false)} />}

      <PipelineBoard listings={listings} paying={admin.paying} />

      <SettlePolicyCard
        policy={admin.settlePolicy}
        onPolicy={admin.setSettlePolicy}
        settleAt={admin.settleAt}
        onSettleAt={admin.setSettleAt}
      />

      <section className="space-y-4" aria-labelledby="listings-title">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="listings-title" className="title">
            {t('admin.issuance.listings')}
          </h2>
          <span className="text-xs text-muted">
            {t('admin.issuance.listingsSub', { n: listings.length })}
          </span>
        </div>
        {listings.length === 0 ? (
          <div className="card">
            <EmptyState
              title={t('admIss.noFiles')}
              action={
                <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {t('admin.issuance.newIssuance')}
                </button>
              }
            />
          </div>
        ) : (
          listings.map((l) => (
            <ListingCard
              key={`${l.id}:${l.dossier.proceedsWallet}`}
              listing={l}
              admin={admin}
              mintAmount={mintAmount}
              onMintAmount={setMintAmount}
              dividendAmount={dividendAmount}
              onDividendAmount={setDividendAmount}
            />
          ))
        )}
      </section>

      <StockCatalogSection admin={admin} />
    </div>
  );
}

function AdminIssuancePage() {
  return (
    <RequireAdmin>
      <AdminIssuance />
    </RequireAdmin>
  );
}

export default withIsland(AdminIssuancePage);
