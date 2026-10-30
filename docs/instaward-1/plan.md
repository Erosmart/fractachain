# Instaward 1 — implementation plan (SOW → code)

Source: `FractaChain_Instaward1_SOW.pdf` (30-day scope, testnet only). This file
maps every SOW line to code and fixes the contracts between workstreams.

## Deliverable 1 — Tender settled in USDC

| SOW item                                                                                                                                                                                                                                                                                                   | Where                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Circle USDC SAC on testnet (`CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`, issuer `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`) registered with `set_payment_asset(PaymentKind::USDC)` in the factory and as the tender's payment token (`__constructor` / `set_payment_token`) | deploy script (`scripts/stellar`), API config `USDC_MODE=circle`                                   |
| Normalize decimals (7 in the SAC) and recalculate `price_per_unit`                                                                                                                                                                                                                                         | API reads `decimals()` from the payment token contract once and converts with it (no hard-coded 7) |
| contribute / finalize / refund invoke the contract with USDC                                                                                                                                                                                                                                               | API (`OfferingService`, `LicitacionContract`)                                                      |
| Sandbox path (`cashUsdc`) removed from tenders                                                                                                                                                                                                                                                             | no off-chain contribution path; `cashUsdc` out of public account, portfolio and UI                 |
| Rust tests with `soroban_sdk::testutils` and a test SAC token                                                                                                                                                                                                                                              | `contracts/fractachain-licitacion/src/test.rs` (USDC, 7 decimals)                                  |
| Local network fallback                                                                                                                                                                                                                                                                                     | `USDC_MODE=team`: team-issued test asset + its SAC (same flow)                                     |

## Deliverable 2 — Non-custodial signing with Freighter

`POST /api/tx/build` → unsigned, simulated and prepared XDR; the investor signs in
Freighter; `POST /api/tx/submit` → validated, sent, polled. Custodial accounts keep
the server-signed endpoints as the fallback.

## Deliverable 3 — Chain-connected frontend

Read-only `GET /api/chain/*` endpoints that only call contracts / Horizon (no
database values), every payload carries the contract ID and its Stellar Expert
link. Tender page and portfolio, `/forwards`, `/warrants`, `/stocks` (read-only,
writes marked "Próximamente"), one transaction component, correct asset labels.

## QA, environment, evidence

- One command deploys the 5 contracts, configures USDC and seeds test instances:
  `npm run stellar:deploy -- --network local|testnet`.
- Demo USDC pool (Circle testnet USDC bought on the testnet DEX with Friendbot XLM,
  or from Circle's faucet) and a reviewer funding helper (UI button + CLI).
- CI: `cargo test` + E2E (build → sign → submit, contribute / finalize / refund) on a
  local Stellar network (`stellar/quickstart --local`).
- Completion package: `docs/instaward-1/verification.md`, `evidence.md` (tx hashes),
  demo-video script.

---

## API contract (shared by every workstream)

Types live in `packages/shared/src/index.d.ts` (section "Instaward 1").

### Transactions (Deliverable 2)

`POST /api/tx/build` (session, CSRF, self-custody accounts only)

```jsonc
// request — one of
{ "action": "contribute", "listingId": "IPO-…", "amount": 20 }   // amount in payment-asset units
{ "action": "refund", "listingId": "IPO-…" }
{ "action": "finalize", "listingId": "IPO-…" }                   // permissionless close
{ "action": "usdc_trustline" }                                   // classic changeTrust to the platform USDC
// response: TxBuildResult
{
  "buildId": "txb_…", "xdr": "AAAA…", "action": "contribute",
  "network": "testnet", "networkPassphrase": "Test SDF Network ; September 2015",
  "source": "G…investor", "contractId": "C…", "function": "contribute",
  "args": [{ "name": "buyer", "value": "G…" }, { "name": "payment_amount", "value": "200000000" }],
  "asset": { "code": "USDC", "issuer": "G…", "contractId": "C…", "decimals": 7 },
  "fee": "123456", "expiresAt": "2026-10-30T12:05:00.000Z"
}
```

`POST /api/tx/submit` `{ "buildId", "signedXdr" }` → `TxSubmitResult`

```jsonc
{
  "hash": "…",
  "status": "SUCCESS",
  "ledger": 123,
  "explorer": "https://stellar.expert/explorer/testnet/tx/…",
  "action": "contribute",
  "listing": {/* refreshed listing, when relevant */},
}
```

Validation (all server-side): build exists, belongs to the caller, not expired, single
use (persisted); the signed envelope parses with the server's passphrase; its hash equals
the built transaction's hash (same contract, function, args, footprint, fee, sequence,
time bounds); it carries a valid signature of the investor's key; the hash was never
submitted before. Then `sendTransaction` + `getTransaction` polling. Error `code`s:
`TX_EXPIRED`, `TX_MISMATCH`, `TX_ALREADY_SUBMITTED`, `TX_BAD_SIGNATURE` (wrong network or
signer), `TX_FAILED`, `UPSTREAM_FAILED`.

