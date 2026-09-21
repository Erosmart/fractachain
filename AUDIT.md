# Auditoría FractaChain — rendimiento y código

Fecha: 2026-09-21  
Alcance: frontend Next.js 14, backend Express/TypeScript, capa Stellar (Horizon + Soroban). Contratos Rust se revisaron solo a nivel de superficie (no hay N+1 de UI ahí).  
Criterio de cambio: alto valor + bajo riesgo. Refactors estructurales quedan como recomendación.

## Stack (resumen)

| Capa | Qué es |
|---|---|
| Contratos | Soroban 28 (`fractachain-licitacion`, `stock-vault`, `forward-contract`, `warrant-vault`, factory) |
| API | Express + `@stellar/stellar-sdk` 17, CLOB sandbox + SDEX, KYC, listings JSON/Postgres |
| UI | Next 14 App Router, React 18, Tailwind, Firebase opcional, Freighter |
| Datos on-chain | Horizon testnet (SDEX, trustlines) + RPC Soroban (licitación) |

El cuello de botella real no está en React “por magia”: está en **round-trips a Horizon/RPC**, **polling cada 4s**, **Firebase en el bundle inicial**, y **dos universos de auth/KYC** que duplican estado.

---

## Hallazgos aplicados en este PR

### Alto — N+1 de Horizon en compliance y órdenes

**Evidencia.** `getTrustlineState` hacía `server().loadAccount(accountId)` por activo. `grantHolderAuthorization` / `revokeHolderAuthorization` iteraban listings y pagaban N GET `/accounts`. `prepareOrder` cargaba la misma cuenta dos veces (token + USDC).

**Cambio.** `getTrustlineStates(accountId, assets[])` carga la cuenta **una vez** y deriva todas las líneas. Las txs de issuer (`authorizeHolder`) siguen en serie: paralelo chocaría el sequence number.

**Impacto.** Un KYC con 3 listings pasa de 3 `loadAccount` a 1. Colocar una orden pasa de 2 a 1. En testnet cada Horizon RTT suele ser 200–800 ms.

### Alto — polling a 4s sin tope de concurrencia

**Evidencia.** `/orderbook`, `/admin/kyc` y `/onboarding/pending` hacían `setInterval(..., 4000)` aunque el tab estuviera oculto. Si Horizon tarda >4s, las peticiones se apilan. Cada poll de orderbook pega a `/api/sdex/:id` → orderbook + trades + (opcional) offers + trustline.

**Cambio.** Hook `useVisibleInterval`: no corre con el tab hidden, no solapa in-flight, refetch al volver. Backend: TTL 2s + coalescing de lecturas SDEX (`getOrderBook` / `getRecentTrades` / `getSdexBook`); se invalida al submitir una tx.

**Impacto.** Menos 429/timeouts de Horizon, menos CPU en el API cuando hay varios tabs o agentes, UI igual de “viva” cuando el usuario está mirando.

### Alto — Firebase en el grafo inicial de todas las páginas

**Evidencia.** `AuthContext` importaba `../lib/firebase` de forma estática. `firebase/app` + `firebase/auth` se inicializaban al boot (incluso con API key mock) y viajaban en el JS de landing/market/orderbook.

**Cambio.** `import()` dinámico solo en login Google y logout. El chunk de Firebase no entra al bundle de la sesión email/wallet.

**Impacto.** Menos JS parseado en el primer paint (Firebase Auth suele ser cientos de KB gzipped). Login Google igual de funcional.

### Medio — clientes Horizon/RPC recreados en cada llamada

**Evidencia.** `new Horizon.Server(...)` y `new rpc.Server(...)` en `sdex.ts`, `stellar_testnet.ts`, `soroban.ts`, `onchain.ts` por request.

**Cambio.** Singletons cacheados por URL.

**Impacto.** Menos overhead de HTTP agent / handshake; mismo comportamiento.

### Medio — awaits en serie que no dependen uno del otro

**Evidencia.** `buildPortfolio` esperaba todas las cotizaciones y **después** el USDC on-chain. `contributeOnChain` / `refundOnChain` leían `get_total_raised` y `get_rwa_balance` (o precio) en serie.

**Cambio.** `Promise.all` en esos caminos.

**Impacto.** Un RTT menos por portfolio y por aporte/refund (RPC Soroban).

### Medio — re-renders del árbol autenticado

**Evidencia.** `AuthContext.Provider` armaba un `value={{ ... }}` nuevo en cada render; las funciones no estaban en `useCallback`. Navbar, Footer y gates se re-renderizaban con cualquier setState interno. `ThemeContext` igual.

**Cambio.** `useCallback` + `useMemo` en auth y theme.

**Impacto.** Menos trabajo de React en navegación y polling de `/auth/me`. Comportamiento idéntico.

### Medio — fuentes render-blocking + lucide barrel

**Evidencia.** Tres `<link>` a fonts.googleapis.com (Lato + Source Serif 4 + Share Tech Mono) bloqueaban el primer paint. `lucide-react` se importa por barrel en casi todas las páginas.

**Cambio.** `next/font/google` (self-host + `display: swap`). `experimental.optimizePackageImports: ['lucide-react']`.

**Impacto.** Menos FOIT/FOUT y menos JS de iconos en el main bundle.

### Bajo — dependencias y datos muertos

**Evidencia.** `clsx` y `tailwind-merge` en `frontend/package.json` sin ningún import. `MOCK_POOLS` ya no se usaba (el market pega a `/api/market/pools`); el tipo `Pool` sí.

**Cambio.** Se desinstalaron las deps; se dejó solo el tipo `Pool`.

---

