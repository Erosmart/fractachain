# Fractachain

[![Stellar](https://img.shields.io/badge/Stellar-7B61FF?style=flat&logo=stellar&logoColor=white)](https://stellar.org)
[![Soroban](https://img.shields.io/badge/Soroban_28-000000?style=flat&logo=rust&logoColor=white)](https://soroban.stellar.org)
[![Next.js](https://img.shields.io/badge/Next.js_14-000000?style=flat&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org)

El primer mercado regulado de Activos del Mundo Real (RWA), sobre Stellar / Soroban 28: financiamiento para empresas y productores, warrants, forwards y acciones del Merval.

[github.com/Erosmart/fractachain](https://github.com/Erosmart/fractachain) · Argentina Builder Challenge · Stellar. Código source-available (`LICENSE`).

La home (`/`) es el pitch. Este README dice qué de eso corre de verdad en testnet. Pitch completo: [`pitch/`](pitch/README.md).

---

## 0. Visión

Queremos ser el primer mercado regulado de Activos del Mundo Real. La solución se centra en darles a empresas y productores acceso a financiamiento —emitir un título de deuda o vender sus acciones en el mercado— a un costo mucho más bajo que en el mercado tradicional.

Soluciones de tokenización puede haber muchas, pero tokenización sin un mercado con liquidez no sirve. Con las herramientas de on-ramping y off-ramping que ya funcionan en Stellar, las empresas quedan expuestas a inversores de más de 90 países bajo el mismo marco jurídico que un inversor en Argentina, con operación y liquidez inmediata las 24 horas.

Aplicaciones de RWA puede haber miles, pero si son cerradas, donde solo comercia un grupo chico, es lo mismo de siempre. En FractaChain, cuando una empresa hace su oferta pública de acciones pueden participar todos: desde inversores pequeños hasta grandes instituciones financieras.

La regulación actual ya permite lo anterior, y sería un orgullo ser el puente que conecte la economía de Argentina con el capital financiero global: que las empresas comercien sus materias primas, que se compren y vendan acciones del mercado tradicional las 24 horas, y que instituciones e inversores minoristas puedan hacer carry trade con la misma facilidad.

En definitiva, llevar lo mejor del mercado tradicional (seguridad jurídica, custodia y reglas claras) a las finanzas descentralizadas: acceso global, liquidez inmediata y bajos costos. No es una idea a futuro: es lo que ya estamos construyendo en Stellar.

---

## 1. Qué es

Un productor o una empresa tokeniza un activo real (cosecha, warrant, acciones). Un inversor lo suscribe y, si hay mercado, lo negocia. Todo liquida en Stellar testnet. No es un DEX genérico ni un token suelto.

| En la home | Qué hace | Contrato | UI |
|---|---|---|---|
| Inversión | Oferta primaria: caps, deadline, reembolso si falla | `fractachain-licitacion` | `/market` |
| Consumo | Compra a futuro de cosecha (escrow, entrega, disputa) | `forward-contract` | `/forwards` |
| Lending | Crédito LTV 40–60 % contra stock certificado | `warrant-vault` | `/warrants` |
| Merval | Acciones 1:1 (tYPF, tGGAL…) + proof of reserve | `stock-vault` | `/stocks` |

El demo que pega chain es la licitación pagada en XLM (SAC), con wallet custodial firmada por el backend. El resto de los contratos está en Rust y varios ya tienen instancia en testnet. Esas pantallas no los invocan.

---

## 2. Función

**Productor.** Arma un dossier (CUIT, ISIN, CNV, caps, TNA, wallet fiduciaria) y publica la licitación. Si cierra Successful, `finalize()` manda el XLM a la fiduciaria. Hoy eso se opera desde Admin → Emisión. Forwards y warrants en la UI son simulador.

**Inversor.** Se registra (email; Google/Firebase y Freighter opcionales), elige custodia, pasa KYC y aporta con `contribute()` on-chain. Recibe unidades RWA en el storage del contrato, no un asset clásico en Freighter. Si la oferta falla, `refund()` le devuelve el XLM. Secundario: CLOB sandbox o Stellar DEX si el listing tiene emisor `G…` real.

Pago live del demo = XLM (Friendbot). El USDC Circle del dashboard (`usdcOnChain`) se lee on-chain. Los 50.000 `cashUsdc` de cada cuenta nueva son sandbox. Con `HACKATHON_DEMO=true` el KYC se aprueba solo.

La home también ofrece pesos por Alfred Pay, MoneyGram, USDC directo y Cosmos Pay. Esos on-ramps son mock. En forwards, warrants y Merval el cartel de maqueta todavía dice "aporte en USDC". El aporte que pega chain es XLM.

---

## 3. Problema

El productor agropecuario necesita liquidez contra la campaña (semilla, fertilizante, flete). El inversor quiere yield con respaldo real. El circuito banco / warrant / Caja de Valores es lento, caro para pymes y casi no tiene secundario.

Fractachain recorta eso sobre Stellar: el expediente viaja con la emisión, el dinero queda en un contrato con caps y deadline, hay `refund` si falla, y si cierra el productor cobra en la fiduciaria y el inversor puede negociar.

La home lo presenta como marco ya vigente: "100% regulado", "opera bajo el sandbox de la CNV", RG 1150 / Ley 26.831, forwards Art. 1131 CCyC y warrants Ley 9643. Es el diseño legal del producto, no una habilitación obtenida. El badge de la home dice Stellar Protocolo 27. Los contratos de este repo compilan con soroban-sdk 28.0.0.

---

## 4. Arquitectura

Inversor / productor → Next.js 14 (:3000) → Express (:4000) → Stellar classic (testnet: cuentas G…, XLM, SDEX, USDC Circle) y Soroban 28 (factory, licitación, stock, forward, warrant).

- Contratos (`contracts/`): workspace Cargo, soroban-sdk 28.0.0, target `wasm32v1-none`. `issuance-factory` registra cada instancia. `fractachain-core` es librería y no se despliega.
- Backend (`backend/`): Express + TypeScript. JSON en `backend/data/`. Postgres write-through si hay `DATABASE_URL`. Firma `contribute` / `finalize` / `refund` cuando el listing es on-chain (contrato `C…` y pago XLM).
- Frontend (`frontend/`): Next 14 App Router, React 18, Tailwind. Marketplace, KYC, admin, orderbook. Forwards, warrants, stocks y OPA son maqueta, con disclaimer en esas pantallas.

IDs públicos (sin secretos): `deployments/testnet.json`. Pipeline: `scripts/testnet/`. App: `RAILWAY_DEPLOY.md`.

---

## Stack

| Capa | Tech |
|---|---|
| Contratos | Rust 2021, soroban-sdk 28.0.0, `wasm32v1-none` |
| Red | Stellar testnet, Horizon + Soroban RPC, Friendbot, SDEX |
| Tokens | SAC XLM / USDC; USDC clásico Circle (`GBBD47IF…FLA5`) para SDEX |
| API | Node 20, Express 4.19, TypeScript, `@stellar/stellar-sdk` ^17.1, `pg` opcional |
| UI | Next.js 14.2.5, React 18.3, Tailwind 3.4, Freighter API ^6 y Firebase ^12 (opcionales) |
| Deploy | Docker `node:20-alpine` (`output: 'standalone'`), Compose, Railway (2 servicios) |

---

## Vivo vs mock

On-chain = contrato `C…` válido y `paymentKind === 'XLM'`.

| Pieza | Estado |
|---|---|
| `contribute` / `finalize` / `refund` (licitación XLM, custodial) | Vivo |
| Trustline `AUTH_REQUIRED` al aprobar KYC | Vivo (si hay `STELLAR_ISSUER_SECRET`) |
| Orderbook SDEX | Vivo si el listing tiene issuer `G…` |
| USDC Circle en dashboard (`usdcOnChain`) | Vivo (Horizon) |
| Aporte USDC de la UI, CLOB, `cashUsdc` 50.000, dividendos | Sandbox |
| `/forwards` `/warrants` `/stocks` `/admin/opa` | Maqueta UI (contratos sí están en testnet) |
| On-ramps de la home (Alfred Pay, MoneyGram, Cosmos Pay, CCTP, Near Intents, oráculos) | Mocks (`backend/src/mocks/`) |
| Freighter para aportar | Fuera del happy path |
| `HACKATHON_DEMO=true` | KYC auto. No es compliance real |

### IDs de contrato en testnet

Los `C…` de abajo son los **contract IDs** de los contratos Soroban desplegados en Stellar testnet, tal como quedan en `deployments/testnet.json`. Son instancias compartidas del proyecto: no se deploya un contrato por empresa, así que todos los listings de `backend/data/listings.json` referencian el mismo `stockContract` (`stockVault`) y la misma `licitacionContract` (`licitacion`).

Que el listing tenga un contract ID no significa que opere on-chain: el backend solo invoca al contrato cuando el ID es válido **y** el listing paga en XLM (`isOnChainListing` en `backend/src/admin/listings.ts`). Con `paymentKind: 'USDC'` los montos (`raisedUsdc`, `tokensMinted`, `cvDepositHash`) son sandbox del backend, no estado del contrato.

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
