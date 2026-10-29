import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, Check, Copy, ExternalLink as ExternalIcon, Shield, Wallet } from 'lucide-react';
import { withIsland } from '@/components/island/withIsland';
import ExternalLink from '@/components/ui/ExternalLink';
import { container } from '@/core/container';
import { errorMessage } from '@/core/errors';
import { explorerAccount } from '@/core/format/number';
import GoogleLoginButton from '@/features/auth/components/GoogleLoginButton';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';

const { api, wallet } = container;

/** Custody overview: the user's Stellar account, balances and the testnet USDC faucet. */
function WalletPage() {
  const { user, token, isLoading } = useAuth();
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<string | null>(null);
  const [usdcIssuer, setUsdcIssuer] = useState('');
  const [funding, setFunding] = useState(false);
  const [fundNotice, setFundNotice] = useState('');

  const publicKey = user?.publicKey || '';

  const loadState = useCallback(() => {
    if (!publicKey) return;
    api.wallet
      .state(publicKey)
      .then((d) => {
        if (d?.xlm != null) setBalance(String(d.xlm));
        if (d?.usdc != null) setUsdcBalance(String(d.usdc));
        if (d?.usdcIssuer) setUsdcIssuer(d.usdcIssuer);
      })
      .catch(() => undefined);
  }, [publicKey]);

  useEffect(loadState, [loadState]);

  const fundUsdc = async () => {
    if (!token) return;
    setFunding(true);
    setFundNotice('');
    try {
      const data = await wallet.usdcFunding.ensureReady(() => setFundNotice(t('wallet.usdcSignTrustline')));
      setFundNotice(
        data?.already
          ? t('wallet.usdcAlready', { n: Number(data.balance).toLocaleString() })
          : t('wallet.usdcFunded', { n: Number(data?.balance ?? 0).toLocaleString() }),
      );
      loadState();
    } catch (err) {
      setFundNotice(errorMessage(err, t('wallet.usdcFundFail')));
    } finally {
      setFunding(false);
    }
  };

  const handleCopy = async () => {
    if (!publicKey) return;
    try {
      await navigator.clipboard.writeText(publicKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked: the key is selectable
    }
  };

  if (isLoading) return <p className="py-16 text-center text-neutral-500">{t('auth.loading')}</p>;

  if (!user) {
    return (
      <div className="max-w-xl mx-auto py-12 space-y-6 text-center">
        <h1 className="text-2xl font-extrabold">{t('pages.walletTitle')}</h1>
        <p className="text-neutral-600 text-sm">{t('pages.walletLead')}</p>
        <GoogleLoginButton />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-6 space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-leaf-100 border border-[#8fcb7a]/40 text-[#2f6f28] text-xs font-semibold uppercase tracking-wider">
          <Wallet className="w-3.5 h-3.5" />
          {t('pages.walletKicker')}
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{t('pages.walletTitle')}</h1>
        <p className="text-neutral-600 text-sm">{t('pages.walletLead')}</p>
      </div>

      <div className="rounded-2xl border border-amber-300/80 bg-amber-50 px-4 py-3 text-sm text-amber-950">{t('wallet.honesty')}</div>

      <div className="p-6 rounded-3xl crystal-card space-y-4">
        <div className="flex items-center gap-2 text-[#2f6f28] font-semibold">
          <Shield className="w-4 h-4" />
          {t('wallet.custodialLabel')}
        </div>
        {publicKey ? (
          <>
            <p className="text-xs text-neutral-500">{t('wallet.publicKey')}</p>
            <div className="flex items-start gap-2">
              <code className="text-xs sm:text-sm break-all font-mono flex-1">{publicKey}</code>
              <button type="button" onClick={handleCopy} className="shrink-0 inline-flex items-center gap-1 text-xs font-bold">
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? t('wallet.copied') : t('wallet.copy')}
              </button>
            </div>
            {balance != null && (
              <p className="text-sm">
                {t('wallet.balance')}: <strong>{Number(balance).toFixed(2)} XLM</strong>
              </p>
            )}
            {usdcBalance != null && (
              <p className="text-sm">
                {t('wallet.usdcBalance')}: <strong>{Number(usdcBalance).toLocaleString()} USDC</strong>
              </p>
            )}
            {usdcIssuer && (
              <p className="text-[11px] font-mono break-all text-neutral-500">
                {t('wallet.usdcIssuer')}: USDC:{usdcIssuer}
              </p>
            )}
            {user.custodyMode === 'SELF' && (
              <button
                type="button"
                onClick={fundUsdc}
                disabled={funding}
                className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-[#2f6f28] text-white font-display font-bold text-sm disabled:opacity-40"
              >
                <Wallet className="w-4 h-4" /> {funding ? t('wallet.usdcFunding') : t('wallet.usdcFund')}
              </button>
            )}
            {fundNotice && <p className="text-sm text-neutral-700">{fundNotice}</p>}
            <ExternalLink href={explorerAccount(publicKey)} className="inline-flex items-center gap-2 text-sm font-bold text-[#2f6f28]">
              Stellar Expert <ExternalIcon className="w-4 h-4" />
            </ExternalLink>
          </>
        ) : (
          <div className="space-y-3 text-sm text-neutral-600">
            <p className="inline-flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {t('wallet.noKey')}
            </p>
            <a href="/onboarding/wallet" className="inline-flex items-center gap-2 font-bold text-black">
              {t('wallet.goOnboarding')} <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        )}
      </div>

      <div className="p-6 rounded-3xl border border-neutral-200 space-y-2 text-sm text-neutral-600">
        <p className="font-semibold text-black">{t('wallet.selfCustodyTitle')}</p>
        <p>{t('wallet.selfCustodyBody')}</p>
      </div>

      <a href="/market/IPO-SOJA-PERGAMINO-2026" className="inline-flex items-center gap-2 font-display font-bold">
        {t('wallet.ctaInvest')} <ArrowRight className="w-4 h-4" />
      </a>
    </div>
  );
}

export default withIsland(WalletPage);
