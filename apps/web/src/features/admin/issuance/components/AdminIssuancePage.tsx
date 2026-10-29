import { useState } from 'react';
import RequireAdmin from '@/components/guards/RequireAdmin';
import { withIsland } from '@/components/island/withIsland';
import Toast from '@/components/ui/Toast';
import { useI18n } from '@/hooks/useI18n';
import { useIssuanceAdmin } from '../hooks/useIssuanceAdmin';
import DossierFormSection from './DossierFormSection';
import ListingCard from './ListingCard';
import StockCatalogSection from './StockCatalogSection';

/** Issuer console: dossier → deploy → mint → open → close, plus the Merval catalog. */
function AdminIssuance() {
  const { t } = useI18n();
  const admin = useIssuanceAdmin();
  const [mintAmount, setMintAmount] = useState(1000);
  const [dividendAmount, setDividendAmount] = useState(1000);
  const { settlePolicy, setSettlePolicy, settleAt, setSettleAt } = admin;

  return (
    <div className="space-y-8 py-6">
      <div>
        <p className="font-lcd text-[11px] uppercase tracking-[0.2em] text-neutral-500">
          {t('admIss.kicker')}
        </p>
        <h1 className="text-3xl font-extrabold font-display">{t('admIss.title')}</h1>
        <p className="text-neutral-600 mt-1 max-w-2xl">{t('admIss.lead')}</p>
      </div>
      <Toast message={admin.notice} />

      <DossierFormSection admin={admin} />

      <section className="space-y-4">
        <h2 className="font-section text-xl font-extrabold">{t('admIss.sec24')}</h2>
        <div className="p-5 rounded-3xl crystal-card space-y-3">
          <p className="font-display font-extrabold">{t('admIss.settleQ')}</p>
          <label className="block text-sm">
            <input
              type="radio"
              name="issuance-settle"
              className="mr-2"
              checked={settlePolicy === 'ON_MIN'}
              onChange={() => setSettlePolicy('ON_MIN')}
            />
            {t('admIss.onMin')}
          </label>
          <label className="block text-sm">
            <input
              type="radio"
              name="issuance-settle"
              className="mr-2"
              checked={settlePolicy === 'ON_DATE'}
              onChange={() => setSettlePolicy('ON_DATE')}
            />
            {t('admIss.onDate')}
          </label>
          {settlePolicy === 'ON_DATE' && (
            <input
              type="datetime-local"
              aria-label={t('admIss.onDate')}
              className="w-full max-w-sm px-3 py-2 rounded-xl border border-black/10"
              value={settleAt}
              onChange={(e) => setSettleAt(e.target.value)}
            />
          )}
          <p className="text-xs text-neutral-500">{t('admIss.settleNote')}</p>
        </div>
        {admin.listings.length === 0 && <p className="text-neutral-500">{t('admIss.noFiles')}</p>}
        {admin.listings.map((l) => (
          <ListingCard
            key={`${l.id}:${l.dossier.proceedsWallet}`}
            listing={l}
            admin={admin}
            mintAmount={mintAmount}
            onMintAmount={setMintAmount}
            dividendAmount={dividendAmount}
            onDividendAmount={setDividendAmount}
          />
        ))}
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
