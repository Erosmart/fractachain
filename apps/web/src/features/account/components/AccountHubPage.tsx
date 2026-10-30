import type { ReactNode } from 'react';
import { ArrowUpRight, KeyRound, Mail, ShieldCheck, Wallet as WalletIcon } from 'lucide-react';
import RequireAuth from '@/components/guards/RequireAuth';
import { withIsland } from '@/components/island/withIsland';
import {
  Card,
  ChecklistItem,
  Gauge,
  GradientPanel,
  PageHeader,
  PanelNote,
  Stat,
  StatGrid,
  StatusChip,
} from '@/components/ui/kit';
import type { SessionUser } from '@/core/auth/SessionUser';
import { formatAmount } from '@/core/format/number';
import { useI18n } from '@/hooks/useI18n';
import { useSession } from '@/hooks/useSession';
import VerificationStatusCard from '@/features/onboarding/components/VerificationStatusCard';
import { useVerification } from '@/features/onboarding/hooks/useVerification';
import { useWalletState } from '@/features/wallet/hooks/useWalletState';
import CopyAddress from './CopyAddress';

interface Step {
  key: string;
  label: string;
  done: boolean;
  href: string;
  icon: ReactNode;
}

/** The account's own to-do list: what is left before the investor can operate freely. */
function accountSteps(user: SessionUser, usdc: number | null, t: (k: string) => string): Step[] {
  const steps: Step[] = [];
  if (user.authProvider === 'email') {
    steps.push({
      key: 'email',
      label: t('account.checklist.email'),
      done: user.emailVerified,
      href: '/account/security',
      icon: <Mail className="h-4 w-4" />,
    });
  }
  steps.push(
    {
      key: 'wallet',
      label: t('account.checklist.wallet'),
      done: Boolean(user.custodyMode),
      href: '/onboarding/wallet',
      icon: <WalletIcon className="h-4 w-4" />,
    },
    {
      key: 'kyc',
      label: t('account.checklist.kyc'),
      done: user.kycStatus === 'APPROVED',
      href: '/onboarding/kyc',
      icon: <ShieldCheck className="h-4 w-4" />,
    },
    {
      key: 'usdc',
      label: t('account.checklist.usdc'),
      done: (usdc ?? 0) > 0,
      href: '/wallet',
      icon: <span className="text-[10px] font-semibold">$</span>,
    },
    {
      key: 'twofa',
      label: t('account.checklist.twoFa'),
      done: user.twoFactorEnabled,
      href: '/account/security',
      icon: <KeyRound className="h-4 w-4" />,
    },
  );
  return steps;
}

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-sm text-ink-2">{label}</dt>
      <dd className="min-w-0 text-right text-sm text-ink">{children}</dd>
    </div>
  );
}

