import { Card } from '@/components/ui/kit';
import type { ListingDetail } from '@/core/api/types';
import { formatInt } from '@/core/format/number';
import { useI18n } from '@/hooks/useI18n';
import DefinitionGrid from './DefinitionGrid';

/** Who raises and what the money is for. */
export default function IssuerCard({ listing }: { listing: ListingDetail }) {
  const { t } = useI18n();
  const d = listing.dossier;
  const k = (key: string) => t(`offerings.detail.asset.${key}`);
  return (
    <Card title={k('title')} subtitle={k('subtitle')}>
      {d.useOfProceeds && (
        <div className="mb-4 rounded-2xl bg-surface-2 p-4">
          <p className="eyebrow">{k('useOfProceeds')}</p>
          <p className="mt-1.5 text-[15px] leading-relaxed text-ink">{d.useOfProceeds}</p>
        </div>
      )}
      <DefinitionGrid
        rows={[
          { label: k('legalName'), value: d.legalName },
          { label: k('tradeName'), value: d.tradeName || '—' },
          { label: k('cuit'), value: d.cuit },
          { label: k('sector'), value: d.sector || '—' },
          { label: k('jurisdiction'), value: d.jurisdiction || '—' },
          { label: k('authorized'), value: formatInt(d.authorizedShares) },
          { label: k('tokenized'), value: formatInt(d.sharesToTokenize) },
        ]}
      />
    </Card>
  );
}
