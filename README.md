# Fractachain — qué hay en este repo

Plataforma de **activos reales tokenizados (RWA)** sobre **Stellar / Soroban Protocol 28**, pensada para el mercado argentino: financiamiento de producción agropecuaria, warrants, forwards y acciones del Merval.

El código está publicado como *source-available* (ver `LICENSE`): se puede mirar, no se puede usar ni redistribuir sin permiso.

Contexto de producto: **Argentina Builder Challenge · Stellar**. La UI habla de sandbox CNV (RG 1150 / Ley 26.831), Caja de Valores y BYMA.

---

## En una frase

Hay **cuatro capas** que conviven:

1. **Contratos Soroban** (Rust) — las reglas on-chain.
2. **Backend Express** (TypeScript) — KYC, cuentas, listings, orderbook sandbox y puente a Horizon/SDEX.
3. **Frontend Next.js 14** — marketplace, onboarding, admin.
4. **Scripts de testnet** — Friendbot, WASM, deploy e IDs públicos en `deployments/testnet.json`.

Hasta que exista `deployments/testnet.json`, el backend corre en **sandbox** (JSON en disco). Con ese archivo cargado, mezcla sandbox (aporte primario / dividendos de la UI) con **contratos vivos** y **Stellar DEX** para el secundario.

---

## Mapa del repositorio

```
fractachain/
├── contracts/              Workspace Cargo (Soroban 28, target wasm32v1-none)
│   ├── fractachain-core/   Librería compartida (no es un contrato desplegable)
│   ├── issuance-factory/   Registro de productos, SACs y warranteras
│   ├── fractachain-licitacion/  Oferta primaria + KYC + CLOB + OPA
│   ├── stock-vault/        Acciones 1:1 + PoR + dividendos
│   ├── warrant-vault/      Préstamo contra warrant (Ley 9643)
│   └── forward-contract/   Forward de cosecha (Art. 1131 CCyC)
├── backend/                API Express (puerto 4000)
├── frontend/               Next.js 14 + Tailwind (puerto 3000)
├── scripts/testnet/        01-keys → 02-build → 03-deploy
├── deployments/            IDs públicos de testnet (sin secretos)
├── graphify-out/           Grafo de código generado (no es producto)
├── RAILWAY_DEPLOY.md       Cómo subir backend + frontend a Railway
└── LICENSE
```

No hay README de raíz original: este archivo es el mapa.

---

## Productos de negocio

Tres puertas al mismo riel Stellar (landing `/`):

| Producto | Qué es | Contrato | Ruta UI |
|---|---|---|---|
| **Licitación** | Oferta primaria en USDC/XLM/USDT. Soft/hard cap, deadline, reembolso si falla. Después se negocia en secundario. | `fractachain-licitacion` | `/market`, `/orderbook` |
| **Forward** | Compra a futuro de cosecha (granos, vinos, tabaco). Escrow, entrega, disputa, penalidad 20%, rollover. | `forward-contract` | `/forwards` |
| **Warrant / lending** | Productor tokeniza stock (Ley 9643), pide préstamo LTV 40–60% con oráculo warrantera. | `warrant-vault` | `/warrants` |
| **Acciones Merval** | tYPF, tGGAL, tPAMP, etc. Custodia 1:1 Caja de Valores, proof of reserve, dividendos en USDC. | `stock-vault` | `/stocks` |

Pagos on-chain: **XLM, USDC, USDT** como SAC (Stellar Asset Contract) registrados en la factory.

---

## Contratos Soroban (`contracts/`)

Workspace en `contracts/Cargo.toml`. SDK `soroban-sdk = 28.0.0`. El WASM se construye para `wasm32v1-none` (no `wasm32-unknown-unknown`). Cada crate de producto tiene tests + snapshots en `test_snapshots/`.

### `fractachain-core`

No se despliega. Utilidades compartidas:

- TTL de storage (`bump_instance`, `bump_persistent`)
- Cliente de token SAC
- Tasas en basis points, interés prorrateado por días (tope 150% TNA, 10 años)
- Chequeos de montos positivos / múltiplos del precio unitario

### `issuance-factory`

Registro admin. Tipos de producto: Licitación, Forward, Warrant, Stock.

- Configura los SAC de pago (XLM / USDC / USDT)
- Acredita o revoca **warranteras** (quien atestigua colateral; el productor no puede auto-atestiguar)
- Registra cada instancia de producto con precio y token
- Detecta si rotaron un SAC y el producto quedó pinneado al viejo

### `fractachain-licitacion`

El contrato más grande. Módulos internos:

- `lib.rs` — ciclo de vida de la oferta (`Open → Successful | Failed | Terminated`)
- `kyc.rs` — whitelist on-chain (tipo de inversor, vencimiento, lista GAFI, horario hábil ART **solo en pubnet**)
- `orderbook.rs` — órdenes de venta con RWA en escrow
- `opa.rs` — umbral 50% dispara OPA (Art. 87); 95% squeeze-out (Art. 88)

Funciones clave: `contribute`, `finalize`, `refund`, `withdraw_proceeds` (una sola vez, a la cuenta fiduciaria), `place_order` / `fill_order`, `launch_opa` / `accept_opa` / `execute_squeeze_out`.

