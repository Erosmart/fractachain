import { useCallback, useEffect, useState } from 'react';
import type { SettlePolicy } from '@fractachain/shared';
import RequireAdmin from '@/components/guards/RequireAdmin';
import { withIsland } from '@/components/island/withIsland';
import ExternalLink from '@/components/ui/ExternalLink';
import type { TestnetDeployment, TestnetMode } from '@/core/api/types';
import { container } from '@/core/container';
import { errorMessage } from '@/core/errors';
import { explorerContract } from '@/core/format/number';
import { useI18n } from '@/hooks/useI18n';
import { useSession } from '@/hooks/useSession';
import { toDatetimeLocal } from '../../shared/datetime';

const { api } = container;

/** Network settings, settlement policy and the regulated-asset issuer flags. */
function AdminTestnet() {
  const { user } = useSession();
  const sessionId = user?.id ?? null;
  const { t } = useI18n();
  const [mode, setMode] = useState<TestnetMode>('deploy');
  const [friendbot, setFriendbot] = useState(true);
  const [horizonUrl, setHorizonUrl] = useState('https://horizon-testnet.stellar.org');
  const [rpcUrl, setRpcUrl] = useState('https://soroban-testnet.stellar.org');
  const [notice, setNotice] = useState('');
  const [settlePolicy, setSettlePolicy] = useState<SettlePolicy>('ON_MIN');
  const [settleAt, setSettleAt] = useState('');
  const [onChain, setOnChain] = useState(false);
  const [deployment, setDeployment] = useState<TestnetDeployment | null>(null);

  const load = useCallback(() => {
    if (!sessionId) return;
    api.admin
      .testnet()
      .then((data) => {
        if (!data) return;
        setMode(data.mode || 'deploy');
        setFriendbot(data.friendbot !== false);
        if (data.horizonUrl) setHorizonUrl(data.horizonUrl);
        if (data.rpcUrl) setRpcUrl(data.rpcUrl);
        setSettlePolicy(data.settlePolicy === 'ON_DATE' ? 'ON_DATE' : 'ON_MIN');
        setOnChain(Boolean(data.onChain));
        setDeployment(data.deployment || null);
        if (data.settleAt) setSettleAt(toDatetimeLocal(data.settleAt));
      })
      .catch(() => undefined);
  }, [sessionId]);

  useEffect(load, [load]);

  const save = async () => {
    try {
      await api.admin.saveTestnet({
        mode,
        friendbot,
        horizonUrl,
        rpcUrl,
        settlePolicy,
        settleAt: settlePolicy === 'ON_DATE' ? settleAt : undefined,
      });
      setNotice(mode === 'deploy' ? (onChain ? t('admTest.savedOn') : t('admTest.savedOff')) : t('admTest.saved'));
    } catch (err) {
      setNotice(errorMessage(err, t('admTest.saveFail')));
    }
  };

  const configureIssuer = async () => {
    try {
      await api.admin.configureIssuer(false);
      setNotice(t('admTest.authDone'));
    } catch (err) {
      setNotice(errorMessage(err, t('admTest.authFail')));
    }
  };

  const deploymentRows: [string, string | undefined][] = deployment
    ? [
        ['Factory', deployment.factory],
        ['Stock vault', deployment.stockVault],
        [t('market.licitacion'), deployment.licitacion],
        [t('admTest.issuer'), deployment.issuer],
        ['Deployer', deployment.deployer],
        ['USDC SAC', deployment.usdcSac],
      ]
    : [];

  const modes: { id: TestnetMode; title: string; body: string }[] = [
    { id: 'local', title: t('admTest.modeLocal'), body: t('admTest.modeLocalBody') },
    { id: 'faucet', title: t('admTest.modeFaucet'), body: t('admTest.modeFaucetBody') },
    { id: 'deploy', title: t('admTest.modeDeploy'), body: t('admTest.modeDeployBody') },
  ];

  return (
    <div className="max-w-2xl space-y-6 py-6">
      <div>
        <p className="font-lcd text-[11px] uppercase tracking-[0.2em] text-neutral-500">Stellar</p>
        <h1 className="text-3xl font-extrabold font-display">{t('admTest.title')}</h1>
        <p className="text-neutral-600 mt-1">{t('admTest.lead')}</p>
      </div>
      <div className="p-6 rounded-3xl crystal-card space-y-3">
        <p className="font-display font-extrabold">{onChain ? t('admTest.onchain') : t('admTest.noContracts')}</p>
        {deployment?.factory ? (
          <dl className="space-y-1 font-mono text-xs break-all">
            {deploymentRows.map(([label, value]) =>
              value ? (
                <div key={label}>
                  <dt className="text-neutral-500 font-sans">{label}</dt>
                  <dd>
                    {String(value).startsWith('C') ? (
                      <ExternalLink className="underline" href={explorerContract(value)}>
                        {value}
                      </ExternalLink>
                    ) : (
                      value
                    )}
                  </dd>
                </div>
              ) : null,
            )}
          </dl>
        ) : (
          <p className="text-sm text-neutral-600">
            {t('admTest.runHere')} <code>bash scripts/testnet/01-keys.sh && bash scripts/testnet/02-build.sh && bash scripts/testnet/03-deploy.sh</code>
          </p>
        )}
        <button type="button" onClick={configureIssuer} className="px-4 py-2 rounded-2xl border border-black/15 font-display font-bold text-sm">
          {t('admTest.authBtn')}
        </button>
      </div>
      <div className="p-6 rounded-3xl crystal-card space-y-4">
        {modes.map((opt) => (
          <label key={opt.id} className={`block p-4 rounded-2xl border cursor-pointer ${mode === opt.id ? 'border-black bg-black/[0.03]' : 'border-black/10'}`}>
            <input type="radio" name="testnet-mode" className="mr-2" checked={mode === opt.id} onChange={() => setMode(opt.id)} />
            <span className="font-display font-extrabold">{opt.title}</span>
            <p className="text-sm text-neutral-600 mt-1">{opt.body}</p>
          </label>
        ))}
        <div className="pt-2 space-y-3">
          <p className="font-display font-extrabold">{t('admTest.settleQ')}</p>
          <label className={`block p-4 rounded-2xl border cursor-pointer ${settlePolicy === 'ON_MIN' ? 'border-black bg-black/[0.03]' : 'border-black/10'}`}>
            <input type="radio" name="settle-policy" className="mr-2" checked={settlePolicy === 'ON_MIN'} onChange={() => setSettlePolicy('ON_MIN')} />
            {t('admTest.onMin')}
            <p className="text-sm text-neutral-600 mt-1">{t('admTest.onMinBody')}</p>
          </label>
          <label className={`block p-4 rounded-2xl border cursor-pointer ${settlePolicy === 'ON_DATE' ? 'border-black bg-black/[0.03]' : 'border-black/10'}`}>
            <input type="radio" name="settle-policy" className="mr-2" checked={settlePolicy === 'ON_DATE'} onChange={() => setSettlePolicy('ON_DATE')} />
            {t('admTest.onDate')}
            <p className="text-sm text-neutral-600 mt-1">{t('admTest.onDateBody')}</p>
          </label>
          {settlePolicy === 'ON_DATE' && (
            <label className="block text-sm space-y-1">
              {t('admTest.closeDate')}
              <input
                type="datetime-local"
                className="w-full px-3 py-2 rounded-xl border border-black/10"
                value={settleAt}
                onChange={(e) => setSettleAt(e.target.value)}
              />
            </label>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={friendbot} onChange={(e) => setFriendbot(e.target.checked)} />
          {t('admTest.friendbot')}
        </label>
        <label className="block text-sm space-y-1">
          Horizon
          <input
            type="url"
            className="w-full px-3 py-2 rounded-xl border border-black/10 font-mono text-xs"
            value={horizonUrl}
            onChange={(e) => setHorizonUrl(e.target.value)}
          />
        </label>
        <label className="block text-sm space-y-1">
          Soroban RPC
          <input
            type="url"
            className="w-full px-3 py-2 rounded-xl border border-black/10 font-mono text-xs"
            value={rpcUrl}
            onChange={(e) => setRpcUrl(e.target.value)}
          />
        </label>
        <button type="button" onClick={save} className="px-5 py-3 rounded-2xl bg-black text-white font-display font-bold">
          {t('admTest.save')}
        </button>
        {notice && (
          <p className="text-sm" role="status">
            {notice}
          </p>
        )}
      </div>
    </div>
  );
}

function AdminTestnetPage() {
  return (
    <RequireAdmin>
      <AdminTestnet />
    </RequireAdmin>
  );
}

export default withIsland(AdminTestnetPage);
