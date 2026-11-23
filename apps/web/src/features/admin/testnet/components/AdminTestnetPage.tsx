import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Activity, ShieldCheck } from 'lucide-react';
import type { SettlePolicy } from '@fractachain/shared';
import RequireAdmin from '@/components/guards/RequireAdmin';
import { withIsland } from '@/components/island/withIsland';
import { Card, GradientPanel, Notice, PageHeader, PanelNote, StatusChip } from '@/components/ui/kit';
import type { NetworkStatus } from '@/core/api/AdminApi';
import type { TestnetDeployment, TestnetMode } from '@/core/api/types';
import { container } from '@/core/container';
import { errorMessage } from '@/core/errors';
import { explorerAccount, explorerContract, formatInt } from '@/core/format/number';
import { useI18n } from '@/hooks/useI18n';
import { useSession } from '@/hooks/useSession';
import { CopyValue } from '../../shared/CopyValue';
import { RefreshButton } from '../../shared/RefreshButton';
import { toDatetimeLocal } from '../../shared/datetime';

const { api } = container;

/** Radio rendered as a selectable card (title + one line). */
function ChoiceCard({
  name,
  checked,
  onChange,
  title,
  body,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  body?: string;
}) {
  return (
    <label
      className={`flex cursor-pointer gap-3 rounded-2xl border px-4 py-3.5 transition-colors ${
        checked ? 'border-navy bg-surface-2' : 'border-line hover:border-line-strong'
      }`}
    >
      <input
        type="radio"
        name={name}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--navy))]"
        checked={checked}
        onChange={onChange}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{title}</span>
        {body && <span className="mt-0.5 block text-xs leading-relaxed text-muted">{body}</span>}
      </span>
    </label>
  );
}

function ContractRow({ label, value }: { label: string; value?: string | null }): ReactNode {
  if (!value) return null;
  const href = value.startsWith('C')
    ? explorerContract(value)
    : value.startsWith('G')
      ? explorerAccount(value)
      : undefined;
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 py-2.5">
      <dt className="shrink-0 text-xs text-muted">{label}</dt>
      <dd className="min-w-0">
        <CopyValue value={value} href={href} head={6} tail={6} />
      </dd>
    </div>
  );
}