Regla de KYC: hace falta estar verificado para **recibir** el token, no para devolverlo (reembolso, squeeze-out). En el lado clásico de Stellar el mismo recorte lo da `AUTH_REQUIRED` en el emisor.

### `stock-vault`

Acciones tokenizadas 1:1.

- Admin (custodio) ≠ oráculo de proof-of-reserve
- No se puede mintear más de lo atestiguado, ni con PoR vencido (>90 días)
- Cada mint deja prueba `(recipient, amount, cv_deposit_hash)`
- Dividendos pro-rata con acumulador; un holder nuevo no cobra dividendos anteriores
- `sweep_unallocated` no puede tocar lo ya adeudado a holders

### `warrant-vault`

Estados: `Deposited → ActiveLoan → Repaid | Liquidated`.

- LTV 40–60%, oferta financiable 30 días, préstamo hasta 365 días, gracia 15 días
- `fund_loan` / `repay_loan` / `execute_liquidation`
- Si hay sobrante post-liquidación, queda registrado para el productor

En el pipeline de testnet este WASM **se sube (hash)** pero **no se instancia**: hace falta productor, lender y warrantera reales.

### `forward-contract`

Estados: `Active → Fulfilled | Cancelled`.

- Productor, comprador y árbitro tienen que ser cuentas distintas
- Escrow del precio; `mark_delivered` abre 10 días para aceptar o disputar
- Silencio = aceptación; disputa la resuelve el árbitro
- Precancelación: penalidad 20% al productor
- No entrega: reembolso al comprador; rollover in-kind hasta 2 veces (+ kg extra)

Igual que warrant: en testnet solo se publica el hash WASM.

---

## Backend (`backend/`)

Express + TypeScript. Puerto **4000**. Pensado para Railway (`backend/Dockerfile`).

```
backend/src/
├── server.ts                 Todas las rutas HTTP
├── auth/                     Cuentas, Google, Firebase, Friendbot
├── admin/                    KYC, listings, issuance, testnet
├── market/                   Orderbook sandbox, SDEX, precios, dividendos
├── stellar/                  Horizon, AUTH_REQUIRED, deploy JSON
├── custody/stocks.ts         Catálogo Merval + auditoría PoR mock
├── mocks/                    On-ramps, oráculos commodities/clima
└── test_runner.ts            Suite rápida `npm test`
```

Datos locales (gitignored en runtime real): `backend/data/users.json`, `selfies/`, `listings.json`, `orderbook.json`, `testnet.json`.

### Auth y onboarding

- Email + password, Google mock, Firebase
- Wallet **custodial** (el backend guarda el secreto cifrado con `WALLET_PEPPER`) o **self-custody**
- Friendbot fondea XLM en testnet
- KYC in-app (CUIT, selfie) → cola admin → `APPROVED | REJECTED | REVOKED`
- Admin = emails en `ADMIN_EMAILS`

### Listings (emisión)

Ciclo sandbox: `DRAFT → DEPLOYED → TOKENS_MINTED → LISTED → CLOSED_SUCCESS | CLOSED_FAILED`.

El dossier de la empresa incluye CUIT, ISIN, subcuenta Caja de Valores, registro CNV, caps, TNA, wallet de proceeds (espejo del `Fiduciary` on-chain).

### Mercado

- `/api/orderbook/*` — CLOB **en memoria/JSON** para demos sin cuentas fondeadas
- `/api/sdex/*` — libro real de Stellar DEX; wallets self-custody firman XDR, custodiales firman en el server
- Contraparte típica: **USDC clásico de Circle** en testnet (`GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`)

### Compliance on-chain

Si hay `STELLAR_ISSUER_SECRET`, aprobar KYC autoriza la trustline (`AUTH_REQUIRED`). Revocar la apaga. Un fallo de Horizon no bloquea la decisión en base: se reintenta con `/api/admin/compliance/sync`.

### Mocks (no son rieles reales)

| Endpoint | Simula |
|---|---|
| `/api/mocks/onramp/ars` | Anclap / Alfred Pay (ARS → USDC) |
| `/api/mocks/onramp/fiat` | MoonPay / Ramp / Banxa |
| `/api/mocks/bridge/cctp` | Circle CCTP → Stellar |
| `/api/mocks/bridge/near-intents` | BTC/ETH/SOL/USDT → USDC |
| `/api/mocks/oracles/commodities` | Precios de cultivos |
| `/api/mocks/oracles/weather` | Clima por región |

### Qué **no** cablea todavía el backend

El README de testnet lo dice explícito: `contribute` y `deposit_dividends` de la UI **siguen siendo sandbox**. Los contratos están vivos para CLI o un siguiente cable; la suscripción primaria de la app no invoca Soroban todavía.

---

## Frontend (`frontend/`)

Next.js 14 App Router, React 18, Tailwind. Puerto **3000**. `output: 'standalone'` para Docker.

API: `NEXT_PUBLIC_API_URL` (default `http://localhost:4000`). Login Google opcional vía Firebase; sin Firebase anda email + password.

