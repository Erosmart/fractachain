import { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  ExternalLink as ExternalIcon,
  KeyRound,
  Landmark,
  RefreshCw,
} from 'lucide-react';
import { withIsland } from '@/components/island/withIsland';
import ExternalLink from '@/components/ui/ExternalLink';
import { Card, GradientPanel, Notice, PageHeader, PanelNote, Stat, StatGrid } from '@/components/ui/kit';
import { container } from '@/core/container';
import { errorMessage } from '@/core/errors';
import { explorerAccount, formatAmount } from '@/core/format/number';
import GoogleLoginButton from '@/features/auth/components/GoogleLoginButton';
import CopyAddress from '@/features/account/components/CopyAddress';
import { LoadingLine } from '@/features/onboarding/components/OnboardingFrame';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';
import { useWalletState } from '../hooks/useWalletState';

const { wallet } = container;

/** Custody overview: the user's Stellar account, balances and the testnet USDC faucet. */
function WalletPage() {
  const { user, isLoading } = useAuth();
  const { t } = useI18n();
  const publicKey = user?.publicKey || '';
  const balances = useWalletState(publicKey || undefined);
  const [funding, setFunding] = useState(false);
  const [fundNotice, setFundNotice] = useState<{ tone: 'good' | 'bad' | 'sky'; text: string } | null>(null);

  const fundUsdc = async () => {
    if (!user) return;
    setFunding(true);
    setFundNotice(null);
    try {
      const data = await wallet.usdcFunding.ensureReady(() =>
        setFundNotice({ tone: 'sky', text: t('wallet.usdcSignTrustline') }),
      );
      setFundNotice({
        tone: 'good',
        text: data?.already
          ? t('wallet.usdcAlready', { n: formatAmount(Number(data.balance ?? 0), 2) })
          : t('wallet.usdcFunded', { n: formatAmount(Number(data?.balance ?? 0), 2) }),
      });
      void balances.reload();
    } catch (err) {
      setFundNotice({ tone: 'bad', text: errorMessage(err, t('wallet.usdcFundFail')) });
    } finally {
      setFunding(false);
    }
  };

  if (isLoading) return <LoadingLine>{t('auth.loading')}</LoadingLine>;

  if (!user) {
    return (
      <section className="card card-pad mx-auto max-w-md space-y-4 text-center">
        <h1 className="text-xl font-normal text-ink">{t('account.walletPage.title')}</h1>
        <p className="text-sm text-ink-2">{t('account.walletPage.signedOut')}</p>
        <GoogleLoginButton />
        <a href="/login" className="btn btn-primary w-full">
          {t('nav.login')}
        </a>
      </section>
    );
  }

  const state = balances.state;
  const usdc = state ? Number(state.usdc) : null;
  const xlm = state ? Number(state.xlm) : null;
  const custodial = user.custodyMode === 'CUSTODIAL';
  const dash = '—';

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('account.walletPage.title')}
        subtitle={t('account.walletPage.lead')}
        actions={
          publicKey ? (
            <ExternalLink href={explorerAccount(publicKey)} className="btn btn-secondary">
              {t('account.walletPage.explorer')}
              <ExternalIcon className="h-4 w-4" aria-hidden="true" />
            </ExternalLink>
          ) : undefined
        }
      />

      {!publicKey ? (
        <Card>
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <AlertCircle className="h-5 w-5 shrink-0 text-ink-2" aria-hidden="true" />
            <div className="flex-1">
              <p className="title">{t('account.wallet.none')}</p>
              <p className="mt-0.5 text-sm text-ink-2">{t('account.wallet.noneBody')}</p>
            </div>
            <a href="/onboarding/wallet" className="btn btn-primary">
              {t('account.wallet.choose')}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        </Card>
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 space-y-5">
            <Card
              title={custodial ? t('account.wallet.custodial') : t('account.wallet.self')}
              subtitle={custodial ? t('account.walletPage.custodialNote') : t('account.walletPage.selfNote')}
              actions={
                <span
                  className="grid h-9 w-9 place-items-center rounded-xl bg-sky-soft text-ink"
                  aria-hidden="true"
                >
                  {custodial ? <Landmark className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
                </span>
              }
            >
              <p className="label">{t('account.wallet.address')}</p>
              <div className="rounded-xl border border-line bg-surface-2 px-3.5 py-2.5">
                <CopyAddress address={publicKey} full />
              </div>
              {state?.usdcIssuer && (
                <p className="mt-3 break-all text-xs text-muted">
                  {t('account.walletPage.usdcIssuer')}: <span className="font-mono">{state.usdcIssuer}</span>
                </p>
              )}
            </Card>

            {!custodial && (
              <Card title={t('account.walletPage.fund')} subtitle={t('account.walletPage.fundHint')}>
                <button
                  type="button"
                  onClick={() => void fundUsdc()}
                  disabled={funding}
                  className="btn btn-primary"
                >
                  {funding ? t('account.walletPage.funding') : t('account.walletPage.fund')}
                </button>
                {fundNotice && (
                  <Notice tone={fundNotice.tone} className="mt-4">
                    {fundNotice.text}
                  </Notice>
                )}
              </Card>
            )}
          </div>

          <GradientPanel
            title={t('account.walletPage.balances')}
            subtitle={t('account.walletPage.balancesSub')}
            footer={
              <PanelNote icon={<ArrowRight className="h-4 w-4" />} href="/market">
                {t('account.walletPage.invest')}
              </PanelNote>
            }
          >
            <div className="flex justify-end px-5 sm:px-6">
              <button
                type="button"
                className="btn btn-ghost btn-sm -mr-2"
                onClick={() => void balances.reload()}
                disabled={balances.loading}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${balances.loading ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                {t('onboard.status.retry')}
              </button>
            </div>
            {balances.failed && !state && (
              <p className="px-5 pb-2 text-sm text-ink-2 sm:px-6" role="status">
                {t('account.wallet.unavailable')}
              </p>
            )}
            <StatGrid className="mt-2 border-t border-ink/10">
              <Stat label="XLM" value={xlm === null ? dash : formatAmount(xlm, 2)} />
              <Stat
                label="USDC"
                value={usdc === null ? dash : formatAmount(usdc, 2)}

                delta={
                  usdc === null
                    ? undefined
                    : usdc > 0
                      ? t('account.wallet.usdcReady')
                      : t('account.wallet.usdcEmpty')
                }
              />
              <Stat label={t('account.panel.positions')} value={String(user.holdings.length)} />
              <Stat label={t('account.panel.enabled')} value={String(user.trustlines.length)} />
            </StatGrid>
          </GradientPanel>
        </div>
      )}
    </div>
  );
}

export default withIsland(WalletPage);