/** Network settings, settlement policy and the regulated-asset issuer flags. */
function AdminTestnet() {
  const { user } = useSession();
  const sessionId = user?.id ?? null;
  const { t } = useI18n();
  const [mode, setMode] = useState<TestnetMode>('deploy');
  const [friendbot, setFriendbot] = useState(true);
  const [horizonUrl, setHorizonUrl] = useState('https://horizon-testnet.stellar.org');
  const [rpcUrl, setRpcUrl] = useState('https://soroban-testnet.stellar.org');
  const [notice, setNotice] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const [settlePolicy, setSettlePolicy] = useState<SettlePolicy>('ON_MIN');
  const [settleAt, setSettleAt] = useState('');
  const [onChain, setOnChain] = useState(false);
  const [deployment, setDeployment] = useState<TestnetDeployment | null>(null);
  const [status, setStatus] = useState<NetworkStatus | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState<'save' | 'issuer' | 'load' | null>(null);

  const load = useCallback(async () => {
    if (!sessionId) return;
    setBusy('load');
    await Promise.allSettled([
      api.admin.testnet().then((data) => {
        if (!data) return;
        setMode(data.mode || 'deploy');
        setFriendbot(data.friendbot !== false);
        if (data.horizonUrl) setHorizonUrl(data.horizonUrl);
        if (data.rpcUrl) setRpcUrl(data.rpcUrl);
        setSettlePolicy(data.settlePolicy === 'ON_DATE' ? 'ON_DATE' : 'ON_MIN');
        setOnChain(Boolean(data.onChain));
        setDeployment(data.deployment || null);
        setPassphrase(String((data as { networkPassphrase?: string }).networkPassphrase || ''));
        if (data.settleAt) setSettleAt(toDatetimeLocal(data.settleAt));
      }),
      api.admin.networkStatus().then(setStatus),
    ]);
    setBusy(null);
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setBusy('save');
    setNotice(null);
    try {
      await api.admin.saveTestnet({
        mode,
        friendbot,
        horizonUrl,
        rpcUrl,
        settlePolicy,
        settleAt: settlePolicy === 'ON_DATE' ? settleAt : undefined,
      });
      setNotice({
        tone: 'good',
        text:
          mode === 'deploy' ? (onChain ? t('admTest.savedOn') : t('admTest.savedOff')) : t('admTest.saved'),
      });
    } catch (err) {
      setNotice({ tone: 'bad', text: errorMessage(err, t('admTest.saveFail')) });
    } finally {
      setBusy(null);
    }
  };

  const configureIssuer = async () => {
    setBusy('issuer');
    setNotice(null);
    try {
      await api.admin.configureIssuer(false);
      setNotice({ tone: 'good', text: t('admTest.authDone') });
    } catch (err) {
      setNotice({ tone: 'bad', text: errorMessage(err, t('admTest.authFail')) });
    } finally {
      setBusy(null);
    }
  };

  const modes: { id: TestnetMode; title: string; body: string }[] = [
    { id: 'local', title: t('admTest.modeLocal'), body: t('admTest.modeLocalBody') },
    { id: 'faucet', title: t('admTest.modeFaucet'), body: t('admTest.modeFaucetBody') },
    { id: 'deploy', title: t('admTest.modeDeploy'), body: t('admTest.modeDeployBody') },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('admin.testnet.title')}
        subtitle={t('admin.testnet.lead')}
        actions={<RefreshButton onClick={() => void load()} busy={busy === 'load'} />}
      />

      <div aria-live="polite">{notice && <Notice tone={notice.tone}>{notice.text}</Notice>}</div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <form
          className="min-w-0 space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Card title={t('admin.testnet.mode')}>
            <fieldset className="grid gap-2 md:grid-cols-3">
              <legend className="sr-only">{t('admin.testnet.mode')}</legend>
              {modes.map((opt) => (
                <ChoiceCard
                  key={opt.id}
                  name="testnet-mode"
                  checked={mode === opt.id}
                  onChange={() => setMode(opt.id)}
                  title={opt.title}
                  body={opt.body}
                />
              ))}
            </fieldset>
            <label className="mt-4 flex items-center gap-2.5 text-sm text-ink">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[rgb(var(--navy))]"
                checked={friendbot}
                onChange={(e) => setFriendbot(e.target.checked)}
              />
              {t('admTest.friendbot')}
            </label>
          </Card>

          <Card title={t('admin.testnet.settle')} subtitle={t('admTest.settleQ')}>
            <fieldset className="grid gap-2 md:grid-cols-2">
              <legend className="sr-only">{t('admTest.settleQ')}</legend>
              <ChoiceCard
                name="settle-policy"
                checked={settlePolicy === 'ON_MIN'}
                onChange={() => setSettlePolicy('ON_MIN')}
                title={t('admTest.onMin')}
                body={t('admTest.onMinBody')}
              />
              <ChoiceCard
                name="settle-policy"
                checked={settlePolicy === 'ON_DATE'}
                onChange={() => setSettlePolicy('ON_DATE')}
                title={t('admTest.onDate')}
                body={t('admTest.onDateBody')}
              />
            </fieldset>
            {settlePolicy === 'ON_DATE' && (
              <div className="mt-4 max-w-xs">
                <label htmlFor="testnet-settle-at" className="label">
                  {t('admTest.closeDate')}
                </label>
                <input
                  id="testnet-settle-at"
                  type="datetime-local"
                  className="input"
                  value={settleAt}
                  onChange={(e) => setSettleAt(e.target.value)}
                />
              </div>
            )}
          </Card>

          <Card title={t('admin.testnet.endpoints')}>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="testnet-horizon" className="label">
                  Horizon
                </label>
                <input
                  id="testnet-horizon"
                  type="url"
                  className="input font-mono text-xs"
                  value={horizonUrl}
                  onChange={(e) => setHorizonUrl(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="testnet-rpc" className="label">
                  Soroban RPC
                </label>
                <input
                  id="testnet-rpc"
                  type="url"
                  className="input font-mono text-xs"
                  value={rpcUrl}
                  onChange={(e) => setRpcUrl(e.target.value)}
                />
              </div>
            </div>
            <button type="submit" className="btn btn-primary mt-5" disabled={busy === 'save'}>
              {busy === 'save' ? t('admin.testnet.saving') : t('admTest.save')}
            </button>
          </Card>
        </form>

        <div className="min-w-0 space-y-6">
          <GradientPanel
            title={t('admin.testnet.status')}
            subtitle={status?.network || 'testnet'}
            footer={
              <PanelNote icon={<Activity className="h-4 w-4" aria-hidden="true" />}>
                {status
                  ? status.rpcOk
                    ? t('admin.overview.rpcOk')
                    : t('admin.overview.rpcKo')
                  : t('admin.common.loading')}
              </PanelNote>
            }
          >
            <div className="px-5 py-6 sm:px-6">
              <p className="eyebrow text-ink-2">Ledger</p>
              <p className="numeral mt-2 text-[52px] text-ink">
                {status?.ledger ? formatInt(status.ledger) : '—'}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <StatusChip tone={onChain ? 'good' : 'neutral'}>
                  {onChain ? t('admTest.onchain') : t('admTest.noContracts')}
                </StatusChip>
              </div>
              {passphrase && (
                <p className="mt-4 text-xs text-ink-2">
                  {t('admin.testnet.passphrase')}: <span className="font-mono">{passphrase}</span>
                </p>
              )}
            </div>
          </GradientPanel>

          <Card title={t('admin.testnet.contracts')} subtitle={t('admin.testnet.contractsSub')}>
            {deployment?.factory ? (
              <dl className="divide-y divide-line">
                <ContractRow label="Factory" value={deployment.factory} />
                <ContractRow label="Stock vault" value={deployment.stockVault} />
                <ContractRow label={t('market.licitacion')} value={deployment.licitacion} />
                <ContractRow label="USDC SAC" value={deployment.usdcSac} />
                <ContractRow label={t('admTest.issuer')} value={deployment.issuer} />
                <ContractRow label="Deployer" value={deployment.deployer} />
              </dl>
            ) : (
              <p className="text-sm text-ink-2">
                {t('admTest.runHere')}{' '}
                <code className="break-all rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs">
                  bash scripts/testnet/01-keys.sh && bash scripts/testnet/02-build.sh && bash
                  scripts/testnet/03-deploy.sh
                </code>
              </p>
            )}
          </Card>

          <Card title={t('admin.testnet.issuerFlags')} subtitle={t('admin.testnet.issuerFlagsSub')}>
            <button
              type="button"
              onClick={() => void configureIssuer()}
              className="btn btn-secondary"
              disabled={busy === 'issuer'}
            >
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              {busy === 'issuer' ? t('admin.testnet.configuring') : t('admTest.authBtn')}
            </button>
          </Card>
        </div>
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