### Rutas públicas / inversor

| Ruta | Qué muestra |
|---|---|
| `/` | Landing: hero, tres productos, regulación CNV/Caja, logos Merval, calculadora TNA |
| `/market` | Listado de licitaciones |
| `/market/[id]` | Detalle de pool / suscripción |
| `/stocks` | Acciones tokenizadas + PoR |
| `/orderbook` | Mercado secundario (sandbox o SDEX) |
| `/forwards` | Forwards de cosecha |
| `/warrants` | Lending contra warrant |
| `/dashboard` | Portfolio |
| `/wallet` | Clave pública, XLM, modo de custodia |
| `/login` `/register` | Auth |
| `/onboarding/wallet` | Elegir custodial vs self |
| `/onboarding/kyc` | Cargar datos + selfie |
| `/onboarding/pending` | Esperando aprobación |

### Admin (solo `user.isAdmin`)

| Ruta | Qué hace |
|---|---|
| `/admin/issuance` | Activos de pago, productos, dossier de listing, mint, licitacion, close |
| `/admin/kyc` | Aprobar / rechazar / revocar |
| `/admin/testnet` | Modo `local` / `faucet` / `deploy` |
| `/admin/opa` | Ofertas públicas de adquisición |

Componentes de marca en `frontend/src/components/` (Navbar, gates de KYC/admin, banners de liquidez y contratos). Scripts auxiliares: `logo-upload-server.js`, `brands-upload-server.js`.

---

## Testnet (`scripts/testnet/` + `deployments/`)

Pipeline documentado en `scripts/testnet/README.md`:

```bash
bash scripts/testnet/01-keys.sh    # 3 cuentas + Friendbot + backend/.env
bash scripts/testnet/02-build.sh   # WASM
bash scripts/testnet/03-deploy.sh  # factory, stock, licitación, SACs, AUTH_REQUIRED
```

Cuentas:

- `fc-deployer` — admin de contratos
- `fc-issuer` — emisor del token clásico (SDEX)
- `fc-por` — oráculo de proof-of-reserve (tiene que ser distinto del admin)

`deployments/testnet.json` guarda solo IDs públicos (factory, stock vault, licitación, SAC USDC/XLM, hashes WASM de forward/warrant). Los secretos `S…` quedan en `backend/.env` (gitignored).

El archivo actual del clone ya tiene un deploy de testnet (red SDF, actualizado 2026-09-18).

---

## Deploy de la app (`RAILWAY_DEPLOY.md`)

Dos servicios desde el mismo repo:

| Servicio | Root | Build | Start |
|---|---|---|---|
| Backend | `backend/` | `npm run build` | `npm start` (Express) |
| Frontend | `frontend/` | `npm run build` | `npm start` (Next) |

Hay Dockerfiles multi-stage `node:20-alpine` en ambos.

---

## Cómo levantar en local

Requisitos: Node 20, y para contratos Rust + `wasm32v1-none` + Stellar CLI 28.

```bash
# API
cd backend
cp .env.example .env          # o dejá que 01-keys.sh lo escriba
npm install
npm run dev                   # :4000

# UI (otra terminal)
cd frontend
cp .env.example .env.local    # NEXT_PUBLIC_API_URL=http://localhost:4000
npm install
npm run dev                   # :3000
```

Contratos:

```bash
cd contracts
cargo test
```

---

## Qué es y qué no es cada carpeta extra

| Path | Rol |
|---|---|
| `graphify-out/` | Análisis/grafo del código (HTML, JSON, reportes). No corre en producción. |
| `backend/data/*.json` | Estado demo (listings, orderbook). Usuarios y selfies no se commitean. |
| `deployments/wasm/` | Artefactos de build; gitignored. |
| `FRACTAL_CHAIN_ARCHITECTURE.md` / `fractalchain.md` | Nombres reservados en `.gitignore`; no se publican. |

---

## Stack rápido

| Capa | Tech |
|---|---|
| Chain | Stellar Testnet, Soroban 28, Horizon + RPC |
| Contratos | Rust, `soroban-sdk` 28, `no_std` |
| API | Node, Express, `@stellar/stellar-sdk` 13 |
| UI | Next 14, React 18, Tailwind, Firebase opcional |
| Identidad on-chain | Token clásico `AUTH_REQUIRED` + whitelist Soroban |
| Custodia acciones | Modelo 1:1 Caja de Valores + oráculo PoR separado |

---

## Limitaciones actuales (útiles para no perderse)

1. **Primario de la UI = sandbox.** Aportar USDC desde `/market` no llama `contribute` on-chain todavía.
2. **Forward y warrant** están compilados y hasheados; no hay instancias demo.
3. **On-ramps, CCTP, NEAR Intents y oráculos** son mocks.
4. **Licencia restrictiva.** Mirar ≠ poder forkear o comercializar.
5. `RAILWAY_DEPLOY.md` habla de “4 contratos listos en WASM y aún no deployados”; el estado real del clone **sí** tiene factory/stock/licitación en testnet vía `deployments/testnet.json`. Esa guía quedó parcialmente desactualizada.
