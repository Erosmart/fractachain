import { useCallback, useEffect, useState } from 'react';
import type { ChainNetwork, ChainRef } from '@fractachain/shared';
import { ArrowUpRight, RefreshCw } from 'lucide-react';
import { withIsland } from '@/components/island/withIsland';
import { Card, Notice } from '@/components/ui/kit';
import { container } from '@/core/container';
import { useI18n } from '@/hooks/useI18n';

/** "CAPXJ6…C66EVP": enough to recognize an ID, the link has the full one. */
export function shortId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 6)}…${id.slice(-6)}` : id;
}

const PREVIEW = 4;

function IdLink({ item }: { item: ChainRef }) {
  return (
    <a
      href={item.explorer}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-mono text-[13px] text-ink underline-offset-2 hover:underline"
      title={item.contractId}
    >
      {shortId(item.contractId)}
      <ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
    </a>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-line/70 py-3 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <dt className="shrink-0 text-[13px] text-muted">{label}</dt>
      <dd className="min-w-0 text-left text-[14px] text-ink sm:text-right">{children}</dd>
    </div>
  );
}

function RefList({ items, label }: { items: ChainRef[]; label: string }) {
  const { messages, t } = useI18n();
  const tr = messages.legal.transparency;
  const [open, setOpen] = useState(false);
  if (items.length === 0) return <Row label={label}>{<span className="text-muted">{tr.none}</span>}</Row>;
  const shown = open ? items : items.slice(0, PREVIEW);
  return (
    <Row label={`${label} · ${items.length}`}>
      <ul className="flex flex-col gap-1.5 sm:items-end">
        {shown.map((item) => (
          <li key={item.contractId}>
            <IdLink item={item} />
          </li>
        ))}
      </ul>
      {items.length > PREVIEW && (
        <button
          type="button"
          className="btn btn-ghost btn-sm mt-1.5 -mr-2"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? tr.showLess : t('legal.transparency.showAll', { n: items.length })}
        </button>
      )}
    </Row>
  );
}

/** Deployed contracts and assets, read live from the API's chain view. */
function TransparencyContracts() {
  const { messages, t, locale } = useI18n();
  const tr = messages.legal.transparency;
  const [data, setData] = useState<ChainNetwork | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [readAt, setReadAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setData(await container.api.chain.network());
      setReadAt(new Date());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const time = readAt?.toLocaleTimeString(locale === 'es' ? 'es-AR' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const accountLink = (address: string) =>
    data ? `${data.explorerUrl.replace(/\/+$/, '')}/account/${address}` : '#';

  return (
    <Card
      title={tr.contractsTitle}
      subtitle={tr.contractsLead}
      actions={
        <button
          type="button"
          className="icon-btn h-8 w-8"
          onClick={() => void load()}
          aria-label={tr.retry}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
        </button>
      }
    >
      <div aria-live="polite" aria-busy={loading}>
        {error && (
          <Notice tone="bad" className="mb-3">
            {tr.error}{' '}
            <button
              type="button"
              className="font-medium underline underline-offset-2"
              onClick={() => void load()}
            >
              {tr.retry}
            </button>
          </Notice>
        )}
        {!data && loading && <p className="py-6 text-center text-sm text-muted">{tr.loading}</p>}
        {data && (
          <>
            <dl>
              <Row label={tr.network}>
                <span className="font-medium capitalize">{data.network}</span>
                <span className="mt-0.5 block font-mono text-[12px] text-muted">
                  {data.networkPassphrase}
                </span>
              </Row>
              <Row label={tr.rpc}>
                <span className="break-all font-mono text-[13px]">{data.rpcUrl}</span>
              </Row>
              <Row label={tr.horizon}>
                <span className="break-all font-mono text-[13px]">{data.horizonUrl}</span>
              </Row>
              <Row label={tr.usdc}>
                {data.usdc ? (
                  <span className="flex flex-col gap-1 sm:items-end">
                    <span className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <span className="font-medium">{data.usdc.code}</span>
                      <span className="chip chip-neutral">
                        {t('legal.transparency.usdcDecimals', { n: data.usdc.decimals })}
                      </span>
                    </span>
                    <IdLink item={{ contractId: data.usdc.contractId, explorer: data.usdc.explorer }} />
                    {data.usdc.issuer && (
                      <span className="text-[12px] text-muted">
                        {tr.usdcIssuer}{' '}
                        <a
                          href={accountLink(data.usdc.issuer)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-ink-2 underline-offset-2 hover:underline"
                          title={data.usdc.issuer}
                        >
                          {shortId(data.usdc.issuer)}
                        </a>
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-muted">{tr.none}</span>
                )}
              </Row>
              <Row label={tr.factory}>
                {data.contracts.factory ? (
                  <IdLink item={data.contracts.factory} />
                ) : (
                  <span className="text-muted">{tr.none}</span>
                )}
              </Row>
              <RefList items={data.contracts.tenders} label={tr.tenders} />
              <RefList items={data.contracts.stockVaults} label={tr.stockVaults} />
              <RefList items={data.contracts.forwards} label={tr.forwards} />
              <RefList items={data.contracts.warrants} label={tr.warrants} />
            </dl>
            {time && <p className="mt-3 text-xs text-muted">{t('legal.transparency.readAt', { time })}</p>}
          </>
        )}
      </div>
    </Card>
  );
}

export default withIsland(TransparencyContracts);
