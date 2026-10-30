# Instaward 1 — Evidence of completion (testnet)

Everything below is on **Stellar testnet** and can be opened on Stellar Expert.
Circle's testnet USDC: issuer
[`GBBD47IF…LFLA5`](https://stellar.expert/explorer/testnet/asset/USDC-GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5),
SAC [`CBIELTK6…DAMA`](https://stellar.expert/explorer/testnet/contract/CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA)
(7 decimals). Every hash below was checked on Horizon: the asset that moves is
`USDC` issued by `GBBD47IF…`, never XLM.

## Deployment (one command: `npm run stellar:deploy -- --network testnet`)

Public IDs: [`testnet-deployment.json`](testnet-deployment.json).

| Contract                                                                  | ID                                                                                                                          |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Issuance factory (USDC registered with `set_payment_asset`)               | [CCMSHEC5…R5I4B](https://stellar.expert/explorer/testnet/contract/CCMSHEC5YSLZ4PIWPP63TWMOEPNEPYHVC2O2INHACV7FWTB5G27R5I4B) |
| Stock vault (seeded)                                                      | [CAGICR4Z…D4TTE](https://stellar.expert/explorer/testnet/contract/CAGICR4ZGPIVJMEGFS7C65DGMFPQILOEHO4YX6XN4SQARZC4DKPD4TTE) |
| Tender (seeded, open)                                                     | [CCAGNVDO…UDVE](https://stellar.expert/explorer/testnet/contract/CCAGNVDORSFGBCYGOLUJQGKBQNG4MKBASBMPX436NKHCGIZNAXDZUDVE)  |
| Tender (seeded, refund demo)                                              | [CA5GV6ZM…DXNE](https://stellar.expert/explorer/testnet/contract/CA5GV6ZMX5WQJ5NGH65XJDGCQBPZ6QEYBZAKZEI3GEL46Y6CWOSMDXNE)  |
| Forward (seeded)                                                          | [CDPAQHXL…2QYS](https://stellar.expert/explorer/testnet/contract/CDPAQHXLVXUZZWVCBY4T6SUK7CVH52HA74WQHTIRNEV5ZE3BWMMQ2QYS)  |
| Warrant (seeded)                                                          | [CB2J3ZWY…DLZN](https://stellar.expert/explorer/testnet/contract/CB2J3ZWYB4TGMQODHFDCMSPEXOHVEO5HZBJM44CEDOJYB3RXYVUODLZN)  |
| Demo tender in the app ("Agropecuaria Las Lilas", 20 days)                | [CAPXJ6EF…66EVP](https://stellar.expert/explorer/testnet/contract/CAPXJ6EF33ZO7NQISY4K3MKCFFQUX4UWYMVFWZN2VT6QJUP5NQC66EVP) |
| Demo USDC pool (funds reviewers; 8,133.94 USDC bought on the testnet DEX) | [GBOMPS5X…4V4Y](https://stellar.expert/explorer/testnet/account/GBOMPS5XOZDK7IPJ5BIHSWP6OOUFJQW6LPTB6EPMF5D3ESJNO5CI4V4Y)   |

## Deliverable 1 — Tender settled in USDC

End-to-end run (`npm run stellar:e2e -- --network testnet`, 17/17 checks, full log in
[`evidence-e2e-testnet.md`](evidence-e2e-testnet.md)). Investor
[`GAUGBIUN…PASC`](https://stellar.expert/explorer/testnet/account/GAUGBIUNSCRO3X6ZIICJXKZ4QQV7HLL6ZDQLKGOSOYEL4QO2IASTPASC),
trustee [`GAKL5UNF…6B26`](https://stellar.expert/explorer/testnet/account/GAKL5UNFMDOHFJDMSYJGREDIJQ43UWWGR7L5GJ4SRIZBI4WAVHLR6B26).

| Operation                             | Transaction                                                                                                                   | What moves (Horizon)      |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| USDC `contribute`                     | [02de1a44…d8115](https://stellar.expert/explorer/testnet/tx/02de1a44076b920b85f4919e9869b9b0aabd6584e0d36df0c8915b558eb8d115) | 20 USDC investor → tender |
| `finalize` (soft cap reached)         | [c58843cb…7c802](https://stellar.expert/explorer/testnet/tx/c58843cb2d404156e18df5e4a7bdd20a7c8d1aeaa39622af89d2228d1d17c802) | 20 USDC tender → trustee  |
| `finalize` (soft cap missed → Failed) | [d2e70b2f…f2f4c](https://stellar.expert/explorer/testnet/tx/d2e70b2f103432d2c4e3a8374684752b7c192b3c76d7f9e7c56bc0b4447f2f4c) | state → Failed            |
| `refund`                              | [aff8e733…b26b0](https://stellar.expert/explorer/testnet/tx/aff8e733c52e760270b5372aec08b6fbfc7bc3cdc94b28cb08f501b335eb26b0) | 20 USDC tender → investor |

Contract tests (Rust, `soroban_sdk::testutils` + test SAC, 7 decimals):
`contracts/fractachain-licitacion/src/test_usdc.rs` — part of `cargo test` (145 tests).
Sandbox path removed: commit `78098c1` (no off-chain contribution, `cashUsdc` out of
accounts and portfolio).

## Deliverable 2 — Non-custodial signing with Freighter

Each transaction above has **one signature, by the investor's own `G…` address**
(source account on Horizon = the investor; the backend never holds that key).

Same flow driven from the web UI (wallet login with a SEP-53 signature, KYC, Freighter
signing) — investor
[`GDPBQLEQ…E7X2R`](https://stellar.expert/explorer/testnet/account/GDPBQLEQKGQCR3KVOAYJWOKSTZPGEPRWZIJJZXKDXJJXLSVAA7XE7X2R):

| Step                                                                | Transaction                                                                                                                   | Signer   |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------- |
| USDC trustline                                                      | [0b44dbda…9ff45](https://stellar.expert/explorer/testnet/tx/0b44dbda39a39b60a030fcbd2fba7e9934541691a237126380ba8bfa7759ff45) | investor |
| 100 USDC from the demo pool (reviewer funding helper, not a faucet) | [deb605dc…c55a1](https://stellar.expert/explorer/testnet/tx/deb605dcd6dc0a11e36abed24a4c0305c7466bc78f761a3f054eb7225a3c55a1) | pool     |
| `contribute` 20 USDC (tender CAPXJ6EF…)                             | [d698450c…36ce7](https://stellar.expert/explorer/testnet/tx/d698450ca5c042380c5135f3c7509e3008b09b17cd1322da631570d542836ce7) | investor |
| `contribute` 20 USDC (second subscription)                          | [55843161…3bfbb](https://stellar.expert/explorer/testnet/tx/55843161bd52a3bdc5fe0ee37528d9f3d7ffc069b07c3aabab10097d9053bfbb) | investor |

Security refusals verified against the running API (same E2E run):

| Attempt                                                  | Answer                     |
| -------------------------------------------------------- | -------------------------- |
| Signed XDR different from the built one (amount changed) | `422 TX_MISMATCH`          |
| Signed for another network (mainnet passphrase)          | `422 TX_BAD_SIGNATURE`     |
| Resubmitting an already relayed transaction              | `409 TX_ALREADY_SUBMITTED` |

Unit/HTTP tests: `packages/api/test/unit/tx-service.test.ts`, `test/http/tx.test.ts`
(expired, reused, tampered, wrong signer/network, custodial refused, failed and pending
transactions); web flow tests: `apps/web/test/txFlow.test.ts`.

## Deliverable 3 — Chain-connected frontend (optional) — delivered

- 3(a) Tender page and portfolio read from the contracts (`/api/chain/*`, Soroban RPC
  simulation + Horizon); each block names its contract and the functions read.
- 3(b) `/forwards`, `/warrants`, `/stocks`: read-only views of the seeded instances;
  writes disabled and marked "Próximamente · Instaward 3".
- 3(c) Asset labels from the payment token, one transaction component, wallet /
  network / RPC errors.

Before / after screenshots: [`screenshots/`](screenshots/) —
`before-portfolio.jpg` → `after-portfolio.jpg`, `before-forwards.jpg` →
`after-forwards.jpg`, `before-warrants.jpg` → `after-warrants.jpg`, `before-stocks.jpg`
→ `after-stocks.jpg`; tender: `after-tender.jpg`, `after-tender-review.jpg` (what the
investor signs), `after-tender-confirmed.jpg` (hash + Stellar Expert link).

## CI

`.github/workflows/ci.yml`: typecheck + tests + build + audit, `cargo test` (WASM built
first), Docker image, and `e2e-local` (stellar/quickstart `--local`: one-command deploy
→ API → the same E2E: contribute / finalize / refund in USDC + security refusals).

## Still to be produced by the team (needs accounts or permissions)

| Evidence                                                 | Why it is not here                                               | How                                                       |
| -------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------- |
| Demo video with the real Freighter extension             | needs a person and a browser with Freighter                      | [`demo-video.md`](demo-video.md)                          |
| Public demo URL                                          | needs the team's Railway project                                 | [`deploy.md`](deploy.md), `docs/guides/deploy-railway.md` |
| Merged PR + green GitHub Actions run (incl. `e2e-local`) | branch is local; write access to `Erosmart/fractachain` required | push `macroupdate`, open the PR, let CI run               |
