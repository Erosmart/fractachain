import { ArrowUpRight, FileText } from 'lucide-react';
import { Card } from '@/components/ui/kit';
import ExternalLink from '@/components/ui/ExternalLink';
import type { ListingDetail } from '@/core/api/types';
import { useI18n } from '@/hooks/useI18n';

/** Filed documents with their date and SHA-256 fingerprint (the hash anchored on-chain). */
export default function DocumentsCard({ listing }: { listing: ListingDetail }) {
  const { t, locale } = useI18n();
  const d = listing.dossier;
  const fmt = (iso?: string) =>
    iso
      ? new Date(iso).toLocaleDateString(locale === 'en' ? 'en-US' : 'es-AR', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : t('offerings.detail.docs.noDate');
  const docs = [
    { key: 'estatuto', hash: d.estatutoHash, date: listing.createdAt },
    { key: 'cvDeposit', hash: listing.cvDepositHash, date: listing.mintedAt },
    { key: 'terms', hash: '', date: listing.listedAt ?? listing.createdAt, href: d.legalTermsUri },
  ].filter((doc) => doc.hash || doc.href);
  return (
    <Card title={t('offerings.detail.docs.title')} subtitle={t('offerings.detail.docs.subtitle')}>
      <ul className="divide-y divide-line/70">
        {docs.map((doc) => (
          <li key={doc.key} className="flex min-w-0 items-start gap-3 py-3 first:pt-0 last:pb-0">
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-2"
              aria-hidden="true"
            >
              <FileText className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">{t(`offerings.detail.docs.${doc.key}`)}</p>
              <p className="mt-0.5 text-xs text-muted tnum">{fmt(doc.date)}</p>
              {doc.hash && (
                <p className="mt-1 break-all font-mono text-[11px] text-ink-2">
                  <span className="sr-only">{t('offerings.detail.docs.hash')}: </span>
                  sha256:{doc.hash}
                </p>
              )}
            </div>
            {doc.href && (
              <ExternalLink href={doc.href} className="btn btn-secondary btn-sm shrink-0">
                {t('offerings.detail.docs.open')}
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </ExternalLink>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
