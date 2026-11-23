import ExternalLink from '@/components/ui/ExternalLink';
import { StatusChip } from '@/components/ui/kit';
import { formatInt } from '@/core/format/number';
import { useI18n } from '@/hooks/useI18n';
import ChainCard from '../../derivatives/components/chain/ChainCard';
import ComingSoonActions from '../../derivatives/components/chain/ComingSoonActions';
import { AccountLink, AssetAmount, Facts } from '../../derivatives/components/chain/Facts';
import type { StockVaultView } from '../model';

/** One stock vault: what the contract says about the stock, the dividend pool and the viewer's position. */
export default function StockVaultCard({
  vault,
  signedIn,
  hasWallet,
}: {
  vault: StockVaultView;
  signedIn: boolean;
  hasWallet: boolean;
}) {
  const { t } = useI18n();
  const k = (key: string, vars?: Record<string, string | number>) => t(`markets.stocks.${key}`, vars);
  const proof = vault.lastProof;
  return (
    <ChainCard
      title={`${vault.ticker}${vault.company ? ` · ${vault.company}` : ''}`}
      subtitle={k('instance')}
      status={
        <StatusChip tone={vault.mintPaused ? 'warn' : 'good'}>
          {vault.mintPaused ? k('por.paused') : k('por.enabled')}
        </StatusChip>
      }
      source={vault.source}
      actions={
        <ComingSoonActions
          actions={[k('actions.buy'), k('actions.sell'), k('actions.claim'), k('actions.redeem')]}
        />
      }
    >
      <Facts
        items={[
          { label: k('isin'), value: vault.isin ?? '—' },
          { label: k('custodian'), value: vault.custodianCuit ?? '—' },
          {
            label: k('unclaimed'),
            value:
              vault.unclaimedPool === null ? (
                <span className="text-ink-2">{k('notReadable')}</span>
              ) : (
                <AssetAmount value={vault.unclaimedPool} code={vault.asset.code} />
              ),
          },
          {
            label: t('markets.chain.paymentToken'),
            value: vault.asset.explorer ? (
              <ExternalLink
                href={vault.asset.explorer}
                className="underline decoration-line-strong underline-offset-2"
              >
                {vault.asset.code}
              </ExternalLink>
            ) : (
              vault.asset.code
            ),
          },
          {
            label: k('lastProof'),
            value: proof ? (
              <span className="flex flex-col gap-0.5">
                <span>
                  {proof.seq !== null && `#${proof.seq} · `}
                  {proof.amount !== null &&
                    k('proofTokens', { n: formatInt(proof.amount), sym: vault.ticker })}
                </span>
                {proof.to && (
                  <span className="text-xs text-ink-2">
                    {k('proofTo')} <AccountLink address={proof.to} />
                  </span>
                )}
                {proof.hash && (
                  <span className="break-all font-mono text-[11px] text-muted" title={proof.hash}>
                    {k('proofSlip')} {proof.hash.slice(0, 16)}…
                  </span>
                )}
              </span>
            ) : (
              k('noProof')
            ),
          },
        ]}
      />

      <section
        className="mt-5 rounded-2xl border border-line px-4 py-3.5"
        aria-labelledby={`holder-${vault.source.contractId}`}
      >
        <h4 id={`holder-${vault.source.contractId}`} className="text-sm font-medium text-ink">
          {k('holder.title')}
        </h4>
        {vault.holder ? (
          <dl className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <dt className="text-xs text-muted">{k('holder.balance')}</dt>
              <dd className="mt-0.5 text-sm text-ink tnum">
                {formatInt(vault.holder.balance)} <span className="text-xs text-ink-2">{vault.ticker}</span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{k('holder.claimable')}</dt>
              <dd className="mt-0.5 text-sm text-ink">
                <AssetAmount value={vault.holder.claimable} code={vault.asset.code} />
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-1 text-xs leading-relaxed text-ink-2">
            {!signedIn ? (
              <>
                {k('holder.signIn')}{' '}
                <a href="/login?next=%2Fstocks" className="font-medium text-ink underline underline-offset-2">
                  {k('holder.signInCta')}
                </a>
              </>
            ) : hasWallet ? (
              k('holder.unavailable')
            ) : (
              <>
                {k('holder.noWallet')}{' '}
                <a href="/onboarding/wallet" className="font-medium text-ink underline underline-offset-2">
                  {k('holder.noWalletCta')}
                </a>
              </>
            )}
          </p>
        )}
      </section>
    </ChainCard>
  );
}
