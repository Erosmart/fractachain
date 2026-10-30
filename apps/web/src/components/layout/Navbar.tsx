import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Briefcase,
  ChevronDown,
  Home,
  Layers,
  LogOut,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  Wallet,
} from 'lucide-react';
import AccountNotices from '@/components/account/AccountNotices';
import TwoFactorDialog from '@/components/auth/TwoFactorDialog';
import { withIsland } from '@/components/island/withIsland';
import BrandMark from '@/components/ui/BrandMark';
import { Avatar } from '@/components/ui/kit';
import { formatAmount } from '@/core/format/number';
import type { SessionUser } from '@/core/auth/SessionUser';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';
import { activeTab, APP_TABS, CONSOLE_TAB, PUBLIC_TABS, type TabKey } from './navigation';
import { LangToggle, ThemeToggle } from './UiToggles';

interface NavbarProps {
  /** Request path, so the active tab renders identically on server and client. */
  pathname: string;
}

const TAB_ICONS: Record<TabKey, typeof Home> = {
  home: Home,
  offerings: Layers,
  markets: ArrowLeftRight,
  portfolio: Briefcase,
  account: UserRound,
  console: SlidersHorizontal,
};

/** Account chip + menu (avatar, name, a one-line status under it). */
function AccountMenu({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const subtitle = user.publicKey
    ? `${t(`shell.kyc.${user.kycStatus}`)} · ${formatAmount(Number(user.xlmBalance || 0), 0)} XLM`
    : t(`shell.kyc.${user.kycStatus}`);
  const item =
    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-2 hover:bg-ink/5 hover:text-ink';

  return (
    <div className="relative" ref={root}>
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t('shell.menu.open')}
        className="flex h-10 items-center gap-2.5 rounded-xl border border-line bg-surface py-1 pl-1 pr-2 transition-colors hover:border-line-strong sm:pr-3"
      >
        <Avatar name={user.name || user.email} />
        <span className="hidden min-w-0 text-left md:block">
          <span className="block max-w-[10rem] truncate text-[13px] font-medium leading-tight text-ink">
            {user.name || user.email}
          </span>
          <span className="block max-w-[10rem] truncate text-[11px] leading-tight text-muted">
            {subtitle}
          </span>
        </span>
        <ChevronDown className="hidden h-3.5 w-3.5 text-muted sm:block" aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-12 z-50 w-64 rounded-2xl border border-line bg-surface p-1.5 shadow-lift animate-fade-up"
        >
          <div className="px-3 pb-2 pt-2">
            <p className="truncate text-sm font-medium text-ink">{user.name || user.email}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
          <div className="my-1 h-px bg-line" />
          <a role="menuitem" href="/account" className={item}>
            <UserRound className="h-4 w-4" aria-hidden="true" />
            {t('shell.tabs.account')}
          </a>
          <a role="menuitem" href="/wallet" className={item}>
            <Wallet className="h-4 w-4" aria-hidden="true" />
            {t('shell.menu.wallet')}
          </a>
          <a role="menuitem" href="/account/security" className={item}>
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            {t('shell.menu.security')}
          </a>
          {user.isAdmin && (
            <a role="menuitem" href={CONSOLE_TAB.href} className={item}>
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              {t('shell.menu.console')}
            </a>
          )}
          <div className="my-1 h-px bg-line" />
          <button role="menuitem" type="button" onClick={onLogout} className={`${item} w-full`}>
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {t('shell.menu.logout')}
          </button>
        </div>
      )}
    </div>
  );
}

/** Bottom tab bar for phones (signed-in): the five tabs with icons. */
function MobileTabBar({ current, isAdmin }: { current?: TabKey; isAdmin: boolean }) {
  const { t } = useI18n();
  const tabs = isAdmin && current === 'console' ? [...APP_TABS.slice(0, 4), CONSOLE_TAB] : APP_TABS;
  return (
    <nav
      aria-label={t('shell.tabs.primary')}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {tabs.map((tab) => {
          const Icon = TAB_ICONS[tab.key];
          const on = tab.key === current;
          return (
            <li key={tab.key}>
              <a
                href={tab.href}
                aria-current={on ? 'page' : undefined}
                className={`flex flex-col items-center gap-1 py-2 text-[10.5px] font-medium ${on ? 'text-ink' : 'text-muted'}`}
              >
                <span
                  className={`grid h-7 w-11 place-items-center rounded-full ${on ? 'bg-navy text-navy-ink' : ''}`}
                >
                  <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                </span>
                {t(tab.label)}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Navbar({ pathname }: NavbarProps) {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const current = activeTab(pathname);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-line/70 bg-canvas/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-6 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:px-8">
          {/* Left: primary tabs (desktop) */}
          <div className="flex min-w-0 items-center">
            <div className="lg:hidden">
              <BrandMark />
            </div>
            {user ? (
              <nav aria-label={t('shell.tabs.primary')} className="pill-tabs hidden lg:inline-flex">
                {APP_TABS.map((tab) => (
                  <a
                    key={tab.key}
                    href={tab.href}
                    className="pill-tab"
                    aria-current={tab.key === current ? 'page' : undefined}
                  >
                    {t(tab.label)}
                  </a>
                ))}
                {user.isAdmin && (
                  <a
                    href={CONSOLE_TAB.href}
                    className="pill-tab"
                    aria-current={current === 'console' ? 'page' : undefined}
                  >
                    {t(CONSOLE_TAB.label)}
                  </a>
                )}
              </nav>
            ) : (
              <nav aria-label={t('shell.tabs.primary')} className="hidden items-center gap-1 lg:flex">
                {PUBLIC_TABS.map((tab) => (
                  <a
                    key={tab.key}
                    href={tab.href}
                    className="pill-tab"
                    aria-current={!tab.href.includes('#') && isActive(tab.href) ? 'page' : undefined}
                  >
                    {t(tab.label)}
                  </a>
                ))}
              </nav>
            )}
          </div>

          {/* Center: brand (desktop) */}
          <div className="hidden justify-center lg:flex">
            <BrandMark />
          </div>

          {/* Right: toggles + account */}
          <div className="flex items-center justify-end gap-2">
            <LangToggle />
            <ThemeToggle />
            {user ? (
              <AccountMenu user={user} onLogout={logout} />
            ) : (
              <a href="/login" className="btn btn-primary">
                {t('nav.login')}
              </a>
            )}
          </div>
        </div>
        <AccountNotices />
      </header>
      {user && <MobileTabBar current={current} isAdmin={Boolean(user.isAdmin)} />}
      {/* Outside <header>: its backdrop-filter would trap a `position: fixed` overlay. */}
      <TwoFactorDialog />
    </>
  );
}

export default withIsland(Navbar);
