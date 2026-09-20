# Graph Report - fractachain  (2026-09-17)

## Corpus Check
- 94 files · ~81,976 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1032 nodes · 1455 edges · 94 communities (83 shown, 5 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 58 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Env
- Stellar Assets, Trustlines, and SAC
- Stellar dApp / Frontend
- x402 — Paid APIs + Agent Buyer Clients
- CCTP V2 on Stellar — native USDC between chains
- frontend/package.json
- kyc.rs
- test_runner.ts
- Development Patterns
- Env
- Vulnerability classes
- Developer Tools
- server.ts
- compilerOptions
- SEP / CAP Standards Reference
- ForwardContract
- IssuanceFactoryContract
- backend/package.json
- api.ts
- lucide-react
- react
- WarrantVaultContract
- kyc_review.ts
- Fractachain — Master Architecture & Technical Blueprint
- 13. Tokenización de Acciones del Merval y Productos en Expansión
- DeFi Protocols
- Zero-Knowledge Proofs & Privacy
- Stellar Ecosystem
- 1.5. Marco Regulatorio Argentino Integrado (CNV, UIF, BCRA y Legislación Nacional)
- useAuth
- Stellar Smart Contracts
- compilerOptions
- setup
- AuthContext.tsx
- Testing
- Block Explorers
- 7.1. Mensajes Clave y Estructura de la Landing Page
- Common Operations
- Key Methods
- Community Examples
- payment_gateway.ts
- 5.1. Rieles de Fondeo Internacional
- layout.tsx
- Stellar Data: RPC + Horizon
- Funding Programs
- Curated Resources
- token
- 3. Las 3 Ramas de Negocio de Fractachain
- [id]/page.tsx
- Horizon API (Legacy)
- Stellar Raven
- Unit testing
- Browser Extensions
- Wallets
- devDependencies
- firebase_auth.ts
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
- scripts
- stocks.ts
- fiat_oracle.ts
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
- opa/page.tsx
- Official Documentation
- Stablecoins on Stellar
- SDKs
- Standards, Ecosystem, and Resources
- stellar script
- next.config.js
- next-env.d.ts

## God Nodes (most connected - your core abstractions)
1. `FractachainLicitacionContract` - 23 edges
2. `react` - 23 edges
3. `lucide-react` - 20 edges
4. `Fractachain — Master Architecture & Technical Blueprint` - 20 edges
5. `token_client()` - 19 edges
6. `require_positive()` - 18 edges
7. `Development Patterns` - 17 edges
8. `Curated Resources` - 17 edges
9. `compilerOptions` - 16 edges
10. `bump_instance()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `check_control_threshold()` --calls--> `set_voting_rights()`  [INFERRED]
  contracts/fractachain-licitacion/src/opa.rs → contracts/fractachain-licitacion/src/kyc.rs
- `forward-contract` --depends_on--> `fractachain-core`  [EXTRACTED]
  contracts/forward-contract/Cargo.toml → contracts/fractachain-core/Cargo.toml
- `fractachain-licitacion` --depends_on--> `fractachain-core`  [EXTRACTED]
  contracts/fractachain-licitacion/Cargo.toml → contracts/fractachain-core/Cargo.toml
- `issuance-factory` --depends_on--> `fractachain-core`  [EXTRACTED]
  contracts/issuance-factory/Cargo.toml → contracts/fractachain-core/Cargo.toml
- `stock-vault` --depends_on--> `fractachain-core`  [EXTRACTED]
  contracts/stock-vault/Cargo.toml → contracts/fractachain-core/Cargo.toml

## Import Cycles
- None detected.

## Communities (94 total, 5 thin omitted)

### Community 0 - "Env"
Cohesion: 0.11
Nodes (30): Client, bump_instance(), prorated_interest(), require_divisible(), require_positive(), Address, Env, token_client() (+22 more)

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
Cohesion: 0.06
Nodes (35): dependencies, clsx, firebase, lucide-react, next, @next/swc-linux-x64-gnu, react, react-dom (+27 more)

### Community 6 - "kyc.rs"
Cohesion: 0.18
Nodes (24): get_investor_info(), has_voting_rights(), InvestorInfo, InvestorType, is_argentina_business_hours(), is_gafi_blacklisted(), is_investor_verified(), KycKey (+16 more)

### Community 7 - "test_runner.ts"
Cohesion: 0.09
Nodes (21): authenticateWithGoogle(), AuthUser, DEMO_USER, getUserByToken(), revokeSession(), sessions, usersByEmail, arsOnramp (+13 more)

### Community 8 - "Development Patterns"
Cohesion: 0.09
Nodes (23): Auth trees and cross-contract propagation, Authorization, Choosing storage — decision tree, Constructors, Contract size, Cross-contract calls, Custom accounts (`__check_auth`), Data types (+15 more)

### Community 9 - "Env"
Cohesion: 0.28
Nodes (12): meta(), payment_token(), require_admin(), Address, BytesN, Env, String, set_meta() (+4 more)

### Community 10 - "Vulnerability classes"
Cohesion: 0.10
Nodes (21): 10. Resource exhaustion / fee griefing, 11. Custom account (`__check_auth`) pitfalls, 1. Missing authorization, 2. Auth replay through middleware (missing outer `require_auth`), 3. Reinitialization attacks, 4. Arbitrary contract calls, 5. Integer overflow/underflow, 6. Storage key collisions (+13 more)

### Community 11 - "Developer Tools"
Cohesion: 0.11
Nodes (19): AI & MCP Tools, CLI & SDKs, Contract Libraries, Data Indexing, Developer Tools, Goldsky, Mercury, OpenZeppelin Relayer (+11 more)

### Community 12 - "server.ts"
Cohesion: 0.16
Nodes (16): bindContract(), createProduct(), DEFAULT_TESTNET_ASSETS, getPaymentAssets(), IssuanceProduct, listProducts(), PaymentKind, ProductKind (+8 more)

### Community 13 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 14 - "SEP / CAP Standards Reference"
Cohesion: 0.11
Nodes (18): Anchor and fiat integration, Auth, identity, and metadata, Contracts and token interfaces, Frequently used contract capabilities, High-value CAPs for smart contract developers, High-value SEPs for app developers, I am building a fungible token, I am building a smart-wallet flow (+10 more)

### Community 15 - "ForwardContract"
Cohesion: 0.27
Nodes (7): ForwardContract, ForwardKey, ForwardState, require_state(), Address, Env, String

### Community 16 - "IssuanceFactoryContract"
Cohesion: 0.31
Nodes (9): FactoryKey, IssuanceFactoryContract, PaymentKind, Product, ProductKind, require_admin(), Address, Env (+1 more)

### Community 17 - "backend/package.json"
Cohesion: 0.12
Nodes (16): dependencies, cors, dotenv, express, description, @types/node, typescript, main (+8 more)

### Community 18 - "api.ts"
Cohesion: 0.18
Nodes (9): KIND_HELP, INITIAL_MOCK_KYC, DEFAULT_STOCKS, API_BASE_URL, IssuanceProduct, KycRecord, PaymentKind, ProductKind (+1 more)

### Community 19 - "lucide-react"
Cohesion: 0.12
Nodes (8): ForwardContract, MOCK_FORWARDS, INITIAL_ASKS, INITIAL_BIDS, OrderBookItem, MOCK_WARRANTS, WarrantRecord, lucide-react

### Community 20 - "react"
Cohesion: 0.19
Nodes (10): ContractData, ContractInspectorBanner(), CONTRACTS, DynamicHeroText(), SECTORS, LiquidityFirstBanner(), Partner, PARTNERS (+2 more)

### Community 21 - "WarrantVaultContract"
Cohesion: 0.25
Nodes (6): Address, BytesN, Env, WarrantKey, WarrantStatus, WarrantVaultContract

### Community 22 - "kyc_review.ts"
Cohesion: 0.16
Nodes (13): approveKyc(), GAFI_BLACKLIST, getAllKycRecords(), getKycById(), InvestorType, isArgentinaBusinessHours(), isGafiBlacklisted(), kycDatabase (+5 more)

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

### Community 29 - "useAuth"
Cohesion: 0.32
Nodes (8): LoginPage(), GAFI_HIGH_RISK_COUNTRIES, RegisterPage(), MOCK_MNEMONIC, WalletPage(), GoogleLoginButton(), GoogleLoginButtonProps, useAuth()

### Community 30 - "Stellar Smart Contracts"
Cohesion: 0.18
Nodes (11): Before mainnet, Build, deploy, invoke, Contract anatomy, Documentation, Minimal test, Platform constraints, Project setup, Related skills (+3 more)

### Community 31 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, module, outDir, rootDir, skipLibCheck, strict (+2 more)

### Community 32 - "setup"
Cohesion: 0.35
Nodes (10): admin_can_set_price_before_funding(), contribute_mints_rwa_and_secondary_works(), failed_issuance_refunds_and_burns_rwa(), kyc(), Address, Env, setup(), squeeze_out_pays_minority() (+2 more)

### Community 33 - "AuthContext.tsx"
Cohesion: 0.25
Nodes (9): AuthContext, AuthContextType, AuthProvider(), User, auth, firebaseConfig, googleProvider, loginWithFirebaseGoogle() (+1 more)

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

### Community 40 - "payment_gateway.ts"
Cohesion: 0.22
Nodes (8): ArisOnRampResponse, CctpBridgeResponse, FiatOnRampResponse, NearIntentsResponse, processArsOnRamp(), processCctpBridge(), processFiatOnRamp(), processNearIntentsSwap()

### Community 41 - "5.1. Rieles de Fondeo Internacional"
Cohesion: 0.22
Nodes (9): 1. Riel Cripto-Institucional: Circle CCTP V2 (Cross-Chain Transfer Protocol), 2. Riel Multiactivo Global: NEAR Intents ("Deposit from Any Chain / Any Asset"), 3. Riel Fiat Internacional: Tarjetas de Crédito, Débito y Billeteras Digitales, 4. Riel Bancario Directo (SEPA y ACH):, 5.1. Rieles de Fondeo Internacional, 5.2. Onboarding y KYC Internacional (Pasaportes de más de 220 Países), 5.3. Rampa Fiat Nacional (Argentina) y Marco CNV, 5. Rampa Fiat, Fondeo Global (USA, Europa, Asia) y Cumplimiento Regulatorio (+1 more)

### Community 42 - "layout.tsx"
Cohesion: 0.32
Nodes (4): metadata, Footer(), Navbar(), next

### Community 43 - "Stellar Data: RPC + Horizon"
Cohesion: 0.29
Nodes (7): Environment-Based Setup, Network Configuration, Overview, Read the file that matches the task, Related skills, Stellar Data: RPC + Horizon, When to use this skill

### Community 45 - "Funding Programs"
Cohesion: 0.29
Nodes (7): Funding Programs, Official Directories, Project Directories, SCF Project Tracker, Soroban Audit Bank, Stellar Community Fund (SCF), Stellar Ecosystem Directory

### Community 46 - "Curated Resources"
Cohesion: 0.29
Nodes (7): Curated Resources, Ecosystem Projects, Example Repositories, Infrastructure, Project Directories & Funding, RPC Providers, Security

### Community 47 - "token"
Cohesion: 0.43
Nodes (6): dual_confirm_releases_escrow(), non_delivery_refunds_buyer(), rollover_keeps_active_then_delivery_works(), Address, Env, token()

### Community 48 - "3. Las 3 Ramas de Negocio de Fractachain"
Cohesion: 0.29
Nodes (7): 3.1. Rama 1: Forwards Agrícolas de Consumo, 3.2. Rama 2: Grado de Inversión (Mini-Bolsa PyME y Agro), 3.3. Rama 3: Crédito Colateralizado por Inventario (Warrants Tokenizados), 3.4. Rama 4: Staking y Préstamos Colateralizados con Tokens RWA (DeFi Institucional en Soroban), 3. Las 3 Ramas de Negocio de Fractachain, A. Staking de Tokens RWA (`RWAStakingVault.wasm`), B. Préstamos en USDC Colateralizados con Tokens RWA (`RWALendingVault.wasm`)

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
Cohesion: 0.33
Nodes (6): Albedo, Browser Extensions, Freighter, Hana Wallet, Rabet, xBull

### Community 54 - "Wallets"
Cohesion: 0.33
Nodes (6): Beans, LOBSTR, Mobile Wallets, Multi-Wallet Integration, Stellar Wallets Kit, Wallets

### Community 55 - "devDependencies"
Cohesion: 0.33
Nodes (6): devDependencies, ts-node-dev, @types/cors, @types/express, @types/node, typescript

### Community 56 - "firebase_auth.ts"
Cohesion: 0.33
Nodes (5): authenticateWithFirebase(), FirebaseUserProfile, getFirebaseUserByToken(), sessions, usersByUid

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

### Community 68 - "scripts"
Cohesion: 0.40
Nodes (5): scripts, build, dev, start, test

### Community 69 - "stocks.ts"
Cohesion: 0.40
Nodes (4): getMervalStocks(), getProofOfReserveAudit(), MERVAL_CATALOG, MervalStock

### Community 70 - "fiat_oracle.ts"
Cohesion: 0.40
Nodes (4): COMMODITY_PRICES, CommodityPrice, getAllCommodityPrices(), getCommodityPrice()

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

### Community 82 - "Official Documentation"
Cohesion: 0.67
Nodes (3): API References, Official Documentation, Stellar Developer Docs

### Community 83 - "Stablecoins on Stellar"
Cohesion: 0.67
Nodes (3): Asset Discovery, Major Stablecoins, Stablecoins on Stellar

### Community 84 - "SDKs"
Cohesion: 0.67
Nodes (3): Client SDKs (Application Development), Contract SDK (Rust), SDKs

### Community 85 - "Standards, Ecosystem, and Resources"
Cohesion: 0.67
Nodes (3): Related skills, Standards, Ecosystem, and Resources, When to use this skill

## Knowledge Gaps
- **567 isolated node(s):** `name`, `version`, `description`, `main`, `build` (+562 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 611 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Stellar Ecosystem` connect `Stellar Ecosystem` to `Block Explorers`, `Community Examples`, `Cross-Chain`, `Developer Tools`, `standards/SKILL.md`, `Funding Programs`, `Wallets`, `DeFi Protocols`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Why does `Curated Resources` connect `Curated Resources` to `Data & Analytics`, `Learning Resources`, `Community`, `Zero-Knowledge Proofs (Status-Sensitive)`, `CLI Tools`, `Contract Libraries & Tools`, `standards/SKILL.md`, `Protocol & Governance`, `Testing`, `Official Documentation`, `Stablecoins on Stellar`, `SDKs`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Why does `Stellar Data: RPC + Horizon` connect `Stellar Data: RPC + Horizon` to `Stellar RPC`, `Horizon API (Legacy)`, `Migration: Horizon to RPC`, `Best Practices`, `Historical Data Access`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _567 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Env` be split into smaller, more focused modules?**
  _Cohesion score 0.11313131313131314 - nodes in this community are weakly interconnected._
- **Should `Stellar Assets, Trustlines, and SAC` be split into smaller, more focused modules?**
  _Cohesion score 0.046511627906976744 - nodes in this community are weakly interconnected._
- **Should `Stellar dApp / Frontend` be split into smaller, more focused modules?**
  _Cohesion score 0.05121951219512195 - nodes in this community are weakly interconnected._