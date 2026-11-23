/**
 * Composition root. Every singleton is built here, once, and wired through its
 * constructor — no class reaches for a global. Islands import from this module,
 * so all islands on a page share the same stores and services.
 */
import { AccountSecurityService } from './account/AccountSecurityService';
import { AccountApi } from './api/AccountApi';
import { AdminApi } from './api/AdminApi';
import { ChainApi } from './api/ChainApi';
import { TxApi } from './api/TxApi';
import { AuthApi } from './api/AuthApi';
import { CustodyApi } from './api/CustodyApi';
import { KycApi } from './api/KycApi';
import { ListingsApi } from './api/ListingsApi';
import { MarketApi } from './api/MarketApi';
import { OnChainApi } from './api/OnChainApi';
import { PortfolioApi } from './api/PortfolioApi';
import { SupportApi } from './api/SupportApi';
import { READ_TIMEOUT_MS } from './api/timeouts';
import { WalletApi } from './api/WalletApi';
import { AuthService } from './auth/AuthService';
import { SessionStore } from './auth/SessionStore';
import { LocalStorageSessionCache, MemorySessionCache } from './auth/SessionCache';
import { AppConfig } from './config/AppConfig';
import { FirebaseAuthProvider } from './firebase/FirebaseAuthProvider';
import { FetchHttpClient } from './http/FetchHttpClient';
import { LocaleStore } from './i18n/LocaleStore';
import { translate, type Translate } from './i18n/translate';
import { InvestorService } from './investor/InvestorService';
import { Navigator } from './navigation/Navigator';
import { OnboardingService } from './onboarding/OnboardingService';
import { ThemeStore } from './theme/ThemeStore';
import { FreighterWalletSigner } from './wallet/FreighterWalletSigner';
import { SelfCustodyRelay } from './wallet/SelfCustodyRelay';
import { UsdcFundingService } from './wallet/UsdcFundingService';

const isBrowser = typeof window !== 'undefined';

const config = AppConfig.fromEnv();
const localeStore = new LocaleStore(LocaleStore.fromDocument());
const themeStore = new ThemeStore();
/** Translator bound to the live locale, for code outside React (errors thrown by services). */
const t: Translate = (key, vars) => translate(localeStore.locale, key, vars);

const sessionStore = new SessionStore(isBrowser ? new LocalStorageSessionCache() : new MemorySessionCache());
if (isBrowser) sessionStore.hydrate();

const http = new FetchHttpClient({
  baseUrl: () => config.apiBaseUrl(),
  unauthorized: sessionStore,
  policy: sessionStore,
  defaultTimeoutMs: READ_TIMEOUT_MS,
  messages: {
    network: () => t('err.apiDown'),
    timeout: () => t('err.timeout'),
    badResponse: () => t('err.badResponse'),
    rateLimited: () => t('err.rateLimited'),
    failed: () => t('err.opFailed'),
  },
});

const api = Object.freeze({
  auth: new AuthApi(http),
  kyc: new KycApi(http),
  wallet: new WalletApi(http),
  listings: new ListingsApi(http),
  market: new MarketApi(http),
  portfolio: new PortfolioApi(http),
  custody: new CustodyApi(http),
  onChain: new OnChainApi(http),
  admin: new AdminApi(http),
  tx: new TxApi(http),
  chain: new ChainApi(http),
  account: new AccountApi(http),
  support: new SupportApi(http),
});

const walletSigner = new FreighterWalletSigner(config.networkPassphrase, t);
const relay = new SelfCustodyRelay(http, walletSigner, t);
const usdcFunding = new UsdcFundingService(api.wallet, walletSigner);
const google = new FirebaseAuthProvider(config.firebase, config.firebaseConfigured, t);

const authService = new AuthService(api.auth, sessionStore, walletSigner, google, usdcFunding);
const securityService = new AccountSecurityService(api.auth, sessionStore);
const onboardingService = new OnboardingService(
  api.auth,
  api.kyc,
  sessionStore,
  walletSigner,
  usdcFunding,
  t,
);
const investorService = new InvestorService(
  api.listings,
  api.market,
  api.auth,
  authService,
  sessionStore,
  relay,
  t,
);

export const container = Object.freeze({
  config,
  http,
  api,
  t,
  navigator: new Navigator(),
  stores: Object.freeze({ session: sessionStore, locale: localeStore, theme: themeStore }),
  wallet: Object.freeze({ signer: walletSigner, relay, usdcFunding }),
  services: Object.freeze({
    auth: authService,
    security: securityService,
    onboarding: onboardingService,
    investor: investorService,
  }),
});

export type Container = typeof container;
