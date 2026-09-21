'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Wallet,
  Shield,
  Copy,
  Check,
  AlertCircle,
  ExternalLink,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import GoogleLoginButton from '../../components/GoogleLoginButton';
import { useI18n } from '../../context/I18nContext';
import { API_BASE_URL } from '../../lib/api';

export default function WalletPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);

  const publicKey =
    (user as any)?.stellarPublicKey ||
    (user as any)?.publicKey ||
    (user as any)?.wallet?.publicKey ||
    '';

  const usdcIssuer = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
  const cosmosPayUri = publicKey
    ? `web+stellar:pay?destination=${publicKey}&asset_code=USDC&asset_issuer=${usdcIssuer}`
    : '';

  useEffect(() => {
    if (!publicKey) return;
    fetch(`${API_BASE_URL}/api/wallet/balance?account=${encodeURIComponent(publicKey)}`)
      .then((r) => r.json())
      .then((j) => {
        const xlm = j?.data?.xlm ?? j?.xlm ?? j?.data?.balance;
        if (xlm != null) setBalance(String(xlm));
      })
      .catch(() => {});
  }, [publicKey]);

  const handleCopy = () => {
    if (!publicKey) return;
    navigator.clipboard.writeText(publicKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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

      <div className="rounded-2xl border border-amber-300/80 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        {t('wallet.honesty')}
      </div>

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
              <button
                type="button"
                onClick={handleCopy}
                className="shrink-0 inline-flex items-center gap-1 text-xs font-bold"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? t('wallet.copied') : t('wallet.copy')}
              </button>
            </div>
            {balance != null && (
              <p className="text-sm">
                {t('wallet.balance')}: <strong>{balance} XLM</strong>
              </p>
            )}
            <a
              href={`https://stellar.expert/explorer/testnet/account/${publicKey}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm font-bold text-[#2f6f28]"
            >
              Stellar Expert <ExternalLink className="w-4 h-4" />
            </a>
            <a
              href={cosmosPayUri}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-black text-white font-display font-bold text-sm"
            >
              <Wallet className="w-4 h-4" /> {t('wallet.cosmosPay')}
            </a>
          </>
        ) : (
          <div className="space-y-3 text-sm text-neutral-600">
            <p className="inline-flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {t('wallet.noKey')}
            </p>
            <Link href="/onboarding/wallet" className="inline-flex items-center gap-2 font-bold text-black">
              {t('wallet.goOnboarding')} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </div>

      <div className="p-6 rounded-3xl border border-neutral-200 space-y-2 text-sm text-neutral-600">
        <p className="font-semibold text-black">{t('wallet.selfCustodyTitle')}</p>
        <p>{t('wallet.selfCustodyBody')}</p>
      </div>

      <Link href="/market/IPO-SOJA-PERGAMINO-2026" className="inline-flex items-center gap-2 font-display font-bold">
        {t('wallet.ctaInvest')} <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}
