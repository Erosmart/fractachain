# Fractachain

Riel de **activos reales tokenizados (RWA)** sobre **Stellar / Soroban 28**, pensado para Argentina: financiamiento agropecuario, warrants, forwards y acciones del Merval.

[github.com/Erosmart/fractachain](https://github.com/Erosmart/fractachain) · **Argentina Builder Challenge · Stellar**. Código *source-available* (`LICENSE`).

---

## 1. Qué es

Un productor o una empresa tokeniza un activo real (cosecha, warrant, acciones). Un inversor lo suscribe y, si hay mercado, lo negocia. Todo liquida en **Stellar testnet**. No es un DEX genérico ni un token suelto.

| Producto | Qué hace | Contrato | UI |
|---|---|---|---|
| **Licitación** | Oferta primaria: caps, deadline, reembolso si falla | `fractachain-licitacion` | `/market` |
| **Forward** | Compra a futuro de cosecha (escrow, entrega, disputa) | `forward-contract` | `/forwards` |
| **Warrant** | Crédito LTV 40–60 % contra stock certificado | `warrant-vault` | `/warrants` |
| **Merval** | Acciones 1:1 (tYPF, tGGAL…) + proof of reserve | `stock-vault` | `/stocks` |

El **demo que pega chain** es la licitación pagada en **XLM (SAC)**, con wallet **custodial** firmada por el backend. El resto de contratos está en Rust y varios ya tienen instancia en testnet; la pantalla todavía no los invoca.

---

## 2. Función

**Productor.** Arma un dossier (CUIT, ISIN, CNV, caps, TNA, wallet fiduciaria) y publica la licitación. Si cierra Successful, `finalize()` manda el XLM a la fiduciaria. Hoy eso se opera desde **Admin → Emisión**. Forwards y warrants en la UI son simulador.

**Inversor.** Se registra (email; Google/Firebase y Freighter opcionales), elige custodia, pasa KYC y aporta con `contribute()` on-chain. Recibe unidades RWA **en el storage del contrato**, no un asset clásico en Freighter. Si la oferta falla, `refund()` le devuelve el XLM. Secundario: CLOB sandbox o **Stellar DEX** si el listing tiene emisor `G…` real.

Pago live del demo = **XLM** (Friendbot). El USDC Circle del dashboard (`usdcOnChain`) se lee on-chain; los 50.000 `cashUsdc` de cada cuenta nueva son sandbox. Con `HACKATHON_DEMO=true` el KYC se aprueba solo.

---

## 3. Problema

El productor agropecuario necesita liquidez contra la campaña (semilla, fertilizante, flete). El inversor quiere yield con respaldo real. El circuito banco / warrant / Caja de Valores es lento, caro para pymes y casi no tiene **secundario**.

Fractachain recorta eso sobre Stellar: el expediente viaja con la emisión, el dinero queda en un contrato con caps y deadline, hay `refund` si falla, y si cierra el productor cobra en la fiduciaria y el inversor puede negociar.

La UI cita sandbox CNV (RG 1150 / Ley 26.831), forwards Art. 1131 CCyC y warrants Ley 9643: es el **diseño legal del producto**, no una habilitación ya obtenida.

---

## 4. Arquitectura

```
Inversor / productor
        │
        ▼
 Next.js 14 (:3000)  ──API──►  Express (:4000)
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
         Stellar classic (testnet)     Soroban Protocol 28
         cuentas G…, XLM, SDEX         factory, licitación,
         USDC Circle, AUTH_REQUIRED    stock / forward / warrant
```

- **Contratos** (`contracts/`): workspace Cargo, `soroban-sdk` 28.0.0, target `wasm32v1-none`. `issuance-factory` registra cada instancia; `fractachain-core` es librería (no se despliega).
- **Backend** (`backend/`): Express + TypeScript. JSON en `backend/data/`; Postgres write-through si hay `DATABASE_URL`. Firma `contribute` / `finalize` / `refund` cuando el listing es on-chain (contrato `C…` **y** pago XLM).
- **Frontend** (`frontend/`): Next 14 App Router, React 18, Tailwind. Marketplace, KYC, admin, orderbook. Forwards / warrants / stocks / OPA son maqueta (disclaimer en pantalla).

IDs públicos (sin secretos): `deployments/testnet.json`. Pipeline: `scripts/testnet/`. App: `RAILWAY_DEPLOY.md`.

---

## Stack

Lo que está en `package.json` / `Cargo.toml` de este repo:

| Capa | Tech |
|---|---|
| Contratos | Rust 2021, **soroban-sdk 28.0.0**, `wasm32v1-none` |
| Red | Stellar **testnet**, Horizon + Soroban RPC, Friendbot, SDEX |
| Tokens | SAC XLM / USDC; USDC clásico Circle (`GBBD47IF…FLA5`) para SDEX |
| API | **Node 20**, Express **4.19**, TypeScript, `@stellar/stellar-sdk` **^17.1**, `pg` opcional |
| UI | Next.js **14.2.5**, React **18.3**, Tailwind **3.4**, Freighter API ^6 y Firebase ^12 (opcionales) |
| Deploy | Docker `node:20-alpine` (`output: 'standalone'`), Compose, Railway (2 servicios) |

---

## Vivo vs mock

On-chain = contrato `C…` válido **y** `paymentKind === 'XLM'`.

| Pieza | Estado |
|---|---|
| `contribute` / `finalize` / `refund` (licitación XLM, custodial) | **Vivo** |
| Trustline `AUTH_REQUIRED` al aprobar KYC | **Vivo** (si hay `STELLAR_ISSUER_SECRET`) |
| Orderbook SDEX | **Vivo** si el listing tiene issuer `G…` |
| USDC Circle en dashboard (`usdcOnChain`) | **Vivo** (Horizon) |
| Aporte USDC de la UI, CLOB, `cashUsdc` 50.000, dividendos | **Sandbox** |
| `/forwards` `/warrants` `/stocks` `/admin/opa` | **Maqueta UI** (contratos sí están en testnet) |
| On-ramps, CCTP, Near Intents, oráculos | **Mocks** (`backend/src/mocks/`) |
| Freighter para aportar | **No** está en el happy path |
| `HACKATHON_DEMO=true` | KYC auto — no es compliance real |

Testnet (2026-09-20): [factory](https://stellar.expert/explorer/testnet/contract/CDF7VE4JMPQYR6Q76MYFEEG64CZIZLOJLGSUQN5NXTZSP3U5JTWHNJGW) · [licitación](https://stellar.expert/explorer/testnet/contract/CDHKGEJNNFYKXW4XOEDXXE5LOF5HCYVORR2JT7AOK2FAN5B6I65X7JLM) · [stock](https://stellar.expert/explorer/testnet/contract/CD3MZ34ER36Z7WR66YIXH6MIYMY4OGFYVN3S5P7NNXGT6DZXVJUBDGL5) · [forward](https://stellar.expert/explorer/testnet/contract/CDAVRDFDCACOHNXXIGQGEDSVDANQ5EJISUPVMSYIDUPWRNEA4JY5AANU) · [warrant](https://stellar.expert/explorer/testnet/contract/CCC4AE7Y6VGEYCPP45Q7EUQGLHFHJNZVUV6GGAPYGMYLEAXYGHOUE2QA).

Pitch en 5 pasos: register → wallet custodial → KYC → `/market` aportar XLM (`contribute`) → `finalize` / `refund`. Guion: `HACKATHON.md`, `RUNBOOK_DEMO_P0.md`.

---

## Correr

Node 20. Contratos: Rust + `wasm32v1-none`.

```bash
cd backend && cp .env.example .env && npm i && npm run dev          # :4000
cd frontend && cp .env.example .env.local && npm i && npm run dev   # :3000
# o: docker compose up --build
```

`cd contracts && cargo test` · pipeline testnet: `scripts/testnet/README.md` · pitch: `HACKATHON.md` · demo: `RUNBOOK_DEMO_P0.md`.
