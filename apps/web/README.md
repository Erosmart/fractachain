# @fractachain/web

La aplicación de Fractachain: **Astro 7 (SSR, adaptador Node en modo middleware)** con
**islas React 19**, y el **API montado en el mismo servidor** (`/api/*`, `/health`).
Un proceso, un puerto, un origen. Reemplaza a la app Next.js 14 y al servidor Express
separado; las URLs, el copy y el diseño son los mismos.

```bash
npm run dev                             # (raíz) http://localhost:3000 — astro dev + API adentro
npm run build && npm start              # (raíz) build de API + web y servidor único
npm run typecheck -w @fractachain/web   # astro check
npm run test -w @fractachain/web        # vitest
```

- `server/main.mjs` — entry de producción: `startPlatform({ web: { handler, clientDir } })`
  de `@fractachain/api` arma el servidor raíz (API → assets → Astro).
- `integrations/platform.mjs` — en `astro dev` carga el API (TypeScript vía `tsx`) y lo
  agrega como middleware de Vite. Cambios en `packages/api` requieren reiniciar el dev server.

Variables: un solo `.env` en la raíz del repo (`.env.example`). `PUBLIC_*` se incrusta al
compilar; `PUBLIC_API_URL` vacío = API en el mismo origen.

## Estructura

```
src/
├── pages/                 Rutas. Archivos finos: layout + una isla (o HTML estático).
├── layouts/BaseLayout     <html>, fuentes, script de tema, Navbar, Footer.
├── middleware.ts          Locale (cookie fc_lang) + headers de seguridad.
├── components/
│   ├── marketing/         Secciones de la home en .astro (cero JS).
│   ├── layout/            Navbar (isla), Footer (.astro + isla admin), toggles.
│   ├── guards/            RequireOnboarding / RequireAdmin (UX; el API valida).
│   ├── island/            withIsland(): raíz de cada isla (locale para SSR).
│   └── ui/                Piezas reutilizables (WalletAddress, AuthenticatedImage…).
├── features/<dominio>/    Pantallas por dominio: auth, onboarding, market, orderbook,
│                          portfolio, stocks, derivatives, wallet, admin/*.
├── core/                  Lógica sin UI (no importa React):
│   ├── config/            AppConfig (env tipado, reescritura localhost → host LAN).
│   ├── http/              IHttpClient + FetchHttpClient (timeouts, envelope, 401).
│   ├── api/               Una clase por contexto (AuthApi, ListingsApi, MarketApi…).
│   ├── auth/              SessionStore, TokenStorage, AuthService, rutas de onboarding.
│   ├── onboarding/        OnboardingService (custodia, Freighter, KYC).
│   ├── investor/          InvestorService (trustline, claim, refund, dividendos…).
│   ├── wallet/            IWalletSigner + Freighter, SelfCustodyRelay, fondeo USDC.
│   ├── firebase/          Google sign-in con import dinámico.
│   ├── i18n/ theme/       Diccionarios + stores de idioma y tema.
│   ├── security/csp.mjs   Política CSP compartida por astro.config y el middleware.
│   └── container.ts       Composition root: instancia todo una sola vez.
├── hooks/                 useAuth, useSession, useI18n, useTheme, useVisibleInterval.
└── styles/global.css
```

### Decisiones

- **Estado compartido entre islas.** Cada isla de Astro es una raíz React propia, así que
  el contexto de React no cruza islas. La sesión, el idioma y el tema viven en stores
  (`core/store/Store.ts`) instanciados en `container.ts` y se leen con
  `useSyncExternalStore`. Navbar, Footer y la página ven la misma sesión.
- **Inversión de dependencias.** Las clases de `core/api` reciben un `IHttpClient`; los
  servicios reciben APIs, stores y un `IWalletSigner`. Nada importa `fetch`, `localStorage`
  ni Freighter directamente salvo sus implementaciones, así que todo se testea con dobles.
- **SSR donde aporta.** Home, `/market`, `/forwards` y `/warrants` se renderizan en el
  servidor. Las pantallas que dependen de la sesión (que vive en el navegador) usan
  `client:only` con un placeholder renderizado en el servidor.

## Seguridad

- **Sesión en cookie.** El API (mismo origen) setea `fc_session` `HttpOnly; SameSite=Strict`
  (`__Host-` + `Secure` en producción). El JavaScript de la página nunca ve el token: en
  `localStorage` solo queda una copia no sensible del usuario y `expiresAt` para pintar la UI
  al instante (`SessionCache`). La verdad es `GET /api/auth/me`; un 401 cierra la sesión.
- **CSRF.** El cliente HTTP manda `X-Requested-With: fractachain` en cada request al API (que
  rechaza escrituras con cookie sin ese header) y nunca adjunta credenciales a terceros.
- **2FA.** Diálogo de código (TOTP o recuperación) para cualquier login con segundo factor;
  `/account/security` para activarlo (QR generado en el navegador), desactivarlo y cerrar
  todas las sesiones. El panel admin avisa si el servidor exige 2FA.
- **Email y contraseña.** `/verify-email`, `/forgot-password`, `/reset-password` (el token se
  borra de la barra de direcciones); banner para reenviar la verificación.
- **CSP sin `unsafe-inline` en scripts.** Astro (`security.csp`) envía la política como header
  con el sha256 de cada script inline; el bootstrap del tema se hashea en `astro.config.mjs`.
  El middleware agrega `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`,
  `Referrer-Policy`, `Permissions-Policy`, COOP y HSTS (si es HTTPS). `connect-src 'self'`
  (+ Stellar y Firebase).
- **Redirecciones.** `?next=` solo acepta rutas relativas del mismo sitio.
- **Selfie.** Se reescala a 1280px/JPEG en el navegador antes de subirla (menos payload y sin
  metadata EXIF/GPS); se muestra con `<img>` normal porque la cookie viaja sola.
