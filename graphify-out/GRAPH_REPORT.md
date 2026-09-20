# Graph Report - fractachain  (2026-09-18)

## Corpus Check
- 220 files · ~389,888 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1497 nodes · 2866 edges · 97 communities (89 shown, 5 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 108 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Env
- Stellar Assets, Trustlines, and SAC
- Stellar dApp / Frontend
- x402 — Paid APIs + Agent Buyer Clients
- CCTP V2 on Stellar — native USDC between chains
- frontend/package.json
- orderbook.rs
- test_runner.ts
- Development Patterns
- Env
- Vulnerability classes
- Developer Tools
- server.ts
- compilerOptions
- SEP / CAP Standards Reference
- token_client
- bump_instance
- backend/package.json
- api.ts
- orderbook/page.tsx
- listings.ts
- dividends.ts
- kyc_review.ts
- Fractachain — Master Architecture & Technical Blueprint
- 13. Tokenización de Acciones del Merval y Productos en Expansión
- DeFi Protocols
- Zero-Knowledge Proofs & Privacy
- Stellar Ecosystem
- 1.5. Marco Regulatorio Argentino Integrado (CNV, UIF, BCRA y Legislación Nacional)
- lucide-react
- Stellar Smart Contracts
- compilerOptions
- fractachain-licitacion/src/test.rs
- AuthContext.tsx
- Testing
- Block Explorers
- 7.1. Mensajes Clave y Estructura de la Landing Page
- Common Operations
- Key Methods
- Community Examples
- useAuth
- 5.1. Rieles de Fondeo Internacional
- Navbar.tsx
- Stellar Data: RPC + Horizon
- Funding Programs
- Curated Resources
- forward-contract/src/test.rs
- 3. Las 3 Ramas de Negocio de Fractachain
- Quick mapping by use case
- Horizon API (Legacy)
- Stellar Raven
- Unit testing
- Browser Extensions
- sdex_book.ts
- brands-upload-server.js
- accounts.ts
- 12. KYC Nativo con Backend de Administración
- 14. Integraciones de Pago — Especificación de Mocks
- fractachain-core
- Guía de Despliegue en Railway - Fractachain
- Migration: Horizon to RPC
- Best Practices
- Historical Data Access
- Data & Analytics
- Learning Resources
- Community
- Zero-Knowledge Proofs (Status-Sensitive)
- Data Indexing
- logo-upload-server.js
- orderbook.ts
- 4.1. Especificación del Contrato `FractachainLicitacion`
- Stellar RPC
- Cross-Chain
- CLI Tools
- Contract Libraries & Tools
- Protocol & Governance
- Testing
- 11. OPA y Squeeze-Out — Umbrales Confirmados por Ley Argentina
- 12.5. Arquitectura de Billeteras: Modalidad Dual de Custodia
- 16. Plan de Verificación
- Env
- Official Documentation
- Stablecoins on Stellar
- SDKs
- AppGate.tsx
- stellar script
- warrant-vault/src/test.rs
- next.config.js
- issuance-factory/src/test.rs
- stock-vault/src/test.rs
- next-env.d.ts
- forwards/page.tsx
- Standards, Ecosystem, and Resources
- warrants/page.tsx

## God Nodes (most connected - your core abstractions)
1. `FractachainLicitacionContract` - 36 edges
2. `useAuth()` - 33 edges
3. `react` - 32 edges
4. `setup()` - 28 edges
5. `token_client()` - 26 edges
6. `lucide-react` - 24 edges
7. `setup()` - 22 edges
8. `require_positive()` - 22 edges
9. `investor()` - 21 edges
10. `bump_persistent()` - 20 edges

## Surprising Connections (you probably didn't know these)
- `require_positive_accepts_only_strictly_positive()` --calls--> `require_positive()`  [INFERRED]
  contracts/fractachain-core/src/test.rs → contracts/fractachain-core/src/lib.rs
- `require_positive_rejects_negative()` --calls--> `require_positive()`  [INFERRED]
  contracts/fractachain-core/src/test.rs → contracts/fractachain-core/src/lib.rs
- `bump_all()` --calls--> `bump_instance()`  [INFERRED]
  contracts/forward-contract/src/lib.rs → contracts/fractachain-core/src/lib.rs
- `bump_all()` --calls--> `bump_persistent()`  [INFERRED]
  contracts/forward-contract/src/lib.rs → contracts/fractachain-core/src/lib.rs
- `divisible_amounts_pass_and_remainders_do_not()` --calls--> `require_divisible()`  [INFERRED]
  contracts/fractachain-core/src/test.rs → contracts/fractachain-core/src/lib.rs

## Import Cycles
- None detected.

## Communities (97 total, 5 thin omitted)

### Community 0 - "Env"
Cohesion: 0.08
Nodes (49): require_positive(), get_investor_info(), has_voting_rights(), InvestorInfo, InvestorType, is_argentina_business_hours(), is_gafi_blacklisted(), is_investor_verified() (+41 more)

### Community 1 - "Stellar Assets, Trustlines, and SAC"
Cohesion: 0.05
Nodes (42): Asset Flags, Asset Identifiers, Asset Issuance, Asset Types, Authorize Trustline, Best Practices, Check Trustline Status, Clawback Tokens (+34 more)

### Community 2 - "Stellar dApp / Frontend"
Cohesion: 0.05
Nodes (37): Account Balance, Client-Side Data Fetching, Contract State, Data Fetching, Connect Wallet Button, Layout, Next.js App Router Setup, Provider Component (+29 more)

### Community 3 - "x402 — Paid APIs + Agent Buyer Clients"
Cohesion: 0.05
Nodes (37): Charge mode: per-request payments, Client:, Closing the channel (server-initiated):, Common pitfalls, Discovery: let agents find your paid API, MPP — Machine Payments Protocol (Charge + Session), Optional dual-intent server, Packages and subpath imports (+29 more)

### Community 4 - "CCTP V2 on Stellar — native USDC between chains"
Cohesion: 0.06
Nodes (33): Axelar on Stellar — GMP and Interchain Tokens, GMP: receiving a message on Stellar, GMP: sending a message from Stellar, ITS pitfalls, ITS: tokens on multiple chains, CCTP V2 on Stellar — native USDC between chains, Contracts and addresses, EVM/Solana → Stellar (inbound) (+25 more)

### Community 5 - "frontend/package.json"
Cohesion: 0.05
Nodes (36): dependencies, clsx, firebase, lucide-react, next, @next/swc-linux-x64-gnu, react, react-dom (+28 more)

### Community 6 - "orderbook.rs"
Cohesion: 0.40
Nodes (10): cancel_order(), create_order(), get_order(), get_order_count(), Order, OrderbookKey, Address, Env (+2 more)

### Community 7 - "test_runner.ts"
Cohesion: 0.08
Nodes (25): authenticateWithGoogle(), AuthUser, DEMO_USER, getUserByToken(), revokeSession(), sessions, usersByEmail, getMervalStocks() (+17 more)

### Community 8 - "Development Patterns"
Cohesion: 0.09
Nodes (23): Auth trees and cross-contract propagation, Authorization, Choosing storage — decision tree, Constructors, Contract size, Cross-contract calls, Custom accounts (`__check_auth`), Data types (+15 more)

### Community 9 - "Env"
Cohesion: 0.21
Nodes (17): bump_persistent(), accrue(), balance_of(), meta(), payment_token(), Registry, require_admin(), Address (+9 more)

### Community 10 - "Vulnerability classes"
Cohesion: 0.10
Nodes (21): 10. Resource exhaustion / fee griefing, 11. Custom account (`__check_auth`) pitfalls, 1. Missing authorization, 2. Auth replay through middleware (missing outer `require_auth`), 3. Reinitialization attacks, 4. Arbitrary contract calls, 5. Integer overflow/underflow, 6. Storage key collisions (+13 more)

### Community 11 - "Developer Tools"
Cohesion: 0.14
Nodes (14): AI & MCP Tools, CLI & SDKs, Contract Libraries, Developer Tools, OpenZeppelin Relayer, OpenZeppelin Stellar Contracts, Passkey Kit, Raven (+6 more)

### Community 12 - "server.ts"
Cohesion: 0.08
Nodes (29): bindContract(), createProduct(), DEFAULT_TESTNET_ASSETS, getPaymentAssets(), IssuanceProduct, listProducts(), PaymentKind, ProductKind (+21 more)

### Community 13 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 14 - "SEP / CAP Standards Reference"
Cohesion: 0.15
Nodes (13): Anchor and fiat integration, Auth, identity, and metadata, Contracts and token interfaces, Frequently used contract capabilities, High-value CAPs for smart contract developers, High-value SEPs for app developers, Maintenance note, Newer and draft crypto/features (+5 more)

### Community 15 - "token_client"
Cohesion: 0.22
Nodes (17): Client, acceptance_deadline(), addr(), bump_all(), delivered(), disputed(), escrow_total(), ForwardContract (+9 more)

### Community 16 - "bump_instance"
Cohesion: 0.22
Nodes (11): bump_instance(), Env, FactoryKey, IssuanceFactoryContract, PaymentKind, Product, ProductKind, require_admin() (+3 more)

### Community 17 - "backend/package.json"
Cohesion: 0.07
Nodes (28): dependencies, cors, dotenv, express, @stellar/stellar-sdk, description, devDependencies, ts-node-dev (+20 more)

### Community 18 - "api.ts"
Cohesion: 0.12
Nodes (15): AdminIssuancePage(), empty, AdminKycPage(), AdminTestnetPage(), PoolDetailPage(), DEFAULT_STOCKS, API_BASE_URL, getApiBaseUrl() (+7 more)

### Community 19 - "orderbook/page.tsx"
Cohesion: 0.20
Nodes (10): Book, fmtQty(), fromSdex(), Level, Market, MyOrder, OrderbookInner(), SdexLevel (+2 more)

### Community 20 - "listings.ts"
Cohesion: 0.17
Nodes (25): applyDueClose(), applySettleChoice(), closeListing(), contractId(), contributeListing(), createListing(), DATA, deployListing() (+17 more)

### Community 21 - "dividends.ts"
Cohesion: 0.31
Nodes (7): accrueDividend(), listAccounts(), DATA, depositDividends(), distributions, DividendDistribution, save()

### Community 22 - "kyc_review.ts"
Cohesion: 0.17
Nodes (15): approveKyc(), GAFI_BLACKLIST, getAllKycRecords(), getKycById(), InvestorType, isArgentinaBusinessHours(), isGafiBlacklisted(), kycDatabase (+7 more)

### Community 23 - "Fractachain — Master Architecture & Technical Blueprint"
Cohesion: 0.14
Nodes (13): 10. Credenciales y Configuración de Despliegue, 15. Estructura del Proyecto, 17. Checklist de Requerimientos y Cumplimiento Regulatorio, 1. Resumen Ejecutivo y Propuesta de Valor, 2. El Oráculo del Mundo Físico: Custodia de Stock y No Doble Venta (Modelo PoGR inspirado en Agrotoken), 6. Módulo de Emulación y Resiliencia (Mock Sandbox Fallback), 8. Hoja de Ruta para el Despliegue en Stellar Testnet, 9. Seguro Agrícola Paramétrico On-Chain (Smart Contract de Cobertura Climática) (+5 more)

### Community 24 - "13. Tokenización de Acciones del Merval y Productos en Expansión"
Cohesion: 0.14
Nodes (14): 13.1. Estado Legal: ¿Se pueden tokenizar acciones que ya cotizan en el Merval / BYMA?, 13.2. Modelo de Custodia Institucional Directa por Fractachain (PSAV Custodio), 13.3. Catálogo de las Principales Acciones Argentinas y Módulo en el Frontend (`/app/stocks`), 13.4. Arquitectura de Backend y Smart Contracts para Acciones Merval Custodiadas, 13.5. Régimen Legal de Horarios: ¿Negociación 24/7 o Rueda Tradicional?, 13. Tokenización de Acciones del Merval y Productos en Expansión, 1. Acciones del Merval (Empresas que cotizan en BYMA):, 1. Smart Contract de Acciones Custodiadas (`StockVault.wasm`): (+6 more)

### Community 25 - "DeFi Protocols"
Cohesion: 0.15
Nodes (13): Aquarius / AQUA Network, Blend Protocol, DeFi Protocols, DeFindex, DEXs & AMMs, K2, Lending & Borrowing, Orbit CDP Protocol (+5 more)

### Community 26 - "Zero-Knowledge Proofs & Privacy"
Cohesion: 0.15
Nodes (12): Architecture patterns, Pitfalls, References, Related skills, Testing, The on-chain verifier (Groth16 over BLS12-381), Walkthrough: Circom → on-chain verification, Walkthrough: Noir (UltraHonk, on-chain verifiable since Protocol 26) (+4 more)

### Community 27 - "Stellar Ecosystem"
Cohesion: 0.17
Nodes (12): Band Protocol, Builder Teams & Companies, DIA Oracle, Enterprise Integrations, Gaming & NFTs, Litemint, Major Issuers on Stellar, Oracles (+4 more)

### Community 28 - "1.5. Marco Regulatorio Argentino Integrado (CNV, UIF, BCRA y Legislación Nacional)"
Cohesion: 0.17
Nodes (12): 1.5.1. Legislación Base de la República Argentina, 1.5.2. Resoluciones de la CNV: El Sandbox Regulatorio de Tokenización (2024–2027), 1.5.3. Vehículo Legal: Fideicomiso Financiero con Oferta Pública (Programa Global y Series), 1.5.4. Diferencia Jurídica Esencial: Security Token (Inversión) vs Token de Consumo (Preventa), 1.5.5. Régimen para Inversores Extranjeros No Residentes, 1.5.6. El Reemplazo de Caja de Valores y Fractachain como Depositario Central Digital (ADCVN B2B / Moat de Red), 1.5. Marco Regulatorio Argentino Integrado (CNV, UIF, BCRA y Legislación Nacional), ¿Cómo garantiza Fractachain su continuidad y monopolio de infraestructura? (+4 more)

### Community 29 - "lucide-react"
Cohesion: 0.08
Nodes (21): INITIAL_HOLDERS, TokenHolder, BrandLogo(), ContractData, ContractInspectorBanner(), CONTRACTS, DynamicHeroText(), SECTORS (+13 more)

### Community 30 - "Stellar Smart Contracts"
Cohesion: 0.18
Nodes (11): Before mainnet, Build, deploy, invoke, Contract anatomy, Documentation, Minimal test, Platform constraints, Project setup, Related skills (+3 more)

### Community 31 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, module, outDir, rootDir, skipLibCheck, strict (+2 more)

### Community 32 - "fractachain-licitacion/src/test.rs"
Cohesion: 0.16
Nodes (34): a_failed_issuance_keeps_the_money_for_refunds(), a_successful_issuance_pays_the_fiduciary(), a_tender_offer_is_escrowed_and_acceptable_unilaterally(), admin_can_set_price_and_token_before_funding(), an_underpriced_tender_offer_is_rejected(), balance(), cancelling_an_order_restores_the_free_balance(), contribute_mints_rwa_and_secondary_market_settles() (+26 more)

### Community 33 - "AuthContext.tsx"
Cohesion: 0.19
Nodes (13): AuthContext, AuthContextType, AuthProvider(), CustodyMode, KycStatus, normalize(), persist(), User (+5 more)

### Community 34 - "Testing"
Cohesion: 0.20
Nodes (10): Checklist, CI, Fuzz testing, Integration tests, Local network, Property-based testing, Resource profiling, Snapshots, fork tests, mutation tests (+2 more)

### Community 35 - "Block Explorers"
Cohesion: 0.20
Nodes (10): Anchor Platform, Anchors & On/Off Ramps, Block Explorers, Disbursements, Infrastructure, Stellar Disbursement Platform (SDP), Stellar Lab, Stellar Ramps (+2 more)

### Community 36 - "7.1. Mensajes Clave y Estructura de la Landing Page"
Cohesion: 0.20
Nodes (10): 1. Header / Hero Section:, 2. Sección "¿Por qué Fractachain es la alternativa más potente para Argentina?":, 3. Sección "Seguridad del Inversor: El Oráculo del Mundo Físico (Modelo Agrotoken PoGR)":, 4. Sección "Cobertura de Riesgo Climático: Seguro Agrícola Paramétrico On-Chain":, 5. Sección "Mercado Secundario: Libro de Órdenes Exclusivo (Cero AMM)":, 6. Sección "Expansión Merval y Nuevos Activos (Habilitado por RG 1081/2025 CNV)":, 7.1. Mensajes Clave y Estructura de la Landing Page, 7.2. Dashboard del Inversor y Productor (+2 more)

### Community 37 - "Common Operations"
Cohesion: 0.22
Nodes (9): Common Operations, Get Account Balances, Get Effects, Get Operations, Get Payments, Get Transactions, Load Account, Streaming (Server-Sent Events) (+1 more)

### Community 38 - "Key Methods"
Cohesion: 0.22
Nodes (9): Get Account, Get Events, Get Health, Get Latest Ledger, Get Ledger Entries, Get Transaction, Key Methods, Send Transaction (+1 more)

### Community 39 - "Community Examples"
Cohesion: 0.22
Nodes (9): Community Examples, Example Repositories, Official Examples, Oracle Example, OZ Stellar NFT, Soroban Contracts (icolomina), Soroban Example dApp, Soroban Examples (+1 more)

### Community 40 - "useAuth"
Cohesion: 0.14
Nodes (16): DashboardPage(), money(), Portfolio, Position, LoginInner(), KycOnboardingPage(), PendingKycPage(), WalletOnboardingPage() (+8 more)

### Community 41 - "5.1. Rieles de Fondeo Internacional"
Cohesion: 0.22
Nodes (9): 1. Riel Cripto-Institucional: Circle CCTP V2 (Cross-Chain Transfer Protocol), 2. Riel Multiactivo Global: NEAR Intents ("Deposit from Any Chain / Any Asset"), 3. Riel Fiat Internacional: Tarjetas de Crédito, Débito y Billeteras Digitales, 4. Riel Bancario Directo (SEPA y ACH):, 5.1. Rieles de Fondeo Internacional, 5.2. Onboarding y KYC Internacional (Pasaportes de más de 220 Países), 5.3. Rampa Fiat Nacional (Argentina) y Marco CNV, 5. Rampa Fiat, Fondeo Global (USA, Europa, Asia) y Cumplimiento Regulatorio (+1 more)

### Community 42 - "Navbar.tsx"
Cohesion: 0.19
Nodes (9): metadata, HomePage(), BrandMark(), CrystalBackdrop(), Footer(), adminLinks, Navbar(), primaryLinks (+1 more)

### Community 43 - "Stellar Data: RPC + Horizon"
Cohesion: 0.29
Nodes (7): Environment-Based Setup, Network Configuration, Overview, Read the file that matches the task, Related skills, Stellar Data: RPC + Horizon, When to use this skill

### Community 45 - "Funding Programs"
Cohesion: 0.29
Nodes (7): Funding Programs, Official Directories, Project Directories, SCF Project Tracker, Soroban Audit Bank, Stellar Community Fund (SCF), Stellar Ecosystem Directory

### Community 46 - "Curated Resources"
Cohesion: 0.29
Nodes (7): Curated Resources, Ecosystem Projects, Example Repositories, Infrastructure, Project Directories & Funding, RPC Providers, Security

### Community 47 - "forward-contract/src/test.rs"
Cohesion: 0.17
Nodes (27): a_deadline_in_the_past_is_rejected(), a_falsely_marked_delivery_does_not_trap_the_buyer(), a_position_pending_acceptance_cannot_be_sold(), a_tiny_escrow_still_owes_a_penalty(), an_overflowing_deadline_is_rejected(), arbiter_can_also_rule_for_the_producer(), balance(), buyer_recovers_everything_when_the_producer_never_delivers() (+19 more)

### Community 48 - "3. Las 3 Ramas de Negocio de Fractachain"
Cohesion: 0.29
Nodes (7): 3.1. Rama 1: Forwards Agrícolas de Consumo, 3.2. Rama 2: Grado de Inversión (Mini-Bolsa PyME y Agro), 3.3. Rama 3: Crédito Colateralizado por Inventario (Warrants Tokenizados), 3.4. Rama 4: Staking y Préstamos Colateralizados con Tokens RWA (DeFi Institucional en Soroban), 3. Las 3 Ramas de Negocio de Fractachain, A. Staking de Tokens RWA (`RWAStakingVault.wasm`), B. Préstamos en USDC Colateralizados con Tokens RWA (`RWALendingVault.wasm`)

### Community 49 - "Quick mapping by use case"
Cohesion: 0.40
Nodes (5): I am building a fungible token, I am building a smart-wallet flow, I need anchor integration for fiat rails, I need upgrade-safe contracts, Quick mapping by use case

### Community 50 - "Horizon API (Legacy)"
Cohesion: 0.33
Nodes (4): Endpoints, Horizon API (Legacy), Pagination, Setup

### Community 51 - "Stellar Raven"
Cohesion: 0.33
Nodes (5): CLI & Local Development Reference, Complementary Workflow: Raven + Local Skills, How Raven Works, Stellar Raven, Using Raven MCP

### Community 52 - "Unit testing"
Cohesion: 0.33
Nodes (6): Authorization, Cross-contract, Events, Storage TTL, Time and ledger state, Unit testing

### Community 53 - "Browser Extensions"
Cohesion: 0.17
Nodes (12): Albedo, Beans, Browser Extensions, Freighter, Hana Wallet, LOBSTR, Mobile Wallets, Multi-Wallet Integration (+4 more)

### Community 54 - "sdex_book.ts"
Cohesion: 0.08
Nodes (64): Listing, listListings(), config, DEFAULTS, FILE, getTestnetConfig(), load(), save() (+56 more)

### Community 55 - "brands-upload-server.js"
Cohesion: 0.17
Nodes (16): BRANDS_DIR, ENV_FILE, existingMap(), firebaseStatus(), fs, http, mergeEnvLocal(), os (+8 more)

### Community 56 - "accounts.ts"
Cohesion: 0.08
Nodes (47): Account, accounts, addHolding(), addTrustline(), ADMIN_EMAILS, claimListingTokens(), claimPendingDividend(), creditCash() (+39 more)

### Community 57 - "12. KYC Nativo con Backend de Administración"
Cohesion: 0.33
Nodes (6): 12. KYC Nativo con Backend de Administración, Datos Capturados por Tipo de Usuario:, Datos On-Chain (Smart Contract):, Flujo Completo del KYC:, Lista GAFI Hardcodeada:, Panel de Administración (Backend):

### Community 58 - "14. Integraciones de Pago — Especificación de Mocks"
Cohesion: 0.33
Nodes (6): 14. Integraciones de Pago — Especificación de Mocks, Mock: Cross-Chain Bridge (Simula Circle CCTP V2), Mock: On-Ramp ARS → USDC (Simula Anclap/Alfred Pay), Mock: On-Ramp USD/EUR → USDC (Simula MoonPay/Ramp), Mock: Oráculo Climático (Seguro Paramétrico), Mock: Oráculo de Precios Commodities

### Community 59 - "fractachain-core"
Cohesion: 0.33
Nodes (6): forward-contract, fractachain-core, fractachain-licitacion, issuance-factory, stock-vault, warrant-vault

### Community 60 - "Guía de Despliegue en Railway - Fractachain"
Cohesion: 0.33
Nodes (5): 1. Servicio Backend (API Express + TypeScript), 2. Servicio Frontend (Next.js 14 App Router), 3. Despliegue con Docker (Opcional), 4. Estado de los Smart Contracts en Soroban (WASM), Guía de Despliegue en Railway - Fractachain

### Community 61 - "Migration: Horizon to RPC"
Cohesion: 0.40
Nodes (5): Account Loading, Historical Data, Migration: Horizon to RPC, Streaming Replacement, Transaction Submission

### Community 62 - "Best Practices"
Cohesion: 0.40
Nodes (5): Best Practices, Error Handling, Rate Limiting, Use Horizon for:, Use RPC for:

### Community 63 - "Historical Data Access"
Cohesion: 0.40
Nodes (5): Data Lake, Galexie, Historical Data Access, Hubble (BigQuery), Third-Party Indexers

### Community 64 - "Data & Analytics"
Cohesion: 0.40
Nodes (5): Block Explorers, Data & Analytics, Data Documentation Hub, Data Indexers, Historical Data & Analytics

### Community 65 - "Learning Resources"
Cohesion: 0.40
Nodes (5): Blog Posts & Guides, Developer Tools, Learning Resources, Official Tutorials, Video Content

### Community 66 - "Community"
Cohesion: 0.40
Nodes (5): Builder Teams & Companies, Community, Developer Resources, Foundation, Key People to Follow

### Community 67 - "Zero-Knowledge Proofs (Status-Sensitive)"
Cohesion: 0.40
Nodes (5): Example Contracts, Protocol & Specifications, Proving Systems & Tooling, SDK Documentation, Zero-Knowledge Proofs (Status-Sensitive)

### Community 68 - "Data Indexing"
Cohesion: 0.40
Nodes (5): Data Indexing, Goldsky, Mercury, SubQuery, Zephyr VM

### Community 69 - "logo-upload-server.js"
Cohesion: 0.28
Nodes (8): extOf(), fs, http, parseMultipart(), path, PORT, PUBLIC_DIR, server

### Community 70 - "orderbook.ts"
Cohesion: 0.17
Nodes (20): tradeableMarkets(), cashBalance(), tokenBalance(), BookOrder, cancelOrder(), DATA, getBook(), levels() (+12 more)

### Community 71 - "4.1. Especificación del Contrato `FractachainLicitacion`"
Cohesion: 0.40
Nodes (5): 4.1. Especificación del Contrato `FractachainLicitacion`, 4.2. ¿Por qué Libro de Órdenes Exclusivo (Orderbook) y Prohibición Estricta de AMM?, 4. Arquitectura de Smart Contracts (Soroban), Estructuras de Datos:, Reglas de Negocio del Contrato:

### Community 72 - "Stellar RPC"
Cohesion: 0.50
Nodes (4): Endpoints, RPC Limitations, Setup, Stellar RPC

### Community 73 - "Cross-Chain"
Cohesion: 0.50
Nodes (4): Allbridge Core, Axelar, Cross-Chain, LayerZero

### Community 74 - "CLI Tools"
Cohesion: 0.50
Nodes (4): CLI Tools, Quickstart (Local Development), Scaffold Stellar, Stellar CLI

### Community 75 - "Contract Libraries & Tools"
Cohesion: 0.50
Nodes (4): Contract Libraries & Tools, Developer Tools, OpenZeppelin Stellar Contracts, Smart Account SDKs

### Community 76 - "Protocol & Governance"
Cohesion: 0.50
Nodes (4): Key SEP Standards, Network Upgrades, Protocol & Governance, Stellar Protocol

### Community 77 - "Testing"
Cohesion: 0.50
Nodes (4): Local Development, Test Networks, Testing, Testing Guides

### Community 78 - "11. OPA y Squeeze-Out — Umbrales Confirmados por Ley Argentina"
Cohesion: 0.50
Nodes (4): 11. OPA y Squeeze-Out — Umbrales Confirmados por Ley Argentina, Flujo Completo On-Chain:, OPA Obligatoria: 50% (Art. 87, Ley 26.831), Squeeze-Out (Privatización): 95% (Régimen de Participaciones Residuales, Ley 26.831)

### Community 79 - "12.5. Arquitectura de Billeteras: Modalidad Dual de Custodia"
Cohesion: 0.50
Nodes (4): 12.5. Arquitectura de Billeteras: Modalidad Dual de Custodia, 1. Modalidad A: Custodia Gestionada por el Backend (Web2 / Fintech Flow), 2. Modalidad B: Auto-Custodia con Frase Semilla (Web3 / Sovereign Flow), Matriz Comparativa para el Usuario:

### Community 80 - "16. Plan de Verificación"
Cohesion: 0.50
Nodes (4): 16. Plan de Verificación, Contratos Soroban, Flujo de prueba integral, Frontend

### Community 81 - "Env"
Cohesion: 0.09
Nodes (25): pct_bps(), pct_bps_ceil(), prorated_interest(), require_divisible(), accrual_stops_at_the_day_ceiling(), divisible_amounts_pass_and_remainders_do_not(), huge_principal_at_max_rate_does_not_overflow(), indivisible_amount_is_rejected() (+17 more)

### Community 82 - "Official Documentation"
Cohesion: 0.67
Nodes (3): API References, Official Documentation, Stellar Developer Docs

### Community 83 - "Stablecoins on Stellar"
Cohesion: 0.67
Nodes (3): Asset Discovery, Major Stablecoins, Stablecoins on Stellar

### Community 84 - "SDKs"
Cohesion: 0.67
Nodes (3): Client SDKs (Application Development), Contract SDK (Rust), SDKs

### Community 85 - "AppGate.tsx"
Cohesion: 0.36
Nodes (5): AdminGate(), AppGate(), GATED, OnboardingGuard(), nextOnboardingPath()

### Community 87 - "warrant-vault/src/test.rs"
Cohesion: 0.19
Nodes (21): a_funded_loan_cannot_be_funded_twice(), a_non_allowlisted_payment_token_is_rejected(), a_stale_collateral_attestation_cannot_be_funded(), an_unaccredited_warrantera_is_rejected(), an_unbounded_interest_rate_is_rejected(), an_unfunded_vault_cannot_be_liquidated(), double_initialization_is_rejected(), Fixture (+13 more)

### Community 89 - "issuance-factory/src/test.rs"
Cohesion: 0.21
Nodes (19): a_non_admin_cannot_accredit_a_warrantera(), a_non_admin_cannot_administer_the_registry(), admin_can_be_rotated(), admin_registers_product_with_usdc(), double_initialization_is_rejected(), Fixture, negative_prices_are_rejected(), only_configured_sacs_count_as_payment_assets() (+11 more)

### Community 90 - "stock-vault/src/test.rs"
Cohesion: 0.20
Nodes (26): a_holder_minted_after_a_dividend_cannot_touch_it(), a_stale_proof_of_reserve_blocks_minting(), attest(), cannot_mint_before_any_attestation(), cannot_mint_beyond_attested_custody(), claiming_twice_pays_only_once(), custodian_cannot_be_the_por_oracle(), dividends_split_pro_rata_between_existing_holders() (+18 more)

### Community 95 - "Standards, Ecosystem, and Resources"
Cohesion: 0.67
Nodes (3): Related skills, Standards, Ecosystem, and Resources, When to use this skill

## Knowledge Gaps
- **630 isolated node(s):** `name`, `version`, `description`, `main`, `build` (+625 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 683 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Stellar Ecosystem` connect `Stellar Ecosystem` to `Block Explorers`, `Community Examples`, `Cross-Chain`, `Developer Tools`, `standards/SKILL.md`, `Funding Programs`, `Browser Extensions`, `DeFi Protocols`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `Curated Resources` connect `Curated Resources` to `Data & Analytics`, `Learning Resources`, `Community`, `Zero-Knowledge Proofs (Status-Sensitive)`, `CLI Tools`, `Contract Libraries & Tools`, `standards/SKILL.md`, `Protocol & Governance`, `Testing`, `Official Documentation`, `Stablecoins on Stellar`, `SDKs`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Why does `Stellar Data: RPC + Horizon` connect `Stellar Data: RPC + Horizon` to `Stellar RPC`, `Horizon API (Legacy)`, `Migration: Horizon to RPC`, `Best Practices`, `Historical Data Access`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _630 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Env` be split into smaller, more focused modules?**
  _Cohesion score 0.0772520716385993 - nodes in this community are weakly interconnected._
- **Should `Stellar Assets, Trustlines, and SAC` be split into smaller, more focused modules?**
  _Cohesion score 0.046511627906976744 - nodes in this community are weakly interconnected._
- **Should `Stellar dApp / Frontend` be split into smaller, more focused modules?**
  _Cohesion score 0.05121951219512195 - nodes in this community are weakly interconnected._