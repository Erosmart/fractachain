/**
 * Runtime configuration of the web app.
 *
 * `PUBLIC_*` variables are inlined by Vite at build time; this class is the only
 * place that reads them, so the rest of the code depends on a typed object
 * instead of `import.meta.env` strings.
 */
export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export interface AppConfigValues {
  apiUrl: string;
  stellarRpcUrl: string;
  networkPassphrase: string;
  firebase: FirebaseWebConfig;
  /** Legal name shown in the legal documents (optional; never invented). */
  legalEntity?: string;
  /** Public contact email for legal/privacy requests (optional; the /contact form otherwise). */
  contactEmail?: string;
}

export const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
const LOOPBACK = new Set(['localhost', '127.0.0.1']);

export class AppConfig {
  constructor(private readonly values: AppConfigValues) {}

  static fromEnv(env: ImportMetaEnv = import.meta.env): AppConfig {
    return new AppConfig({
      // Empty = the API is served by this same server (default: unified deployment).
      apiUrl: env.PUBLIC_API_URL || '',
      stellarRpcUrl: env.PUBLIC_STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org',
      networkPassphrase: env.PUBLIC_STELLAR_NETWORK_PASSPHRASE || TESTNET_PASSPHRASE,
      firebase: {
        apiKey: env.PUBLIC_FIREBASE_API_KEY || '',
        authDomain: env.PUBLIC_FIREBASE_AUTH_DOMAIN || '',
        projectId: env.PUBLIC_FIREBASE_PROJECT_ID || '',
        storageBucket: env.PUBLIC_FIREBASE_STORAGE_BUCKET || '',
        messagingSenderId: env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
        appId: env.PUBLIC_FIREBASE_APP_ID || '',
      },
      legalEntity: env.PUBLIC_LEGAL_ENTITY?.trim() || undefined,
      contactEmail: env.PUBLIC_CONTACT_EMAIL?.trim() || undefined,
    });
  }

  get networkPassphrase(): string {
    return this.values.networkPassphrase;
  }

  get stellarRpcUrl(): string {
    return this.values.stellarRpcUrl;
  }

  get firebase(): FirebaseWebConfig {
    return this.values.firebase;
  }

  /** Who provides the service, as configured; null when the operator has not set it. */
  get legalEntity(): string | null {
    return this.values.legalEntity || null;
  }

  /** Contact email for legal and privacy requests; null → the /contact form. */
  get contactEmail(): string | null {
    const email = this.values.contactEmail;
    return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
  }

  get firebaseConfigured(): boolean {
    const { apiKey, authDomain, projectId, appId } = this.values.firebase;
    return Boolean(apiKey && authDomain && projectId && appId);
  }

  /**
   * Base URL of the API as seen from the current page. With no
   * `PUBLIC_API_URL` the API lives on the same origin as the page.
   *
   * A loopback API URL is rewritten to the page's own host when the app is
   * opened from another device on the LAN (e.g. a phone hitting
   * `http://192.168.0.14:3000`), keeping the configured port.
   */
  apiBaseUrl(
    location: Pick<Location, 'hostname' | 'protocol' | 'origin'> | null = AppConfig.currentLocation(),
  ): string {
    const fallback = this.values.apiUrl.replace(/\/+$/, '');
    // Same-origin API (web and API in one server): the page's own origin.
    if (!fallback) return location?.origin ?? '';
    if (!location) return fallback;
    try {
      const configured = new URL(fallback, location.origin);
      if (LOOPBACK.has(configured.hostname) && !LOOPBACK.has(location.hostname)) {
        configured.hostname = location.hostname;
        configured.protocol = location.protocol;
        return configured.origin;
      }
    } catch {
      // malformed PUBLIC_API_URL: keep it verbatim and let the request fail loudly
    }
    return fallback;
  }

  private static currentLocation(): Location | null {
    return typeof window === 'undefined' ? null : window.location;
  }
}