`GET /api/tx/:hash` → `{ hash, status, ledger?, explorer }` (status poll).

### Chain reads (Deliverable 3)

All public, `Cache-Control: no-store`, cached server-side ≤ 8 s.

- `GET /api/chain/network` → `ChainNetwork` (network, passphrase, RPC/Horizon/explorer
  URLs, USDC asset, deployed contract IDs incl. seeded forward/warrant/stock instances).
- `GET /api/chain/tenders/:contractId?holder=G…` → `ChainTender` (get_state,
  get_total_raised, get_price_per_unit, get_payment_token, get_legal_info, get_caps,
  get_deadline, get_fiduciary, proceeds_withdrawn; holder: get_rwa_balance + payment
  token balance).
- `GET /api/chain/portfolio/:address` → `ChainPortfolio` (XLM + USDC balances, every
  known tender's get_rwa_balance for the address, with contract IDs).
- `GET /api/chain/forwards` · `/warrants` · `/stocks` → read-only views of the seeded
  instances (forward: get_state, get_total_kilos, get_crop_name, get_parties,
  get_position, get_payment_token; warrant: get_status, get_terms, get_loan_amount,
  get_producer, get_payment_token; stock vault: get_metadata, get_unclaimed_pool,
  is_mint_paused, get_mint_proof, get_payment_token, and with `?holder=` get_balance +
  get_claimable).

Every value object includes `contractId` and `explorer`; amounts are decimal numbers
already normalized with the token's `decimals()`.

### Deployment file (written by `stellar:deploy`, read by the API)

`TestnetDeployment` (`packages/api/src/infrastructure/stellar/DeploymentRegistry.ts`)
gains `usdc { mode, code, issuer, sac, decimals }`, `usdcPool` (public key) and
`seeded { tenders[], forwards[], warrants[], stockVaults[] }`. Secrets (deployer,
issuer, pool…) never go in this file: they go to the env file the script prints.

### Funding helper

`POST /api/wallet/usdc/fund` (existing route) sends test USDC to the signed-in
investor: from the demo pool in `circle` mode, minted by the team issuer in `team`
mode. CLI: `npm run stellar:fund -w @fractachain/api -- <G…> [amount]`.

## Ownership

| Workstream                 | Owns                                                                                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| G1 backend tx + USDC       | `/api/tx/*`, decimals, Circle/team USDC config, demo pool + funding helper, sandbox removal, tender getters in the contract (+ Rust USDC tests) |
| G2 backend chain reads     | `/api/chain/*`                                                                                                                                  |
| H infra + QA               | `scripts/stellar/*` one-command deploy + seeding + pool funding, CI local network + E2E, evidence runner                                        |
| W1 web tender/portfolio/tx | tender page, portfolio, unified TxStatus component, Freighter detection, asset labels                                                           |
| W2 web read-only views     | `/forwards`, `/warrants`, `/stocks`                                                                                                             |
