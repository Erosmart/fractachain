# Fractachain

Plataforma de **activos reales tokenizados (RWA)** sobre **Stellar / Soroban Protocol 28**, pensada para el mercado argentino: financiamiento de producción agropecuaria, warrants, forwards y acciones del Merval.

Repo: [github.com/Erosmart/fractachain](https://github.com/Erosmart/fractachain)  
Contexto: **Argentina Builder Challenge · Stellar**. Código *source-available* (`LICENSE`): se puede mirar, no se puede usar ni redistribuir sin permiso.

La UI habla de sandbox CNV (RG 1150 / Ley 26.831), Caja de Valores y BYMA. Eso es el marco de producto. Lo que está **vivo en testnet** vs lo que es **sandbox JSON** o **maqueta de UI** está más abajo, en la tabla honesta.

---

## 1. Qué es Fractachain

Fractachain es un riel para que un productor o una empresa argentina tokenice un activo real (cosecha, warrant, acciones) y un inversor lo suscriba y, si hay mercado, lo negocie. Todo liquida en **Stellar testnet**.

No es un DEX genérico ni un token suelto. Hay tres productos de negocio (landing `/`) y un cuarto (Merval) en el mismo stack:

| Producto | Qué es | Contrato | Ruta UI |
|---|---|---|---|
| **Licitación** | Oferta primaria. Soft/hard cap, deadline, reembolso si falla. Después puede ir a secundario. | `contracts/fractachain-licitacion` | `/market`, `/orderbook` |
| **Forward** | Compra a futuro de cosecha (granos, vinos, tabaco). Escrow, entrega, disputa, penalidad 20 %, rollover. | `contracts/forward-contract` | `/forwards` |
| **Warrant / lending** | Productor tokeniza stock (Ley 9643) y pide préstamo LTV 40–60 % con oráculo warrantera. | `contracts/warrant-vault` | `/warrants` |
| **Acciones Merval** | tYPF, tGGAL, tPAMP, etc. Custodia 1:1 Caja de Valores, proof of reserve, dividendos. | `contracts/stock-vault` | `/stocks` |

El **happy path del demo** (el que pega chain) es la licitación pagada en **XLM nativo / SAC**, con wallet **custodial** firmada por el backend. El resto del catálogo existe en Rust y, en varios casos, ya tiene instancia en testnet; la pantalla todavía no lo invoca.

---

## 2. Función / qué hace (productor e inversor)

### Productor / emisor

1. Arma un **dossier** (CUIT, ISIN, subcuenta Caja de Valores, registro CNV, caps, TNA, wallet fiduciaria de proceeds).
2. Publica una **licitación** (`DRAFT → DEPLOYED → TOKENS_MINTED → LISTED`).
3. Si la emisión cierra en Successful, el contrato llama `finalize()` y el XLM recaudado va a la wallet **fiduciaria** (`proceedsWallet`, espejo on-chain de `Fiduciary`). No hay un segundo “payout” inventado en la UI.
4. En el modelo de producto también puede:
   - vender producción a futuro (`forward-contract`: escrow, `mark_delivered`, disputa, rollover);
   - pedir crédito contra stock certificado (`warrant-vault`: warrantera acreditada, LTV 40–60 %).

Hoy el productor opera eso desde **Admin → Emisión** (`/admin/issuance`). Forwards y warrants en `/forwards` y `/warrants` son simulador.

### Inversor

1. Se registra (email + password; Google/Firebase opcional; Freighter existe para login, no para el aporte live).
2. Elige custodia: **custodial** (el backend guarda el secreto cifrado con `WALLET_PEPPER`) o **self-custody**.
3. Pasa **KYC** (CUIT + selfie → cola admin). Con `HACKATHON_DEMO=true` el KYC se aprueba solo, para cerrar el loop del pitch.
4. En una licitación **XLM + contrato vivo** aporta con `POST /api/listings/:id/contribute` → `contribute()` on-chain. Gasta XLM de Friendbot. Recibe unidades RWA **en el storage del contrato**, no un asset clásico en Freighter.
5. Si Successful: anota la posición en `/dashboard` (ledger de la plataforma; no hay `claim()` extra en Soroban).
6. Si Failed: `refund()` le devuelve el XLM a la wallet custodial.
7. Secundario: CLOB sandbox (`/api/orderbook/*`) o **Stellar DEX** (`/api/sdex/*`) si el listing tiene emisor `G…` real y `AUTH_REQUIRED`.

Pagos on-chain previstos en la factory: **XLM, USDC, USDT** como SAC. El aporte live del demo es **XLM**. USDC Circle en el dashboard (`usdcOnChain`) sí se lee on-chain; el saldo `cashUsdc` de 50.000 que nace con cada cuenta es **sandbox**.

---

## 3. Problema que resuelve

El productor agropecuario argentino necesita dólares (o un riel líquido) contra la campaña: semilla, fertilizante, flete. El inversor quiere yield con respaldo real, no un token sin custodia.

El circuito tradicional —banco, warrant de almacén, Caja de Valores, eventual listado— es lento, caro para pymes y casi no tiene **secundario**. Tokenizar sin libro de órdenes no sirve: el inversor queda trabado.

Fractachain recorta ese circuito sobre Stellar:

- el expediente (CUIT, ISIN, CNV, Caja) viaja con la emisión;
- el dinero de la oferta queda en un contrato con caps y deadline, no en una planilla;
- si la oferta falla, hay `refund`;
- si funciona, el productor cobra en la fiduciaria y el inversor puede negociar (SDEX nativo o CLOB de demo).

Regulación en pantalla: sandbox CNV RG 1150, Ley 26.831, forwards Art. 1131 CCyC, warrants Ley 9643. Eso es el **diseño legal del producto**, no una habilitación CNV ya obtenida.

---

## 4. Arquitectura (Soroban, backend, frontend, Stellar)

Cuatro capas que conviven. Hasta que exista `deployments/testnet.json` el backend corre en sandbox (JSON en disco). Con ese archivo —**ya está en este clone**— mezcla sandbox (aporte USDC / dividendos de la UI) con **contratos vivos** y **Stellar DEX** para el secundario.

```
Inversor / productor
        │
        ▼
┌───────────────────┐     NEXT_PUBLIC_API_URL      ┌──────────────────────┐
│  Frontend Next 14 │  ─────────────────────────►  │  Backend Express     │
│  :3000            │                              │  :4000               │
│  marketplace, KYC │                              │  cuentas, listings,  │
│  admin, orderbook │                              │  CLOB sandbox, SDEX  │
└───────────────────┘                              └──────────┬───────────┘
                                                              │
                    ┌──────────── Horizon / RPC / Friendbot ──┤
                    │                                         │
                    ▼                                         ▼
         Stellar classic (testnet)                 Soroban (Protocol 28)
         · cuentas G… + XLM                        · issuance-factory
         · USDC Circle (issuer clásico)            · fractachain-licitacion
         · SDEX + AUTH_REQUIRED                    · stock-vault
         · trustlines del token del listing        · forward-contract
                                                   · warrant-vault
```

### Soroban (`contracts/`)

Workspace Cargo, `soroban-sdk = 28.0.0`, target `wasm32v1-none` (no `wasm32-unknown-unknown`). Cada crate de producto tiene tests + snapshots en `test_snapshots/`.

| Crate | Rol |
|---|---|
| `fractachain-core` | Librería. **No se despliega.** TTL (`bump_instance` / `bump_persistent`), cliente SAC, tasas en bps (tope 150 % TNA, 10 años), montos positivos / múltiplos del precio. |
| `issuance-factory` | Registro admin. Tipos Licitación / Forward / Warrant / Stock. Configura SAC de pago (XLM / USDC / USDT), acredita **warranteras** (el productor no puede auto-atestiguar), registra cada instancia. |
| `fractachain-licitacion` | Oferta: `Open → Successful \| Failed \| Terminated`. `contribute`, `finalize`, `refund`, `withdraw_proceeds` (una sola vez, a la fiduciaria). KYC on-chain para **recibir** el token (no para devolverlo). CLOB interno + OPA 50 % / squeeze-out 95 %. Horario hábil ART **solo en pubnet**. |
| `stock-vault` | Acciones 1:1. Admin (custodio) ≠ oráculo PoR. No se mintea más de lo atestiguado ni con PoR vencido (>90 días). Dividendos pro-rata; un holder nuevo no cobra los anteriores. |
| `warrant-vault` | `Deposited → ActiveLoan → Repaid \| Liquidated`. LTV 40–60 %, oferta 30 días, préstamo ≤ 365 días, gracia 15. |
| `forward-contract` | `Active → Fulfilled \| Cancelled`. Productor, comprador y árbitro distintos. Escrow; `mark_delivered` abre 10 días; silencio = aceptación; precancelación 20 %; rollover in-kind hasta 2 veces. |

### Backend (`backend/`)

Express + TypeScript, puerto **4000**. Docker: `backend/Dockerfile`. Persistencia: JSON en `backend/data/` y, si hay `DATABASE_URL`, write-through a Postgres (`kv_store`; restore en `backend/scripts/pg_restore.js` **antes** de arrancar).

```
backend/src/
├── server.ts                 Rutas HTTP
├── auth/                     Cuentas, Google, Firebase, Friendbot, Freighter
├── admin/                    KYC, listings, issuance, testnet
├── market/                   CLOB sandbox, SDEX, precios, dividendos
├── stellar/                  Horizon, Soroban, AUTH_REQUIRED, deploy
├── custody/stocks.ts         Catálogo Merval + auditoría PoR mock
├── mocks/                    On-ramps, oráculos commodities/clima
└── test_runner.ts            `npm test`
```

Puente a chain (cuando el listing es on-chain: `licitacionContract` válido **y** `paymentKind === 'XLM'`):

- `contributeOnChain` → `verify_investor` + `contribute`
- `finalizeOnChain` / `refundOnChain` / `withdrawProceedsOnChain`
- KYC aprobado + `STELLAR_ISSUER_SECRET` → autoriza trustline (`AUTH_REQUIRED`); revocar la apaga. Un fallo de Horizon no bloquea la decisión en base: `/api/admin/compliance/sync`.

### Frontend (`frontend/`)

Next.js 14 App Router, React 18, Tailwind. Puerto **3000**. `output: 'standalone'` para Docker. API: `NEXT_PUBLIC_API_URL` (default `http://localhost:4000`).

| Ruta | Qué muestra |
|---|---|
| `/` | Landing: tres productos, regulación, Merval, calculadora TNA |
| `/market` | Listado de licitaciones (viene de `/api/market/pools`; sin fallback a `MOCK_POOLS`) |
| `/market/[id]` | Ficha / suscripción / finalize / refund |
| `/orderbook` | Secundario: intenta SDEX y cae a sandbox |
| `/dashboard` | Portfolio: `cashUsdc` sandbox + `usdcOnChain` real |
| `/wallet` | Clave pública, XLM, modo de custodia |
| `/forwards` `/warrants` `/stocks` | Maqueta (disclaimer en pantalla) |
| `/login` `/register` `/onboarding/*` | Auth, custodial vs self, KYC |
| `/admin/issuance` `/admin/kyc` `/admin/testnet` | Solo `user.isAdmin` (`ADMIN_EMAILS`) |
| `/admin/opa` | Simulador OPA (holders hardcodeados, no llama al contrato) |

`frontend/src/lib/listings.ts` oculta del listado público `IPO-SOJA-PERGAMINO-2026` (Las Lilas, marcada como ya llena) y `IPO-T02942-mu6ex9gh`. La ficha directa sigue existiendo.

### Stellar (classic + testnet)

Red SDF: Horizon `https://horizon-testnet.stellar.org`, RPC `https://soroban-testnet.stellar.org`, passphrase `Test SDF Network ; September 2015`, Friendbot `https://friendbot.stellar.org`.

Tres cuentas del pipeline (`scripts/testnet/01-keys.sh`):

| Identidad | Rol |
|---|---|
| `fc-deployer` | Admin de contratos |
| `fc-issuer` | Emisor del token clásico (SDEX, `AUTH_REQUIRED`) |
| `fc-por` | Oráculo de proof-of-reserve (tiene que ser distinto del admin) |

USDC de contraparte en SDEX: **USDC clásico de Circle** en testnet, issuer `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` (`STELLAR_USDC_ISSUER`). No es el SAC de `deployments/testnet.json`; SDEX opera assets clásicos.

Explorador de hashes: `https://stellar.expert/explorer/testnet/tx/<hash>` y `/contract/<C…>`.

---

## Mapa del repositorio

```
fractachain/
├── contracts/              Workspace Cargo (Soroban 28, wasm32v1-none)
├── backend/                API Express (:4000)
├── frontend/               Next.js 14 + Tailwind (:3000)
├── scripts/testnet/        01-keys → 02-build → 03-deploy → 04-licitacion-xlm → 05-forward-warrant
├── scripts/agents_lilas.mjs        Agentes demo sobre el API (sandbox USDC)
├── backend/scripts/agents_trade_tuwu.mjs   Agentes que tradean TUWU/USDC en SDEX
├── deployments/testnet.json        IDs públicos (sin secretos S…)
├── RAILWAY_DEPLOY.md       Backend + frontend en Railway
├── RUNBOOK_DEMO_P0.md      Guion pitch Las Lilas
├── RUNBOOK_FINALIZE.md     contribute → finalize / refund
├── HACKATHON.md            Pitch corto Genesis
└── LICENSE
```

`graphify-out/` es análisis de código, no producto. `FRACTAL_CHAIN_ARCHITECTURE.md` / `fractalchain.md` están en `.gitignore`.

`backend/data/listings.json` viaja en git (en este clone arranca `[]`: las licitaciones se crean en runtime / Admin / `deploy_licitacion.ts`). `users.json` y selfies **no** se commitean.

---

## Stack

| Capa | Tech |
|---|---|
| Chain | Stellar Testnet, Soroban 28, Horizon + RPC, Friendbot |
| Contratos | Rust, `soroban-sdk` 28, `no_std`, tests + snapshots |
| API | Node 20, Express, `@stellar/stellar-sdk` ^17, `pg` opcional |
| UI | Next 14.2, React 18, Tailwind, Freighter opcional, Firebase opcional |
| Identidad on-chain | Token clásico `AUTH_REQUIRED` + whitelist Soroban (`verify_investor`) |
| Deploy app | Docker multi-stage `node:20-alpine`, Compose, Railway (dos servicios) |

---

## Cómo correr

Requisitos: Node 20. Contratos: Rust + `wasm32v1-none` + Stellar CLI 28.

```bash
# API
cd backend
cp .env.example .env          # o dejá que scripts/testnet/01-keys.sh lo escriba
npm install
npm run dev                   # :4000

# UI (otra terminal)
cd frontend
cp .env.example .env.local    # NEXT_PUBLIC_API_URL=http://localhost:4000
npm install
npm run dev                   # :3000
```

Igual que Railway, desde la raíz:

```bash
docker compose up --build
```

UI: http://localhost:3000 · API: http://localhost:4000/health

Contratos:

```bash
cd contracts
cargo test
```

Testnet (detalle en `scripts/testnet/README.md`):

```bash
bash scripts/testnet/01-keys.sh    # 3 cuentas + Friendbot + backend/.env
bash scripts/testnet/02-build.sh   # WASM
bash scripts/testnet/03-deploy.sh  # factory, stock, licitación, SACs, AUTH_REQUIRED
bash scripts/testnet/04-licitacion-xlm.sh   # instancia XLM + bind Las Lilas
# opcional
bash scripts/testnet/05-forward-warrant.sh
```

Equivalente Node, desde `backend/`:

```bash
npx ts-node src/stellar/deploy_licitacion.ts
npx ts-node src/stellar/deploy_forward_warrant.ts
```

### Variables (forma original)

Backend (`backend/.env.example`):

```
PORT=4000
ADMIN_EMAILS=erosnahuelp85@gmail.com
HACKATHON_DEMO=true
AUTH_PEPPER=…
WALLET_PEPPER=…
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_FRIENDBOT_URL=https://friendbot.stellar.org
STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
STELLAR_DEPLOYER_SECRET=          # S… de fc-deployer — nunca en git
STELLAR_ISSUER_SECRET=            # S… de fc-issuer
# STELLAR_LICITACION_ADMIN_SECRET=
STELLAR_USDC_CODE=USDC
STELLAR_USDC_ISSUER=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
```

Opcional: `DATABASE_URL` (Postgres), `STELLAR_DEPLOYMENT_FILE`.

Frontend (`frontend/.env.example`):

```
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_STELLAR_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
# NEXT_PUBLIC_FIREBASE_*  (opcional; sin esto anda email + password)
```

`NEXT_PUBLIC_*` se **hornea en el build** del frontend. Cambiar la URL del API implica rebuild. Detalle Railway: `RAILWAY_DEPLOY.md`.

---

## Flujo demo (pitch)

Guion corto; el detalle está en `RUNBOOK_DEMO_P0.md` y `RUNBOOK_FINALIZE.md`.

1. Home → leyenda real / maqueta.
2. Register / login → onboarding wallet **custodial** (no quiz de seed).
3. KYC (auto si `HACKATHON_DEMO=true`).
4. `/market` → ficha de licitación XLM (demo histórico: `IPO-SOJA-PERGAMINO-2026`, Agropecuaria Las Lilas, soja Pergamino). Caps de pitch: **soft = hard = 100 XLM**, precio 10 XLM, mínimo 100. Un ticket cierra el hard cap.
5. **Aportar XLM** → hash `contribute()` en Stellar Expert.
6. **Cerrar licitación (`finalize`)** si hay hard cap o deadline. Successful: el XLM ya está en la fiduciaria. Failed: **Reembolsar XLM**.
7. Portfolio: “Anotar unidades RWA” es ledger de la app; las unidades ya existen en el contrato desde `contribute()`.

Decir en voz alta: pago demo = XLM Friendbot; RWA = unidades en Soroban, no asset Freighter; USDC Circle / forwards / warrants / Merval = maqueta de UI (aunque varios contratos sí están instanciados).

`finalize()` **no** cierra por soft cap solo. Corre con `raised >= hard_cap` **o** `now >= deadline`. Después: ≥ soft cap → Successful y paga fiduciaria; si no → Failed y hay `refund()`. `withdraw_proceeds(admin)` es reintento, no el camino feliz.

---

## Qué está vivo vs mock (honesto)

Criterio en código: un listing es on-chain si `isLiveContractId(licitacionContract)` **y** `dossier.paymentKind === 'XLM'` (`backend/src/admin/listings.ts` → `isOnChainListing`).

| Pieza | Estado real | Dónde |
|---|---|---|
| `contribute` / `finalize` / `refund` de licitación **XLM** con contrato `C…` | **Vivo** (wallet custodial; el backend firma) | `backend/src/stellar/licitacion.ts`, ficha `/market/[id]` |
| Aporte **USDC** desde la UI | **Sandbox JSON** (`cashUsdc`, `listings.json`) | `contributeListing` |
| Trustline `AUTH_REQUIRED` al aprobar KYC | **Vivo** si hay `STELLAR_ISSUER_SECRET` | `backend/src/stellar/compliance.ts`, `sdex.ts` |
| Orderbook SDEX (`/api/sdex/*`) | **Vivo** si el listing tiene issuer `G…` real | `backend/src/market/sdex_book.ts`, `/orderbook` |
| CLOB `/api/orderbook/*` | **Sandbox** (memoria / `orderbook.json`) | demos sin cuentas fondeadas |
| Precio de portfolio | SDEX last/mid → sandbox last → precio IPO (etiquetado) | `backend/src/market/prices.ts` |
| Saldo USDC Circle en dashboard | **Vivo** (Horizon, issuer Circle) | `usdcOnChain` |
| Saldo USDC interno de cuenta nueva | **Sandbox** (50.000) | `cashUsdc` |
| RWA del inversor | Storage del contrato (`get_rwa_balance`); **no** asset clásico LILAS | “Anotar en portfolio” no mueve XLM |
| Freighter `contribute` | **No** está en el happy path | error explícito en `contributeOnChain` |
| Forward UI | **Maqueta** (`MOCK_FORWARDS`); el contrato **sí** tiene instancia testnet | `/forwards` + `LiveContractLink` |
| Warrant UI | **Maqueta** (`MOCK_WARRANTS`); igual, instancia testnet | `/warrants` |
| Acciones Merval `/stocks` | **Catálogo mock** (`custody/stocks.ts`); `stock-vault` está deployado | no mintea 1:1 real |
| OPA `/admin/opa` | **Maqueta** (holders hardcodeados) | el contrato sí tiene `launch_opa` / squeeze-out |
| Dividendos UI | **Sandbox** | `backend/src/market/dividends.ts` |
| `/api/mocks/onramp/ars` | Mock Anclap / Alfred Pay | `backend/src/mocks/payment_gateway.ts` |
| `/api/mocks/onramp/fiat` | Mock MoonPay / Ramp / Banxa | idem |
| `/api/mocks/bridge/cctp` | Mock Circle CCTP → Stellar | idem |
| `/api/mocks/bridge/near-intents` | Mock BTC/ETH/SOL/USDT → USDC | idem |
| `/api/mocks/oracles/commodities` | Mock precios de cultivos | `fiat_oracle.ts` |
| `/api/mocks/oracles/weather` | Mock clima por región | `weather_oracle.ts` |
| Agentes `scripts/agents_lilas.mjs` | API sandbox (listing USDC, CLOB local) | no es Soroban |
| Agentes `backend/scripts/agents_trade_tuwu.mjs` | **Vivo** SDEX `TUWU/USDC` | necesita `STELLAR_ISSUER_SECRET` |
| `HACKATHON_DEMO=true` | KYC auto-aprobado | no es compliance real |
| `listings.json` commiteado | Arranca vacío; Las Lilas se bindea con `deploy_licitacion.ts` | runtime / Postgres en Railway |

`RAILWAY_DEPLOY.md` a veces dice “contratos aún no deployados”. El estado de **este clone** es el de `deployments/testnet.json` (actualizado 2026-09-20): factory, stock, licitación, forward y warrant **sí** tienen ID.

---

## IDs públicos de testnet

Fuente: `deployments/testnet.json` (solo IDs; las `S…` viven en `backend/.env`, gitignored). Red SDF, `updatedAt`: `2026-09-20T11:15:32.485Z`.

| Clave | Valor |
|---|---|
| deployer | `GDUA6DQZJXBPTAQANQXEKXV3VXCPUIP5XQEHDAKJLRAVTXK35ZX2YORW` |
| issuer | `GAGPWEIFYS54Y5WY3WJ6IWXK4YAPSNRVOEWEGBL7W3BKR6YL4VUYE653` |
| porOracle | `GCKR5TWHJG22JUTVVKQBD6R6AKU7WHJL6BZ3FMGSOZ7P5ILJTQN2K6YK` |
| factory | `CDF7VE4JMPQYR6Q76MYFEEG64CZIZLOJLGSUQN5NXTZSP3U5JTWHNJGW` |
| licitacion | `CDHKGEJNNFYKXW4XOEDXXE5LOF5HCYVORR2JT7AOK2FAN5B6I65X7JLM` |
| licitacionLegacy | `CAICUL3NXDWX4S3MDLBMQMBDRUW3WFK5OPXJSSIUYPXRIZCJSNWLZENF` |
| stockVault | `CD3MZ34ER36Z7WR66YIXH6MIYMY4OGFYVN3S5P7NNXGT6DZXVJUBDGL5` |
| forward | `CDAVRDFDCACOHNXXIGQGEDSVDANQ5EJISUPVMSYIDUPWRNEA4JY5AANU` |
| warrant | `CCC4AE7Y6VGEYCPP45Q7EUQGLHFHJNZVUV6GGAPYGMYLEAXYGHOUE2QA` |
| warrantFactory | `CCW62ZX5MG7V5DXTSCZ6T4GZNZAQQPCWCZVI224YEZM7HTSM2CFATQFO` |
| usdcSac | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |
| xlmSac | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| USDC classic | `USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` |
| licitacionWasmHash | `2555e1ab8c9d1b2240be6ba8647416f6316ccd0091654eb5aef91b49f9edd536` |
| forwardWasmHash | `f2285f579c057fd1fc1bb4882d3faf1906cd57f4f708ce53d2ea2455c4870ec7` |
| warrantWasmHash | `1acbd30e15406d8f6243a0d838cb1a441ee12015911e4e8158e8aec4e5e25906` |

Health del API: `GET /health` (`onChain: true` si `factory` empieza con `C`). Estado vivo: `GET /api/onchain/status`.

---

## Enlaces

| Qué | URL / path |
|---|---|
| Repo | https://github.com/Erosmart/fractachain |
| Horizon testnet | https://horizon-testnet.stellar.org |
| Soroban RPC | https://soroban-testnet.stellar.org |
| Friendbot | https://friendbot.stellar.org |
| Stellar Expert (testnet) | https://stellar.expert/explorer/testnet |
| Factory | https://stellar.expert/explorer/testnet/contract/CDF7VE4JMPQYR6Q76MYFEEG64CZIZLOJLGSUQN5NXTZSP3U5JTWHNJGW |
| Licitación (Las Lilas XLM) | https://stellar.expert/explorer/testnet/contract/CDHKGEJNNFYKXW4XOEDXXE5LOF5HCYVORR2JT7AOK2FAN5B6I65X7JLM |
| Stock vault | https://stellar.expert/explorer/testnet/contract/CD3MZ34ER36Z7WR66YIXH6MIYMY4OGFYVN3S5P7NNXGT6DZXVJUBDGL5 |
| Forward | https://stellar.expert/explorer/testnet/contract/CDAVRDFDCACOHNXXIGQGEDSVDANQ5EJISUPVMSYIDUPWRNEA4JY5AANU |
| Warrant | https://stellar.expert/explorer/testnet/contract/CCC4AE7Y6VGEYCPP45Q7EUQGLHFHJNZVUV6GGAPYGMYLEAXYGHOUE2QA |
| Deploy app | `RAILWAY_DEPLOY.md` |
| Pipeline testnet | `scripts/testnet/README.md` |
| Pitch corto | `HACKATHON.md` |
| Guion demo | `RUNBOOK_DEMO_P0.md` · `RUNBOOK_FINALIZE.md` |

Local: UI http://localhost:3000 · API http://localhost:4000.
