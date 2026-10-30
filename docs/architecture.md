# Arquitectura (v2 · rama `macroupdate`)

Monorepo con **npm workspaces** y **una sola aplicación desplegable**: el
servidor Node de `apps/web` sirve las páginas Astro y el API en el mismo
proceso, puerto y origen.

```
fractachain/
├── apps/
│   └── web/                 La app: Astro 7 (SSR, adaptador Node en modo middleware)
│       ├── server/main.mjs  Entry de producción: /api y /health → API · resto → Astro
│       └── integrations/    Monta el API dentro de `astro dev` (un solo proceso también en desarrollo)
├── packages/
│   ├── api/                 Backend por capas (librería) · Express 5 + TypeScript
│   └── shared/              Contrato de tipos HTTP compartido (solo .d.ts)
├── contracts/               Workspace Cargo · Soroban 28 (sin cambios funcionales)
├── deployments/             IDs públicos de testnet (sin secretos)
├── scripts/testnet/         Pipeline de deploy de contratos (bash + Stellar CLI)
├── tools/agents/            Agentes de mercado para testnet (fuera del runtime)
├── docs/                    Arquitectura, seguridad, guías, runbooks, pitch
└── .github/workflows/ci.yml Typecheck + tests + build + audit + cargo test
```

## API (`packages/api`)

Arquitectura en capas con inversión de dependencias: cada capa sólo conoce a
la de abajo a través de **interfaces**, y las clases concretas se instancian
en un único **composition root** (`src/container.ts`).

```
src/
├── main.ts                  API sola (la app la corre dentro del servidor web)
├── platform/                startPlatform(), createRootApp(), carga de .env, apagado ordenado
├── container.ts             composition root (DI manual, sin magia)
├── config/env.ts            configuración tipada y validada con zod (fail-fast en prod)
├── shared/                  errores tipados, logger (pino + redacción), clock, KeyedMutex
├── domain/                  reglas puras: entidades, políticas, máquinas de estado
│   ├── account/             Account, TraderPolicy, IAccountRepository
│   ├── listing/             Listing, DossierValidator, IListingRepository
│   ├── licitacion/          estados del contrato, reglas de cierre y settlement
│   ├── market/              SandboxMatchingEngine (CLOB puro), dividendos
│   ├── kyc/                 KycRecord, GafiPolicy, horario bancario
│   └── stellar/             direcciones y stroops (value objects)
├── application/             casos de uso (un servicio por responsabilidad)
│   ├── auth/AuthService           email · Google (Firebase verificado) · Freighter · desafío 2FA
│   ├── security/…                 TwoFactorService (TOTP), EmailVerificationService, PasswordResetService
│   ├── audit/AuditTrail           registro de auditoría (acciones admin + eventos de seguridad)
│   ├── account/…                  AccountService (ledger), WalletService, CustodialKeyService, AccountBootstrapper
│   ├── kyc/KycService             onboarding, cola de compliance, selfies, settle()
│   ├── kyc/IdentityVerificationService  verificación en Didit: sesiones, sync, webhooks
│   ├── listing/…                  ListingLedger (agregado), IssuanceWorkflowService, ListingPresenter
│   ├── offering/…                 OfferingService (aportes, refunds, claim), OnChainStatusService
│   ├── settlement/…               SettlementService (finalize automático + reparto)
│   ├── market/…                   SdexMarketService, SandboxOrderBookService, PortfolioService, DividendService
│   ├── compliance/…               autorización de trustlines (AUTH_REQUIRED)
│   └── custody/ issuance/ testnet/ demo/ mocks/
├── infrastructure/          adaptadores (implementan los puertos)
│   ├── persistence/         IDocumentStore → JSON atómico + espejo Postgres; repositorios
│   ├── security/            scrypt, tokens HMAC con expiración/revocación, AES-GCM, Firebase JWKS, SEP-53, TOTP, tokens de un solo uso
│   ├── mail/                IMailer: SMTP (nodemailer) o log en desarrollo
│   ├── kyc/                 DiditClient (IIdentityVerificationProvider) + autenticación de webhooks
│   ├── stellar/             Horizon, Soroban RPC, SDEX, faucet USDC, contratos, keyring, política de XDR firmados
│   └── storage/             selfies (validación por magic bytes)
├── http/                    Express: app, controllers (clases), middlewares, DTOs zod
├── jobs/                    SettlementSweepJob
└── cli/                     deploy de licitación / forward / warrant, clon de factory
```

### Principios aplicados

