# Fractachain

[![Stellar](https://img.shields.io/badge/Stellar-7B61FF?style=flat&logo=stellar&logoColor=white)](https://stellar.org)
[![Soroban](https://img.shields.io/badge/Soroban_28-000000?style=flat&logo=rust&logoColor=white)](https://soroban.stellar.org)
[![Astro](https://img.shields.io/badge/Astro_7-BC52EE?style=flat&logo=astro&logoColor=white)](https://astro.build)
[![Express](https://img.shields.io/badge/Express_5-000000?style=flat&logo=express&logoColor=white)](https://expressjs.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org)

El primer mercado regulado de Activos del Mundo Real (RWA), sobre Stellar / Soroban 28: licitación de acciones y deuda para empresas y productores, con negociación en el mercado secundario.

[github.com/Erosmart/fractachain](https://github.com/Erosmart/fractachain) · Argentina Builder Challenge · Stellar. Código source-available (`LICENSE`).

La home (`/`) es el pitch. Este README dice qué de eso corre de verdad en testnet. Pitch completo: [`docs/pitch/`](docs/pitch/README.md).

---

## 0. Visión

Queremos ser el primer mercado regulado de Activos del Mundo Real. La solución se centra en darles a empresas y productores acceso a financiamiento —emitir un título de deuda o vender sus acciones en el mercado— a un costo mucho más bajo que en el mercado tradicional.

Soluciones de tokenización puede haber muchas, pero tokenización sin un mercado con liquidez no sirve. Con las herramientas de on-ramping y off-ramping que ya funcionan en Stellar —anchors como Alfred Pay o MoneyGram para pasar de pesos a USDC—, las empresas quedan expuestas a inversores de más de 90 países bajo el mismo marco jurídico que un inversor en Argentina, con operación y liquidez inmediata las 24 horas.

Aplicaciones de RWA puede haber miles, pero si son cerradas, donde solo comercia un grupo chico, es lo mismo de siempre. En FractaChain, cuando una empresa hace su oferta pública de acciones pueden participar todos: desde inversores pequeños hasta grandes instituciones financieras.

La regulación actual ya permite lo anterior, y sería un orgullo ser el puente que conecte la economía de Argentina con el capital financiero global: que las empresas comercien sus materias primas, que se compren y vendan acciones del mercado tradicional las 24 horas, y que instituciones e inversores minoristas puedan hacer carry trade con la misma facilidad.

En definitiva, llevar lo mejor del mercado tradicional (seguridad jurídica, custodia y reglas claras) a las finanzas descentralizadas: acceso global, liquidez inmediata y bajos costos. No es una idea a futuro: es lo que ya estamos construyendo en Stellar.

---

## 1. Qué es

Una empresa o un productor tokeniza acciones o deuda y las ofrece en licitación. Un inversor las suscribe en la oferta primaria y después puede negociarlas en el mercado secundario. Todo liquida en Stellar testnet. No es un DEX genérico ni un token suelto.

| En la home | Qué hace | Contrato | UI |
|---|---|---|---|
| Inversión | Oferta primaria de acciones o deuda: caps, deadline, reembolso si falla | `fractachain-licitacion` | `/market` |
| Secundario | Orderbook entre inversores sobre el Stellar DEX | SDEX nativo | `/orderbook` |

Lo que hoy corre on-chain en el demo es la licitación: el aporte se paga en USDC de plataforma (SAC del issuer `GCASKV…`) y lo firma una wallet custodial del backend.

---

## 2. Función

**Productor.** Arma el dossier de la oferta —el expediente de compliance: CUIT, ISIN, datos ante la CNV, caps, TNA y la wallet fiduciaria que recibe los fondos— y publica la licitación. La oferta puede ser de acciones o de deuda (bono/ON): en ambos casos se emite bajo una Serie del fideicomiso financiero con oferta pública (ver §Estructuración legal), y lo que se tokeniza y se vende son las cuotapartes o los títulos de esa Serie. Con el dossier listo se despliega el contrato, se mintean los tokens y se abre la licitación, que cierra cuando se completa el cupo (cap) o cuando llega la fecha límite. Si cerró Successful, `finalize()` manda los USDC a la fiduciaria; si no se alcanzó el mínimo de inversión, `refund()` le devuelve el aporte a cada inversor. Hoy eso se opera desde Admin → Emisión.

**Inversor.** Se registra (email; Google/Firebase y Freighter opcionales), elige custodia, pasa KYC y aporta llamando a `contribute()` on-chain. Recibe unidades RWA registradas en el storage del contrato —no un asset clásico en Freighter—. Si la oferta falla, `refund()` le devuelve los USDC. En el mercado secundario opera un orderbook sandbox, o el Stellar DEX cuando el listing tiene un emisor `G…` real.

El pago en vivo del demo es USDC de plataforma (issuer `GCASKV25…`, SAC propio). Las wallets custodiales se fondean solas al registrarse o al entrar: Friendbot cubre el XLM y el issuer firma la trustline con 10.000 USDC de prueba. Las wallets self-custody (Freighter) reciben el XLM y firman su trustline una vez. En testnet el KYC se aprueba solo (foto cualquiera a modo de placeholder — no hay proveedor real).

La entrada de pesos a USDC se apoya en los anchors de on/off-ramping que ya operan en Stellar (Alfred Pay, MoneyGram). Hoy la home los muestra como maqueta; el aporte que corre on-chain es el USDC de plataforma.

---

## 3. Estructuración legal

De una idea a una oferta tokenizada hay 4 pasos:

| Paso | Qué se hace | Marco |
|---|---|---|
| 1. Sociedad | SAS o S.A. ante la IGJ / Registro Público provincial: la operadora de la plataforma y titular de las inscripciones. | — |
| 2. PSAV | Inscripción como Proveedor de Servicios de Activos Virtuales en la CNV: habilita a custodiar, emitir y facilitar compraventa de tokens. Pide manuales de compliance, programa AML/CFT ante la UIF, solvencia, idoneidad técnica y un Oficial de Cumplimiento. | Ley 27.739, RG CNV 1058, UIF Res. 49/2024 |
| 3. Fideicomiso | Fideicomiso financiero con oferta pública: separa el patrimonio de los inversores del de la operadora. Se estructura como Programa Global con Series independientes (recorta >60 % el costo legal de las emisiones sucesivas). | Ley 26.831, Sandbox CNV RG 1069/1081/1087/1150 (vigente al 31/12/2027) |
| 4. Tokenización | Las cuotapartes del fideicomiso —o las acciones/bonos que una empresa cliente emite dentro de una Serie— se representan como tokens en Stellar vía contratos Soroban, respaldados 1:1 por el activo custodiado. | `issuance-factory` → `stock-vault` + `licitacion` |

**Ventaja del Programa Global.** Un solo fideicomiso aloja muchos despliegues de tokens (una Serie por oferta) y la CNV premia la emisión frecuente: con **7 fideicomisos emitidos bajo el mismo Programa Global —3 de ellos en los últimos 12 meses—** cada Serie nueva obtiene **autorización automática** mediante un Suplemento de Prospecto abreviado (RG 1074/2025). Para acciones y ONs, el registro de **Emisor Frecuente** (2 emisiones en 24 meses y 2 años de trayectoria en oferta pública; RG 746/2018, mod. RG 1076/2025) habilita a emitir series dentro de un monto máximo global con autorización simplificada. Ambas figuras abaratan aún más el costo y el tiempo de cada emisión.

Warrants y certificados de depósito (Ley 9643) y forwards de cosa futura (Art. 1131 CCyC) completan el marco del roadmap. El Sandbox CNV es una autorización formal publicada en el Boletín Oficial, no un régimen experimental informal.

**En la web.** El frontend (Astro + islas React) refleja ese mismo proceso: `/` es el pitch; `/register` y `/onboarding` cubren cuenta, elección de custodia y KYC; `/market` lista las licitaciones abiertas y la ficha de cada oferta ejecuta el `contribute()`; `/dashboard` muestra la posición del inversor; `/orderbook` es el secundario sobre el SDEX; `/admin` → Emisión es donde el emisor carga el dossier, despliega el contrato y abre o cierra la licitación.

---

## 4. Problema

El productor agropecuario necesita liquidez contra la campaña (semilla, fertilizante, flete) y las pymes casi no acceden al mercado de capitales: emitir acciones o deuda por la vía tradicional es lento y caro, y el circuito banco / warrant / Caja de Valores casi no tiene mercado secundario —es decir, casi no hay un lugar donde el inversor pueda revender lo que suscribió—. El inversor quiere yield con respaldo real.

Fractachain recorta eso sobre Stellar dentro del marco de la CNV (ver §Estructuración legal): el expediente viaja con la emisión, el dinero queda en un contrato con caps y deadline, hay `refund` si falla, y si cierra el productor cobra en la fiduciaria y el inversor puede negociar.

Roadmap a futuro: forwards de producción (Art. 1131 CCyC), warrants y crédito colateralizado contra stock certificado (Ley 9643), y tokenización de acciones del Merval. Hoy no son parte del producto operativo.

La home lo presenta como marco ya vigente: "100% regulado", "opera bajo el sandbox de la CNV". Es el diseño legal del producto, no una habilitación obtenida. El badge de la home dice Stellar Protocolo 27. Los contratos de este repo compilan con soroban-sdk 28.0.0.

---

## 5. Arquitectura

Inversor / productor → servidor único (:3000: Astro SSR + API Express en `/api`) → Stellar classic (testnet: cuentas G…, XLM, SDEX, USDC de plataforma `GCASKV…`) y Soroban 28 (factory, licitación, stock).

- Contratos (`contracts/`): workspace Cargo, soroban-sdk 28.0.0, target `wasm32v1-none`. `issuance-factory` registra cada instancia. `fractachain-core` es librería y no se despliega.
- App (`apps/web/`): Astro 7 SSR con islas React 19 y Tailwind, y el API montado en el mismo servidor (`/api`, `/health`). Marketplace, KYC, admin, orderbook. Una sola imagen Docker, un solo servicio.
- Backend (`packages/api/`): Express 5 + TypeScript por capas (dominio / aplicación / infraestructura / HTTP) con inyección de dependencias. JSON atómico en `data/`, espejo + restore en Postgres si hay `DATABASE_URL`. Firma `contribute` / `finalize` / `refund` cuando el listing es on-chain.
- Tipos compartidos (`packages/shared/`): el contrato HTTP entre API y web.

Detalle de capas y principios: [`docs/architecture.md`](docs/architecture.md). Seguridad: [`SECURITY.md`](SECURITY.md).

IDs públicos (sin secretos): `deployments/testnet.json`. Pipeline: `scripts/testnet/`. Deploy: [`docs/guides/deploy-railway.md`](docs/guides/deploy-railway.md).

---

## Stack

| Capa | Tech |
|---|---|
| Contratos | Rust 2021, soroban-sdk 28.0.0, `wasm32v1-none` |
| Red | Stellar testnet, Horizon + Soroban RPC, Friendbot, SDEX |
| Tokens | USDC de plataforma `GCASKV25…` (SAC) para licitaciones y SDEX; el par viejo contra USDC Circle (`GBBD47IF…FLA5`) se mergea en el book por órdenes históricas |
| API | Node 22, Express 5, TypeScript estricto, zod, helmet, express-rate-limit, pino, jose, `@stellar/stellar-sdk` ^17.4, `pg` opcional |
| UI | Astro 7 (SSR, adaptador Node), React 19 (islas), Tailwind 3.4, Freighter API ^6 y `@firebase/auth` (opcionales) |
| Calidad | npm workspaces, vitest + supertest, `astro check`, Prettier, GitHub Actions (typecheck, tests, build, audit, `cargo test`) |
| Seguridad | Sesión en cookie `HttpOnly`+`SameSite=Strict` con CSRF, 2FA TOTP (obligatorio para admins en prod), verificación de email, reseteo de contraseña, auditoría, rate limiting, CSP |
| Deploy | Una imagen Docker `node:22-alpine` (no-root, tini), Compose, Railway (1 servicio) |

---

## Vivo vs mock

On-chain = contrato `C…` válido de ese listing (cada oferta despliega su propia instancia desde la factory).

| Pieza | Estado |
|---|---|
| `contribute` / `finalize` / `refund` (licitación, custodial) | Vivo (USDC plataforma; XLM queda soportado para listings viejos) |
| Fondeo de wallet custodial (XLM + trustline + 10.000 USDC) | Vivo, automático |
| Trustline `AUTH_REQUIRED` al aprobar KYC | Vivo (si hay `STELLAR_ISSUER_SECRET`) |
| Orderbook SDEX | Vivo si el listing tiene issuer `G…`; el book combina el par legacy USDC Circle |
| Aporte USDC de la UI, balance USDC en dashboard | Vivo |
| CLOB, dividendos | Sandbox |
| On-ramps de la home (Alfred Pay, MoneyGram, CCTP, Near Intents, oráculos) | Mocks (`packages/api/src/application/mocks/`) |
| Freighter para aportar | Fuera del flujo principal |
| KYC | Auto-aprobado en testnet (no es compliance real) |

### IDs de contrato en testnet

Los `C…` de abajo son los **contract IDs** de los contratos Soroban desplegados en Stellar testnet, tal como quedan en `deployments/testnet.json`. Cada oferta nueva despliega su propio `stock-vault` + `licitacion` desde la factory — los listings viejos comparten las primeras instancias (era de contrato único), pero las emisiones actuales son independientes.

Que el listing tenga un contract ID no significa que opere on-chain: el backend solo invoca al contrato cuando el ID es válido (`isOnChainListing` en `packages/api/src/domain/listing/Listing.ts`). Un listing sin contrato desplegado corre entero en sandbox.

Testnet (2026-09-20): [factory](https://stellar.expert/explorer/testnet/contract/CDF7VE4JMPQYR6Q76MYFEEG64CZIZLOJLGSUQN5NXTZSP3U5JTWHNJGW) · [licitación](https://stellar.expert/explorer/testnet/contract/CDHKGEJNNFYKXW4XOEDXXE5LOF5HCYVORR2JT7AOK2FAN5B6I65X7JLM) · [stock](https://stellar.expert/explorer/testnet/contract/CD3MZ34ER36Z7WR66YIXH6MIYMY4OGFYVN3S5P7NNXGT6DZXVJUBDGL5).

Pitch en 5 pasos: register → wallet custodial → KYC → `/market` aportar USDC (`contribute`) → `finalize` / `refund`. Guion: [`docs/pitch/hackathon.md`](docs/pitch/hackathon.md), [`docs/runbooks/demo-p0.md`](docs/runbooks/demo-p0.md).

---

## Correr

Node 22 (`.nvmrc`). Contratos: Rust + `wasm32v1-none` + `stellar` CLI.

```bash
npm install
cp .env.example .env      # completá AUTH_SECRET y WALLET_PEPPER (openssl rand -hex 32)
npm run dev               # http://localhost:3000 — web + API en el mismo proceso
# producción local:
npm run build && npm start
# o con Docker:
docker compose up --build
```

| Comando | Qué hace |
|---|---|
| `npm run dev` | `astro dev` con el API montado adentro (un puerto, un origen) |
| `npm run build` / `npm start` | build de API + web y servidor único de producción |
| `npm test` | tests de API y web |
| `npm run typecheck` | `tsc` (API) + `astro check` (web) |
| `npm run contracts:test` | `cargo test` de los contratos |
| `npm run testnet:*` | scripts de testnet (deploy de licitación, forward/warrant, factory/USDC propios) |

Estructura del repo:

```
apps/web         La app: Astro 7 SSR + API en el mismo servidor     → apps/web/README.md
packages/api     Backend por capas (librería, también corre solo)   → packages/api/README.md
packages/shared  Tipos del contrato HTTP
contracts/       Soroban 28 (Cargo workspace)
deployments/     IDs públicos de testnet
scripts/testnet  Pipeline de deploy de contratos
tools/agents     Agentes de mercado para testnet
docs/            Arquitectura, seguridad, guías, runbooks, pitch
```

Pipeline testnet: [`scripts/testnet/README.md`](scripts/testnet/README.md) · pitch: [`docs/pitch/hackathon.md`](docs/pitch/hackathon.md) · demo: [`docs/runbooks/demo-p0.md`](docs/runbooks/demo-p0.md).
