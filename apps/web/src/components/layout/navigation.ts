/**
 * Information architecture (docs/design/benchmark.md §2b): five tabs for a
 * signed-in investor, the admin console apart, and section pills inside
 * Mercado, Cuenta and Consola. One source of truth for header, tab bar and
 * section navs.
 */
export type TabKey = 'home' | 'offerings' | 'markets' | 'portfolio' | 'account' | 'console';

export interface TabDef {
  key: TabKey;
  href: string;
  /** i18n key */
  label: string;
  /** Paths that belong to the tab (prefix match). */
  match: string[];
}

export const APP_TABS: TabDef[] = [
  { key: 'home', href: '/dashboard', label: 'shell.tabs.home', match: ['/dashboard'] },
  { key: 'offerings', href: '/market', label: 'shell.tabs.offerings', match: ['/market'] },
  {
    key: 'markets',
    href: '/orderbook',
    label: 'shell.tabs.markets',
    match: ['/orderbook', '/stocks', '/forwards', '/warrants'],
  },
  { key: 'portfolio', href: '/portfolio', label: 'shell.tabs.portfolio', match: ['/portfolio'] },
  {
    key: 'account',
    href: '/account',
    label: 'shell.tabs.account',
    match: ['/account', '/wallet', '/onboarding'],
  },
];

export const CONSOLE_TAB: TabDef = {
  key: 'console',
  href: '/admin',
  label: 'shell.tabs.console',
  match: ['/admin'],
};

/** Visitors: product first, then the two landing anchors. */
export const PUBLIC_TABS = [
  { key: 'offerings', href: '/market', label: 'shell.tabs.offerings' },
  // Trading screens need an account: visitors get the product overview.
  { key: 'markets', href: '/#productos', label: 'shell.tabs.markets' },
  { key: 'issuers', href: '/#emisores', label: 'shell.tabs.issuers' },
  { key: 'how', href: '/#como-funciona', label: 'shell.tabs.howItWorks' },
] as const;

const matches = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

export function activeTab(pathname: string): TabKey | undefined {
  if (matches(pathname, '/admin')) return 'console';
  return APP_TABS.find((tab) => tab.match.some((m) => matches(pathname, m)))?.key;
}

/** Section pills (second level). Labels are i18n keys. */
export const SECTIONS = {
  markets: [
    { key: 'orderbook', href: '/orderbook', label: 'markets.nav.secondary' },
    { key: 'stocks', href: '/stocks', label: 'markets.nav.merval' },
    { key: 'forwards', href: '/forwards', label: 'markets.nav.forwards' },
    { key: 'warrants', href: '/warrants', label: 'markets.nav.warrants' },
  ],
  account: [
    { key: 'overview', href: '/account', label: 'account.nav.overview' },
    { key: 'wallet', href: '/wallet', label: 'account.nav.wallet' },
    { key: 'verification', href: '/onboarding/kyc', label: 'account.nav.verification' },
    { key: 'security', href: '/account/security', label: 'account.nav.security' },
    { key: 'privacy', href: '/account/privacidad', label: 'account.nav.privacy' },
  ],
  console: [
    { key: 'overview', href: '/admin', label: 'admin.nav.overview' },
    { key: 'issuance', href: '/admin/issuance', label: 'admin.nav.issuance' },
    { key: 'kyc', href: '/admin/kyc', label: 'admin.nav.kyc' },
    { key: 'opa', href: '/admin/opa', label: 'admin.nav.opa' },
    { key: 'testnet', href: '/admin/testnet', label: 'admin.nav.testnet' },
    { key: 'audit', href: '/admin/audit', label: 'admin.nav.audit' },
    { key: 'support', href: '/admin/soporte', label: 'admin.nav.support' },
  ],
} as const;

export type SectionName = keyof typeof SECTIONS;