function AccountHub() {
  const { user } = useSession();
  const { t, locale } = useI18n();
  const verification = useVerification({ sync: false });
  const wallet = useWalletState(user?.publicKey || undefined);
  if (!user) return null;

  const usdc = wallet.state ? Number(wallet.state.usdc) : null;
  const xlm = wallet.state ? Number(wallet.state.xlm) : Number(user.xlmBalance || 0);
  const steps = accountSteps(user, usdc, t);
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  const dash = '—';
  const provider =
    user.authProvider === 'wallet'
      ? t('account.profile.providerWallet')
      : user.authProvider === 'email'
        ? t('account.profile.providerEmail')
        : t('account.profile.providerGoogle');
  const since = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString(locale === 'es' ? 'es-AR' : 'en-US', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : dash;

  return (
    <div className="space-y-6">
      <PageHeader title={t('account.hub.title')} subtitle={t('account.hub.lead')} />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          <VerificationStatusCard state={verification} compact />

          <div className="grid gap-5 md:grid-cols-2">
            <Card
              title={t('account.wallet.title')}
              subtitle={
                user.custodyMode === 'CUSTODIAL'
                  ? t('account.wallet.custodial')
                  : user.custodyMode === 'SELF'
                    ? t('account.wallet.self')
                    : undefined
              }
              href={user.publicKey ? '/wallet' : undefined}
              hrefLabel={t('account.wallet.open')}
            >
              {user.publicKey ? (
                <dl className="divide-y divide-line">
                  <Row label={t('account.wallet.address')}>
                    <span className="flex justify-end">
                      <CopyAddress address={user.publicKey} />
                    </span>
                  </Row>
                  <Row label={t('account.wallet.xlm')}>
                    <span className="tnum">
                      {wallet.loading && !wallet.state ? dash : formatAmount(xlm, 2)}
                    </span>
                  </Row>
                  <Row label={t('account.wallet.usdc')}>
                    {wallet.loading && !wallet.state ? (
                      <span className="text-muted">{t('account.wallet.loading')}</span>
                    ) : wallet.failed ? (
                      <span className="text-muted">{t('account.wallet.unavailable')}</span>
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        <span className="tnum">{formatAmount(usdc ?? 0, 2)}</span>
                        <StatusChip tone={(usdc ?? 0) > 0 ? 'good' : 'neutral'}>
                          {(usdc ?? 0) > 0 ? t('account.wallet.usdcReady') : t('account.wallet.usdcEmpty')}
                        </StatusChip>
                      </span>
                    )}
                  </Row>
                </dl>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-ink-2">{t('account.wallet.noneBody')}</p>
                  <a href="/onboarding/wallet" className="btn btn-primary btn-sm">
                    {t('account.wallet.choose')}
                  </a>
                </div>
              )}
            </Card>

            <Card
              title={t('account.security.title')}
              subtitle={t('account.security.subtitle')}
              href="/account/security"
              hrefLabel={t('account.security.manage')}
            >
              <dl className="divide-y divide-line">
                <Row label={t('account.security.twoFa')}>
                  <StatusChip tone={user.twoFactorEnabled ? 'good' : 'neutral'}>
                    {user.twoFactorEnabled ? t('sec.twoFaOn') : t('sec.twoFaOff')}
                  </StatusChip>
                </Row>
                <Row label={t('account.security.email')}>
                  {user.authProvider === 'email' ? (
                    <StatusChip tone={user.emailVerified ? 'good' : 'warn'}>
                      {user.emailVerified ? t('sec.emailVerified') : t('sec.emailUnverified')}
                    </StatusChip>
                  ) : (
                    <span className="text-muted">{t('account.security.emailNa')}</span>
                  )}
                </Row>
                <Row label={t('sec.sessionsTitle')}>
                  <a
                    href="/account/security"
                    className="inline-flex items-center gap-1 text-ink hover:underline"
                  >
                    {t('account.security.manage')}
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                </Row>
              </dl>
            </Card>
          </div>

          <Card title={t('account.profile.title')}>
            <dl className="grid gap-x-8 divide-y divide-line md:grid-cols-2 md:divide-y-0">
              <div className="divide-y divide-line">
                <Row label={t('account.profile.name')}>
                  <span className="block truncate">{user.legalName || user.name || dash}</span>
                </Row>
                <Row label={t('account.profile.email')}>
                  <span className="block truncate">{user.email || dash}</span>
                </Row>
                <Row label={t('account.profile.cuit')}>
                  <span className="tnum">{user.cuit || dash}</span>
                </Row>
              </div>
              <div className="divide-y divide-line">
                <Row label={t('account.profile.signIn')}>{provider}</Row>
                <Row label={t('account.profile.since')}>{since}</Row>
              </div>
            </dl>
          </Card>
        </div>

        <div className="min-w-0 space-y-5">
          <GradientPanel
            title={t('account.panel.title')}
            subtitle={t('account.panel.subtitle', { done, total: steps.length })}
            footer={
              <PanelNote icon={<ShieldCheck className="h-4 w-4" />} href={next?.href}>
                {next ? t('account.panel.next', { step: next.label }) : t('account.panel.allSet')}
              </PanelNote>
            }
          >
            <div className="px-4 pt-2">
              <Gauge
                value={done}
                max={steps.length}
                display={done}
                caption={t('account.panel.caption')}
                minLabel="0"
                maxLabel={String(steps.length)}
                ariaLabel={t('account.panel.aria', { done, total: steps.length })}
              />
            </div>
            <StatGrid className="border-t border-ink/10">
              <Stat
                label={t('account.panel.xlm')}
                value={wallet.state || user.xlmBalance ? formatAmount(xlm, 0) : dash}
              />
              <Stat label={t('account.panel.usdc')} value={usdc === null ? dash : formatAmount(usdc, 0)} />
              <Stat label={t('account.panel.positions')} value={String(user.holdings.length)} />
              <Stat label={t('account.panel.enabled')} value={String(user.trustlines.length)} />
            </StatGrid>
          </GradientPanel>

          <Card title={t('account.checklist.title')} subtitle={t('account.checklist.subtitle')}>
            <div className="space-y-2">
              {steps.map((s) => (
                <ChecklistItem
                  key={s.key}
                  title={s.label}
                  subtitle={s.done ? t('account.checklist.doneNote') : t('account.checklist.todoNote')}
                  done={s.done}
                  icon={s.icon}
                  href={s.done ? undefined : s.href}
                />
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function AccountHubRoute() {
  return (
    <RequireAuth>
      <AccountHub />
    </RequireAuth>
  );
}

export default withIsland(AccountHubRoute);
