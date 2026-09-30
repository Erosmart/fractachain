# Fractachain

[![Stellar](https://img.shields.io/badge/Stellar-7B61FF?style=flat&logo=stellar&logoColor=white)](https://stellar.org)
[![Soroban](https://img.shields.io/badge/Soroban_28-000000?style=flat&logo=rust&logoColor=white)](https://soroban.stellar.org)
[![Next.js](https://img.shields.io/badge/Next.js_14-000000?style=flat&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org)

El primer mercado regulado de Activos del Mundo Real (RWA), sobre Stellar / Soroban 28: licitación de acciones para empresas y productores, con negociación en el mercado secundario.

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

Una empresa o un productor tokeniza sus acciones y las ofrece en licitación. Un inversor las suscribe y, si hay mercado, las negocia. Todo liquida en Stellar testnet. No es un DEX genérico ni un token suelto.

| En la home | Qué hace | Contrato | UI |
|---|---|---|---|
| Inversión | Oferta primaria: caps, deadline, reembolso si falla | `fractachain-licitacion` | `/market` |
| Secundario | Orderbook entre inversores sobre el Stellar DEX | SDEX nativo | `/orderbook` |

El demo que pega chain es la licitación pagada en USDC de plataforma (SAC del issuer `GCASKV…`), con wallet custodial firmada por el backend.

---

## 2. Función

**Productor.** Arma un dossier (CUIT, ISIN, CNV, caps, TNA, wallet fiduciaria) y publica la licitación. Si cierra Successful, `finalize()` manda los USDC a la fiduciaria. Hoy eso se opera desde Admin → Emisión.

**Inversor.** Se registra (email; Google/Firebase y Freighter opcionales), elige custodia, pasa KYC y aporta con `contribute()` on-chain. Recibe unidades RWA en el storage del contrato, no un asset clásico en Freighter. Si la oferta falla, `refund()` le devuelve los USDC. Secundario: CLOB sandbox o Stellar DEX si el listing tiene emisor `G…` real.

Pago live del demo = USDC de plataforma (issuer `GCASKV25…`, SAC propio). Las wallets custodiales se fondean solas al registrarse / al entrar: Friendbot cubre el XLM y el issuer firma la trustline + 10.000 USDC de prueba. Wallets self-custody (Freighter) reciben el XLM y firman su trustline una vez. En testnet el KYC se aprueba solo (foto cualquiera a modo de placeholder — no hay proveedor real).

La home también ofrece pesos por Alfred Pay, MoneyGram, USDC directo y Cosmos Pay. Esos on-ramps son mock. El aporte que pega chain es el USDC de plataforma.

---

## 3. Problema

El productor agropecuario necesita liquidez contra la campaña (semilla, fertilizante, flete). El inversor quiere yield con respaldo real. El circuito banco / warrant / Caja de Valores es lento, caro para pymes y casi no tiene secundario.

Fractachain recorta eso sobre Stellar: el expediente viaja con la emisión, el dinero queda en un contrato con caps y deadline, hay `refund` si falla, y si cierra el productor cobra en la fiduciaria y el inversor puede negociar.

La home lo presenta como marco ya vigente: "100% regulado", "opera bajo el sandbox de la CNV", RG 1150 / Ley 26.831. Es el diseño legal del producto, no una habilitación obtenida. El badge de la home dice Stellar Protocolo 27. Los contratos de este repo compilan con soroban-sdk 28.0.0.

---

## 4. Arquitectura

Inversor / productor → Next.js 14 (:3000) → Express (:4000) → Stellar classic (testnet: cuentas G…, XLM, SDEX, USDC de plataforma `GCASKV…`) y Soroban 28 (factory, licitación, stock).

- Contratos (`contracts/`): workspace Cargo, soroban-sdk 28.0.0, target `wasm32v1-none`. `issuance-factory` registra cada instancia. `fractachain-core` es librería y no se despliega.
- Backend (`backend/`): Express + TypeScript. JSON en `backend/data/`. Postgres write-through si hay `DATABASE_URL`. Firma `contribute` / `finalize` / `refund` cuando el listing es on-chain (contrato `C…` y pago XLM).
- Frontend (`frontend/`): Next 14 App Router, React 18, Tailwind. Marketplace, KYC, admin, orderbook.

IDs públicos (sin secretos): `deployments/testnet.json`. Pipeline: `scripts/testnet/`. App: `RAILWAY_DEPLOY.md`.

---

## Stack

| Capa | Tech |
|---|---|
| Contratos | Rust 2021, soroban-sdk 28.0.0, `wasm32v1-none` |
| Red | Stellar testnet, Horizon + Soroban RPC, Friendbot, SDEX |
| Tokens | USDC de plataforma `GCASKV25…` (SAC) para licitaciones y SDEX; el par viejo contra USDC Circle (`GBBD47IF…FLA5`) se mergea en el book por órdenes históricas |
| API | Node 20, Express 4.19, TypeScript, `@stellar/stellar-sdk` ^17.1, `pg` opcional |
| UI | Next.js 14.2.5, React 18.3, Tailwind 3.4, Freighter API ^6 y Firebase ^12 (opcionales) |
| Deploy | Docker `node:20-alpine` (`output: 'standalone'`), Compose, Railway (2 servicios) |

---

## Vivo vs mock

On-chain = contrato `C…` válido de ese listing (cada oferta despliega su propia instancia desde la factory).

| Pieza | Estado |
|---|---|
| `contribute` / `finalize` / `refund` (licitación, custodial) | Vivo (USDC plataforma; XLM queda soportado para listings viejos) |
| Fondeo de wallet custodial (XLM + trustline + 10.000 USDC) | Vivo, automático |
| Trustline `AUTH_REQUIRED` al aprobar KYC | Vivo (si hay `STELLAR_ISSUER_SECRET`) |
| Orderbook SDEX | Vivo si el listing tiene issuer `G…`; book mergea el par legacy USDC Circle |
| Aporte USDC de la UI, balance USDC en dashboard | Vivo |
| CLOB, dividendos | Sandbox |
| On-ramps de la home (Alfred Pay, MoneyGram, Cosmos Pay, CCTP, Near Intents, oráculos) | Mocks (`backend/src/mocks/`) |
| Freighter para aportar | Fuera del happy path |
| KYC | Auto-aprobado en testnet (no es compliance real) |

### IDs de contrato en testnet

Los `C…` de abajo son los **contract IDs** de los contratos Soroban desplegados en Stellar testnet, tal como quedan en `deployments/testnet.json`. Cada oferta nueva despliega su propio `stock-vault` + `licitacion` desde la factory — los listings viejos comparten las primeras instancias (era de contrato único), pero las emisiones actuales son independientes.

Que el listing tenga un contract ID no significa que opere on-chain: el backend solo invoca al contrato cuando el ID es válido (`isOnChainListing` en `backend/src/admin/listings.ts`). Un listing sin contrato desplegado corre entero en sandbox.

Testnet (2026-09-20): [factory](https://stellar.expert/explorer/testnet/contract/CDF7VE4JMPQYR6Q76MYFEEG64CZIZLOJLGSUQN5NXTZSP3U5JTWHNJGW) · [licitación](https://stellar.expert/explorer/testnet/contract/CDHKGEJNNFYKXW4XOEDXXE5LOF5HCYVORR2JT7AOK2FAN5B6I65X7JLM) · [stock](https://stellar.expert/explorer/testnet/contract/CD3MZ34ER36Z7WR66YIXH6MIYMY4OGFYVN3S5P7NNXGT6DZXVJUBDGL5).

Pitch en 5 pasos: register → wallet custodial → KYC → `/market` aportar USDC (`contribute`) → `finalize` / `refund`. Guion: `HACKATHON.md`, `RUNBOOK_DEMO_P0.md`.

---

## Correr

Node 20. Contratos: Rust + `wasm32v1-none`.

```bash
cd backend && cp .env.example .env && npm i && npm run dev          # :4000
cd frontend && cp .env.example .env.local && npm i && npm run dev   # :3000
# o: docker compose up --build
```

`cd contracts && cargo test` · pipeline testnet: `scripts/testnet/README.md` · pitch: `HACKATHON.md` · demo: `RUNBOOK_DEMO_P0.md`.
