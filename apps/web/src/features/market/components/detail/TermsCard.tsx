import { Card } from '@/components/ui/kit';
import type { ListingDetail, ValidationPack } from '@/core/api/types';
import { formatAmount, formatInt } from '@/core/format/number';
import { useI18n } from '@/hooks/useI18n';
import { money, type PaymentUnit } from '../../model';
import DefinitionGrid from './DefinitionGrid';

/** Conditions of the issue, as a terms table. */
export default function TermsCard({
  listing,
  validation,
  unit,
}: {
  listing: ListingDetail;
  validation: ValidationPack | null;
  unit: PaymentUnit;
}) {
  const { t, locale } = useI18n();
  const d = listing.dossier;
  const fmt = (n: number) => money(n, unit);
  const k = (key: string, vars?: Record<string, string | number>) => t(`offerings.detail.terms.${key}`, vars);
  const date = (iso: string) =>
    new Date(iso).toLocaleDateString(locale === 'en' ? 'en-US' : 'es-AR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  const rows = [
    { label: k('instrument'), value: k('instrumentValue', { code: d.tokenTicker }) },
    { label: k('price'), value: fmt(d.pricePerShareUsdc) },
    { label: k('payment'), value: unit },
    { label: k('minInvestment'), value: fmt(d.minInvestmentUsdc || d.pricePerShareUsdc) },
    { label: k('softCap'), value: fmt(d.offeringSoftCapUsdc) },
    { label: k('hardCap'), value: fmt(d.offeringHardCapUsdc) },
    { label: k('term'), value: k('termValue', { n: formatInt(d.offeringDays) }) },
    ...(d.tnaUsd > 0
      ? [{ label: k('tna'), value: k('tnaValue', { n: formatAmount(d.tnaUsd, d.tnaUsd % 1 ? 1 : 0) }) }]
      : []),
    {
      label: k('closeRule'),
      value:
        listing.settlePolicy === 'ON_DATE' && listing.settleAt
          ? k('closeOnDate', { date: date(listing.settleAt) })
          : k('closeOnMin'),
      wide: true,
    },
    { label: k('backing'), value: String(validation?.token?.backing ?? '1:1') },
    { label: k('isin'), value: d.isin, mono: true },
    { label: k('cnv'), value: d.cnvRecordId || '—' },
    { label: k('byma'), value: d.bymaRequestId || '—' },
    { label: k('caja'), value: d.cajaSubaccount, mono: true },
    { label: k('custodian'), value: d.custodianCuit },
    { label: k('auditor'), value: d.auditor || '—' },
  ];
  return (
    <Card title={k('title')} subtitle={k('subtitle')}>
      <DefinitionGrid rows={rows} />
    </Card>
  );
}