## Hallazgos no aplicados (recomendaciones)

### Crítico / alto — no tocar ahora

| ID | Hallazgo | Por qué no se cambió |
|---|---|---|
| R1 | **No paralelizar txs del issuer.** `authorizeHolder` / `deauthorizeHolder` firman con la misma cuenta. `Promise.all` reusa sequence y falla en Horizon. | Riesgo de romper KYC on-chain. |
| R2 | **`server.ts` (~1000 líneas) es el router de todo.** Listings, SDEX, KYC, mocks, auth. Difícil de seguir y de testear. | Split por `app.use('/api/listings', …)` es un refactor de superficie grande; no cambia runtime. |
| R3 | **Dos sistemas de auth y dos de KYC.** `auth/google_auth.ts` (in-memory, KYC APPROVED de entrada, wallet demo hardcodeada) convive con `auth/accounts.ts` + Firebase. `admin/kyc_review.ts` tiene su propia DB in-memory (`PENDIENTE/APROBADO`) y hace `require('../auth/accounts')` para no ciclar imports. `/api/auth/me` consulta accounts → google → firebase. | Unificar es el refactor más valioso del repo y el más fácil de romper onboarding. Hacerlo en un PR dedicado con tests de sesión. |
| R4 | **Primario UI ≠ Soroban en USDC.** README ya lo dice: `contribute` de la UI sigue sandbox salvo listings XLM. No es un bug de perf, es deuda de producto. | Fuera de alcance de cleanup. |

### Medio — deuda clara, riesgo o alcance mayores

| ID | Hallazgo | Qué haría |
|---|---|---|
| R5 | **`AuthContext` es un god-object.** Login, custodia, KYC, trustline, claim, distribute, refund, dividendos, secret. Cada página de mercado se acopla al provider. | Extraer `useListingsActions` / `useWalletSecret`. |
| R6 | **Landing (`src/app/page.tsx`) es `'use client'` entero** con SVG hero + i18n. El HTML no se puede cachear como RSC. | Extraer `DynamicHeroText` y toggles; dejar el resto server. |
| R7 | **URL de Horizon duplicada.** `stellar_testnet.ts` usa `STELLAR_HORIZON_URL`; SDEX usa `getTestnetConfig().horizonUrl`. Si el admin cambia testnet.json, balances XLM/USDC y el libro pueden hablar con nodos distintos. | Una sola fuente (`getTestnetConfig`) en un follow-up. |
| R8 | **`quoteListing` por holding pega SDEX** (orderbook + trades) sin cache de cotización a nivel listing. Varios holders del mismo ticker = mismas llamadas. El TTL de 2s mitiga si coinciden; un mapa `listingId → quote` en `buildPortfolio` sería más limpio. | Bajo riesgo, se puede hacer en un PR chico. |
| R9 | **`hydrateTestnetWallet` llama Friendbot en login.** Es sincrónico en `/api/auth/wallet` y fire-and-forget en `/api/auth/email`. Friendbot a 25s de timeout puede colgar el onboarding custodial. | Timeout más agresivo + cache “ya fondeado”; no se tocó para no cambiar demos. |
| R10 | **`graphify-out/`** (~análisis HTML/JSON) no es producto y no está gitignored (solo `cache/`). Infla el clone. | Agregar a `.gitignore` cuando el equipo no lo necesite en el remoto. |
| R11 | **`frontend/scripts/logo-upload-server.js` y `brands-upload-server.js`.** Mini HTTP servers locales, no cableados al app. | Dejarlos o moverlos a `/tools`; no son runtime. |
| R12 | **`fetchApi` en `lib/api.ts` no tiene callers.** Todas las páginas hacen `fetch` a mano (sin abort, sin timeout). | Adoptar `fetchApi` + `AbortController` de a un flujo. |
| R13 | **JSON en disco + `fs.writeFileSync` en el request path** (`accounts`, listings, orderbook). Con `pg` opcional encima. En un solo dyno demo está bien; no escala. | Si hay más de un replica Railway, la fuente de verdad tiene que ser Postgres siempre. |
| R14 | **Landing carga `lucide-react` a montones** (13 iconos). Con `optimizePackageImports` alcanza; un sprite SVG del brand sería más chico todavía. | Cosmético. |
| R15 | **`RAILWAY_DEPLOY.md` desactualizado** (dice contratos no deployados; `deployments/testnet.json` sí existe). README ya lo nota. | Doc-only. |

### Bajo

| ID | Hallazgo |
|---|---|
| R16 | Tokens de sesión `fc_jwt_` en base64, no JWT firmado. OK para sandbox, no para prod. |
| R17 | `console.warn` en `fetchApi` (si se empieza a usar) ensucia la consola en errores esperados. |
| R18 | `google_auth` asigna la misma wallet demo a todos los logins Google mock. |
| R19 | Tests del backend (`test_runner.ts`) cubren mocks/KYC/Google, no SDEX ni el N+1 de Horizon. |

---

## Qué no se tocó a propósito

- Secretos, `.env`, claves Stellar, `WALLET_PEPPER`.
- Contratos Soroban / snapshots de tests.
- Matching sandbox (`orderbook.ts`) — es CPU trivial en memoria.
- UX/copy, layout de orderbook, flujos de producto.
- Paralelizar `verifyInvestorOnChain` por listing (también son txs del admin).

---

## Cómo verificar

```bash
cd backend && npm test && npm run build
cd frontend && npm run build
```

Comportamiento esperado igual: login email/wallet/Google, KYC admin, orderbook sandbox y SDEX, portfolio. Lo que cambia es menos trabajo por tick (polls, Horizon, JS inicial).
