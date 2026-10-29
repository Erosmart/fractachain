import { useState } from 'react';
import {
  Activity,
  Building2,
  Coins,
  Layers,
  LogOut,
  Menu,
  ScrollText,
  ShieldCheck,
  UserCheck,
  Wallet,
  X,
} from 'lucide-react';
import AccountNotices from '@/components/account/AccountNotices';
import TwoFactorDialog from '@/components/auth/TwoFactorDialog';
import { withIsland } from '@/components/island/withIsland';
import BrandMark from '@/components/ui/BrandMark';
import WalletAddress from '@/components/ui/WalletAddress';
import { formatAmount } from '@/core/format/number';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';
import { LangToggle, ThemeToggle } from './UiToggles';

interface NavbarProps {
  /** Request path, so the active link renders identically on server and client. */
  pathname: string;
}

function Navbar({ pathname }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, logout } = useAuth();
  const { t } = useI18n();

  const primaryLinks = [
    { href: '/market', label: t('nav.market'), icon: Layers },
    { href: '/orderbook', label: t('nav.orderbook'), icon: Coins },
    { href: '/dashboard', label: t('nav.portfolio'), icon: Building2 },
  ];

  const adminLinks = [
    { href: '/admin/issuance', label: t('nav.issuance'), icon: Coins },
    { href: '/admin/kyc', label: t('nav.kyc'), icon: UserCheck },
    { href: '/admin/testnet', label: t('nav.testnet'), icon: Activity },
    { href: '/admin/audit', label: t('admAudit.nav'), icon: ScrollText },
  ];

  const allLinks = user?.isAdmin ? [...primaryLinks, ...adminLinks] : primaryLinks;
  const closeMenu = () => setMobileMenuOpen(false);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const walletLabel = user?.publicKey
    ? `${formatAmount(Number(user.xlmBalance || 0), 2)} XLM`
    : t('nav.portfolio');

  return (
    <>
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-black/8">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 sm:gap-3 h-[3.75rem] sm:h-[4.25rem] min-w-0">
            <BrandMark />

            <div className="hidden xl:flex items-center gap-0.5 2xl:gap-1 flex-1 min-w-0">
              {allLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  aria-current={isActive(link.href) ? 'page' : undefined}
                  className={`px-2 2xl:px-2.5 py-2 rounded-lg text-[12px] 2xl:text-[13px] font-display font-bold tracking-tight whitespace-nowrap transition-colors ${
                    isActive(link.href)
                      ? 'text-black bg-black/[0.05]'
                      : 'text-neutral-500 hover:text-black hover:bg-black/[0.03]'
                  }`}
                >
                  {link.label}
                </a>
              ))}
            </div>

            <div className="flex items-center gap-1.5 ml-auto shrink-0">
              <LangToggle />
              <ThemeToggle />
              <div className="hidden sm:flex items-center gap-2">
                <a
                  href="/dashboard"
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-black/10 bg-white/70 text-black text-xs font-display font-bold"
                >
                  <Wallet className="w-3.5 h-3.5 shrink-0" />
                  <span className="whitespace-nowrap">{walletLabel}</span>
                </a>
                {user ? (
                  <div className="flex items-center gap-1.5 pl-2 border-l border-black/10 min-w-0">
                    <a
                      href="/dashboard"
                      className="text-xs font-display font-bold text-black max-w-[6.5rem] 2xl:max-w-[9rem] truncate"
                    >
                      {user.name}
                    </a>
                    <a
                      href="/account/security"
                      aria-label={t('sec.navLabel')}
                      title={t('sec.navLabel')}
                      aria-current={isActive('/account/security') ? 'page' : undefined}
                      className="p-1.5 rounded-lg text-neutral-500 hover:text-black shrink-0"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                    </a>
                    <button
                      type="button"
                      onClick={logout}
                      className="p-1.5 rounded-lg text-neutral-500 hover:text-black shrink-0"
                      aria-label={t('nav.logout')}
                    >
                      <LogOut className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <a
                    href="/login"
                    className="px-3.5 py-1.5 rounded-xl bg-black text-white text-xs font-display font-bold shrink-0"
                  >
                    {t('nav.login')}
                  </a>
                )}
              </div>
              <a
                href="/dashboard"
                className="sm:hidden p-2 rounded-lg text-black"
                aria-label={t('nav.portfolio')}
              >
                <Wallet className="w-5 h-5" />
              </a>
              <button
                type="button"
                className="xl:hidden p-2 text-black"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label={mobileMenuOpen ? t('nav.closeMenu') : t('nav.openMenu')}
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="xl:hidden border-t border-black/10 px-3 sm:px-4 pt-2 pb-4 space-y-1 bg-white/95 max-h-[min(80vh,32rem)] overflow-y-auto">
            {user?.publicKey && (
              <div className="px-3 py-2">
                <p className="text-[10px] uppercase text-neutral-500 mb-1">{t('nav.yourWallet')}</p>
                <WalletAddress address={user.publicKey} compact />
              </div>
            )}
            {allLinks.map((link) => {
              const Icon = link.icon;
              return (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={closeMenu}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-display font-bold ${
                    isActive(link.href) ? 'bg-black text-white' : 'text-neutral-700 hover:bg-black/5'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {link.label}
                </a>
              );
            })}

            <div className="pt-2 mt-2 border-t border-black/10 space-y-1 sm:hidden">
              <a
                href="/dashboard"
                onClick={closeMenu}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-display font-bold text-neutral-700 hover:bg-black/5"
              >
                <Wallet className="w-4 h-4 shrink-0" />
                {walletLabel}
              </a>
              {user ? (
                <>
                  <a
                    href="/dashboard"
                    onClick={closeMenu}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-display font-bold text-neutral-700 hover:bg-black/5 truncate"
                  >
                    {user.name}
                  </a>
                  <a
                    href="/account/security"
                    onClick={closeMenu}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-display font-bold text-neutral-700 hover:bg-black/5"
                  >
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    {t('sec.navLabel')}
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      logout();
                      closeMenu();
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-display font-bold text-neutral-700 hover:bg-black/5"
                  >
                    <LogOut className="w-4 h-4 shrink-0" />
                    {t('nav.logout')}
                  </button>
                </>
              ) : (
                <a
                  href="/login"
                  onClick={closeMenu}
                  className="flex items-center justify-center gap-2 mx-3 mt-1 px-3 py-2.5 rounded-xl bg-black text-white text-sm font-display font-bold"
                >
                  {t('nav.login')}
                </a>
              )}
            </div>
          </div>
        )}
        <AccountNotices />
      </nav>
      {/* Outside <nav>: its backdrop-filter would trap a `position: fixed` overlay. */}
      <TwoFactorDialog />
    </>
  );
}

export default withIsland(Navbar);
