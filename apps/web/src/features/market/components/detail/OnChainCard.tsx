import { ArrowUpRight, Check, Clock3, TriangleAlert } from 'lucide-react';
import { Card } from '@/components/ui/kit';
import ExternalLink from '@/components/ui/ExternalLink';
import type { ListingDetail, ValidationPack } from '@/core/api/types';
import { explorerAccount, explorerContract } from '@/core/format/number';
import { useI18n } from '@/hooks/useI18n';
import type { TenderView } from '../../chainModel';

const short = (id: string) => (id.length > 14 ? `${id.slice(0, 6)}…${id.slice(-6)}` : id);

function ChainLink({ label, id, href }: { label: string; id?: string | null; href: (id: string) => string }) {
  const { t } = useI18n();
  if (!id) return null;
  return (
    <li className="flex min-w-0 items-center justify-between gap-3 border-b border-line/70 py-3">
      <span className="text-[13px] text-muted">{label}</span>
      <ExternalLink
        href={href(id)}
        title={`${t('offerings.detail.chain.explorer')}: ${id}`}
        className="inline-flex min-w-0 items-center gap-1 rounded-md font-mono text-xs text-ink underline-offset-2 hover:underline"
      >
        {short(id)}
        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-ink-2" aria-hidden="true" />
      </ExternalLink>
    </li>
  );
}

/** Contracts, wallets and the filing checks — every id links to Stellar Expert. */
export default function OnChainCard({
  listing,
  validation,
  tender,
}: {
  listing: ListingDetail;
  validation: ValidationPack | null;
  /** Fiduciary, payment asset and the withdrawal flag are read from the contract. */
  tender: TenderView | null;
}) {
  const { t } = useI18n();
  const k = (key: string) => t(`offerings.detail.chain.${key}`);
  const licitacion = String(listing.licitacionContract || '').startsWith('C')
    ? listing.licitacionContract
    : null;
  const vault = String(listing.stockContract || '').startsWith('C') ? listing.stockContract : null;
  const fiduciary = tender?.fiduciary ?? null;
  const mismatch = Boolean(
    fiduciary && listing.dossier.proceedsWallet && fiduciary !== listing.dossier.proceedsWallet,
  );

  return (
    <Card title={k('title')} subtitle={k('subtitle')}>
      <ul className="-mt-3">
        <ChainLink label={k('licitacion')} id={licitacion} href={explorerContract} />
        <ChainLink label={k('vault')} id={vault} href={explorerContract} />
        {tender && (
          <ChainLink
            label={`${k('payment')} · ${tender.code}`}
            id={tender.asset.contractId}
            href={explorerContract}
          />
        )}
        <ChainLink label={k('fiduciary')} id={fiduciary} href={explorerAccount} />
        <ChainLink label={k('issuer')} id={listing.dossier.issuerPublicKey} href={explorerAccount} />
      </ul>
      {mismatch && (
        <p
          className="mt-3 flex items-start gap-2 rounded-xl bg-warn-soft px-3 py-2.5 text-[13px] text-warn"
          role="note"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {k('mismatch')}
        </p>
      )}
      {validation?.checks?.length ? (
        <>
          <p className="eyebrow mt-5">{k('checks')}</p>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {validation.checks.map((c) => (
              <li key={c.key} className="flex items-center gap-2 text-[13px] text-ink">
                <span
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${c.ok ? 'bg-good-soft text-good' : 'bg-ink/[0.06] text-muted'}`}
                  aria-hidden="true"
                >
                  {c.ok ? <Check className="h-3 w-3" strokeWidth={3} /> : <Clock3 className="h-3 w-3" />}
                </span>
                <span className="min-w-0 truncate">{c.label}</span>
                <span className="sr-only">: {c.ok ? k('checkOk') : k('checkPending')}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Card>
  );
}
