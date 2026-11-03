# Instaward 1 — USDC settlement, Freighter signing, chain-connected frontend

30-day SOW (testnet only). Plan and API contracts: [`plan.md`](plan.md) · evidence:
[`evidence.md`](evidence.md) · reviewer guide: [`verification.md`](verification.md).

## Status (per the SOW's descoping rule)

| Deliverable                                                                                                                                                                                                                     | Status                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Tender settled in USDC (Circle's SAC in factory + tender, decimals, contribute/finalize/refund in USDC, sandbox path removed, Rust tests with a test SAC)                                                                    | **Delivered**                                                                                                                                                                              |
| 2. Non-custodial signing (`/api/tx/build` + `/api/tx/submit`, simulation + preparation, Freighter wallet/network detection and signing, XDR validation, network/passphrase checks, resubmission prevention, custodial fallback) | **Delivered**                                                                                                                                                                              |
| 3(a) Tender page and portfolio read from the contracts, transaction states, Stellar Expert links, sandbox balances removed                                                                                                      | **Delivered**                                                                                                                                                                              |
| 3(b) Read-only `/forwards`, `/warrants`, `/stocks` over seeded instances, writes "coming soon"                                                                                                                                  | **Delivered**                                                                                                                                                                              |
| 3(c) Asset labels, unified transaction component, network/wallet/RPC errors                                                                                                                                                     | **Delivered**                                                                                                                                                                              |
| QA: one-command deploy, demo USDC pool + reviewer funding helper, E2E on a local network in CI, testnet run with tx hashes                                                                                                      | **Delivered** — `e2e-local` green on GitHub Actions ([run 41563459803](https://github.com/Erosmart/fractachain/actions/runs/41563459803), 18/18 checks) and the same E2E passed on testnet |
| Completion package: technical README, verification guide, tx-hash evidence, before/after screenshots                                                                                                                            | **Delivered**                                                                                                                                                                              |
| Demo video, public URL, merged PR                                                                                                                                                                                               | **Team action** (needs Freighter + a person, the Railway project, the maintainers' merge) — see [`evidence.md`](evidence.md)                                                               |

## How it works

```
Investor (Freighter)          Web (Astro + React)                 API                          Stellar testnet
        │  login: SEP-53 signature ─▶ /api/auth/wallet ───────────▶ verify signature
        │                      Tender page ── GET /api/chain/tenders/:id ─▶ simulate get_* ───▶ Soroban RPC
        │                      Subscribe ─── POST /api/tx/build ──▶ build + simulate + prepare
        │◀── signTransaction(xdr, Testnet) ─┘   (unsigned XDR, buildId)
        │── signed XDR ──────▶ POST /api/tx/submit ─▶ same hash? investor signature? this network?
        │                                            never sent before? → sendTransaction + poll ─▶ contribute()
        │                      Panel: "Confirmada en Stellar" + Stellar Expert link ◀── hash
```

- **USDC** (`packages/api/src/infrastructure/stellar/UsdcSupply.ts`): `USDC_MODE=circle`
  uses Circle's testnet USDC SAC and pays reviewers from the demo pool;
  `USDC_MODE=team` issues a test USDC (local network, or fallback if Circle's is
  unavailable — the tender is token-agnostic). Amounts use the token's `decimals()`.
- **Signing** (`packages/api/src/application/tx/TxService.ts`): builds are persisted,
  single use and short-lived; the submitted envelope must hash to the built transaction
  (contract, function, args, footprint, fee, sequence, time bounds) and carry a valid
  signature of the investor for the server's network passphrase.
- **Chain reads** (`packages/api/src/application/chain/ChainReadService.ts`): read-only
  simulations of contract getters + Horizon balances; never database values; each
  payload carries the contract ID, Stellar Expert link and functions read; 8 s cache
  dropped after every confirmed transaction.
- **Web** (`apps/web/src/core/wallet/TxRunner.ts`, `apps/web/src/components/tx/*`): one
  flow for every on-chain action, typed wallet / server / network errors, custodial
  fallback through the same panel.
- **Contracts**: tender getters `get_caps()` / `get_deadline()`; USDC tests in
  `contracts/fractachain-licitacion/src/test_usdc.rs`.

## Run it

```bash
npm ci
npm run contracts:build                                   # WASM (wasm32v1-none)
npm run stellar:deploy -- --network testnet \             # 5 contracts, USDC, seeded instances
  --out packages/api/.local-data/testnet/deployment.json
npm run stellar:fund-pool -- --network testnet --usdc 2000   # demo USDC pool (Circle, via the testnet DEX)
# start the app with the env file the deploy printed (STELLAR_DEPLOYMENT_FILE, USDC_MODE,
# STELLAR_USDC_POOL_SECRET, …), then:
npm run stellar:e2e -- --network testnet --api http://localhost:3000 --evidence evidence.md
npm run stellar:fund -- G… 100                            # reviewer funding helper (CLI)
```

Details: [`deploy.md`](deploy.md) (commands, fallbacks, testnet reset) and
[`ci.md`](ci.md) (local network job).

## New configuration

| Variable                   | Meaning                                                                        |
| -------------------------- | ------------------------------------------------------------------------------ |
| `USDC_MODE`                | `circle` (Circle testnet USDC from the pool) or `team` (team-issued test USDC) |
| `STELLAR_USDC_POOL_SECRET` | demo pool account (circle mode)                                                |
| `STELLAR_USDC_POOL_GRANT`  | USDC per funding request (default 100)                                         |
| `STELLAR_DEPLOYMENT_FILE`  | deployment JSON written by `stellar:deploy`                                    |

## Tests

| Suite                                | Count        |
| ------------------------------------ | ------------ |
| Contracts (`cargo test`)             | 145          |
| API (`npm test -w @fractachain/api`) | 102          |
| Web (`npm test -w @fractachain/web`) | 131          |
| E2E testnet (`stellar:e2e`)          | 17/17 checks |