| Principio                 | Dónde se ve                                                                                                                                                                                                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S**ingle responsibility | v1 tenía `server.ts` de 1 300 líneas y `accounts.ts` mezclando auth, KYC, wallet y ledger. Ahora: `AuthService` sólo autentica, `WalletService` sólo provisiona wallets, `AccountService` sólo mueve el ledger, `CustodialKeyService` sólo custodia claves. |
| **O**pen/closed           | Los controllers implementan `Controller.register(router)`: agregar un área nueva es sumar una clase al array del container, sin tocar `app.ts`. Los errores de dominio extienden `AppError` y el handler HTTP los mapea sin conocerlos.                     |
| **L**iskov                | `InMemoryDocumentStore`, `JsonFileDocumentStore` y `PostgresMirroredStore` son intercambiables detrás de `IDocumentStore` (los tests usan la versión en memoria). Igual `EnvFileSecretStore` / `InMemorySecretStore`.                                       |
| **I**nterface segregation | Los servicios dependen de vistas mínimas: `DeploymentRegistryLike` (solo `load`), `INetworkSettingsProvider` (solo `get`), `IWalletHydrator`, `ITreasurySecrets`.                                                                                           |
| **D**ependency inversion  | La capa de aplicación depende de `IAccountRepository`, `IPasswordHasher`, `ITokenService`, `IIdentityTokenVerifier`, `IWalletSignatureVerifier`, `ISelfieStorage`, `IClock`… y sólo `container.ts` elige implementaciones.                                  |

### Flujo de una request

```
HTTP ─▶ requestContext (X-Request-Id, access log)
     ─▶ helmet (headers) ─▶ CORS allowlist ─▶ rate limit global
     ─▶ express.json (100 kB; 8 MB solo en /api/kyc/onboard)
     ─▶ AuthMiddleware.attach (cookie HttpOnly o Bearer fc2.… → req.account)
     ─▶ AuthMiddleware.csrf (con cookie: header X-Requested-With + mismo origen)
     ─▶ Controller: guard (requireAuth / requireAdmin + 2FA) → rate limit → auditoría → DTO zod
     ─▶ Service (dominio + puertos) ─▶ Adaptadores (JSON/PG, Horizon, Soroban)
     ─▶ errorHandler: AppError → status + {success:false,message,code}; resto → 500 genérico
```

### Persistencia

Cada colección es un documento JSON (`users.json`, `listings.json`, `kyc.json`…),
escrito de forma **atómica** (archivo temporal + rename). Con `DATABASE_URL`,
`PostgresMirroredStore` espeja cada escritura en la tabla `kv_store` y
**restaura** el estado al arrancar (reemplaza al viejo `scripts/pg_restore.js`).
Es el mismo modelo que v1, ahora detrás de una interfaz: migrar a tablas
relacionales es reemplazar los repositorios, no los servicios.

### Concurrencia

Los flujos que leen el ledger, esperan a la red y vuelven a escribir (pagar
tokens pendientes, bookear un aporte con lecturas antes/después del contrato)
se serializan por `cuenta:listing` detrás de `ILockProvider`: en un proceso,
un mutex en memoria; con `DATABASE_URL`, **advisory locks de Postgres**
(`pg_advisory_lock`), así varias réplicas tampoco pueden pagar dos veces.

## Web (`apps/web`)

Astro 7 en modo **SSR** (adaptador Node en modo middleware) con **islas React** sólo
donde hay interacción. Las secciones de marketing de la home se renderizan en
el servidor (cero JS). Ver `apps/web/README.md` para el detalle de capas
(`core/` con config, cliente HTTP, APIs por contexto, stores observables,
servicios de auth/onboarding/inversor y firmador de wallet).

El sistema de diseño (tokens claro/oscuro, kit de componentes, gráficos y
arquitectura de cinco pestañas) está descripto en `apps/web/README.md`
§ Sistema de diseño.

Como cada isla de Astro es una raíz React independiente, el estado global
(sesión, idioma, tema) **no** vive en React Context sino en stores observables
singleton (`core/store/Store.ts`) consumidos con `useSyncExternalStore`.

## Contratos (`contracts/`)

Workspace Cargo con `issuance-factory`, `fractachain-licitacion`,
`stock-vault`, `forward-contract`, `warrant-vault` y `fractachain-core`
(librería). Esta rama corrige todos los hallazgos de la revisión de seguridad
(`docs/security/security-review-2026-10.md`) con tests de regresión
(`cargo test`: 135). Los WASM se compilan con `stellar contract build`
(`scripts/testnet/02-build.sh`).
