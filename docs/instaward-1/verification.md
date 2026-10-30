# Instaward 1 — Verification guide (for the Ambassador Chapter Lead)

No code needed. Each check is "open a link and look at one thing". Network: **Stellar
testnet**. Links go to Stellar Expert, a public block explorer.

## 1. The tender settles in USDC, not XLM (Deliverable 1)

1. Open the contribution
   [02de1a44…](https://stellar.expert/explorer/testnet/tx/02de1a44076b920b85f4919e9869b9b0aabd6584e0d36df0c8915b558eb8d115).
   In the operation, the transfer shows **USDC** with issuer **GBBD47IF…LFLA5** — that is
   Circle's testnet USDC. Amount: 20.
2. Open the close (`finalize`)
   [c58843cb…](https://stellar.expert/explorer/testnet/tx/c58843cb2d404156e18df5e4a7bdd20a7c8d1aeaa39622af89d2228d1d17c802).
   20 USDC go from the tender contract to the trustee account `GAKL5UNF…`.
3. Open the refund
   [aff8e733…](https://stellar.expert/explorer/testnet/tx/aff8e733c52e760270b5372aec08b6fbfc7bc3cdc94b28cb08f501b335eb26b0).
   20 USDC go from a tender that did not reach its minimum back to the investor.

✅ Present if the asset in the three is USDC (GBBD47IF…) and the amounts match.

## 2. The investor signs with their own wallet (Deliverable 2)

1. On any of the three transactions above, look at **Source account**: it is the
   investor `GAUGBIUN…PASC`, and the transaction has **one signature**. The platform
   did not sign for the investor.
2. Same check for the run done through the web app with Freighter:
   [d698450c…](https://stellar.expert/explorer/testnet/tx/d698450ca5c042380c5135f3c7509e3008b09b17cd1322da631570d542836ce7) —
   source `GDPBQLEQ…E7X2R` (the investor's wallet), invoking `contribute` on the tender
   `CAPXJ6EF…`, 20 USDC.
3. The investor got their test USDC from the demo pool, not a faucet:
   [deb605dc…](https://stellar.expert/explorer/testnet/tx/deb605dcd6dc0a11e36abed24a4c0305c7466bc78f761a3f054eb7225a3c55a1)
   (from `GBOMPS5X…`, the pool).
4. Watch the demo video (link in [`evidence.md`](evidence.md) once recorded): the
   Freighter popup asks the investor to sign.

✅ Present if the source of each investor transaction is the investor's `G…` address.

## 3. The screens read the chain (Deliverable 3, optional)

1. Compare the screenshots in [`screenshots/`](screenshots/): `before-*.jpg` show static
   or simulated data; `after-*.jpg` show values with "Leído del contrato C… ↗" and the
   functions read (`get_state()`, `get_total_raised()`…).
2. In the public demo (when published), on a tender page, click the contract ID: Stellar
   Expert opens the same contract and its balance matches the amount raised.
3. `/forwards`, `/warrants`, `/stocks` show contract IDs and disabled actions marked
   "Próximamente · Instaward 3".

✅ Present if every screen shows the contract it reads.

## 4. Try it yourself (public demo)

1. Install Freighter, switch it to **Testnet**, fund the account with
   `https://friendbot.stellar.org/?addr=<your G…>`.
2. In the demo: **Ingresar → Conectar con wallet** (Freighter signs a login message).
3. **Cuenta → Verificación**: fill name, email and CUIT (testnet: approved
   automatically).
4. **Licitaciones →** "Agropecuaria Las Lilas" → in "Habilitá USDC en tu wallet",
   **Habilitar** (Freighter signs the trustline) → **Recibir USDC de prueba** (100 USDC
   from the demo pool).
5. Amount 20, accept the risks, **Suscribir** → review what you sign → **Firmar en
   Freighter**. The panel shows "Confirmada en Stellar" with a Stellar Expert link where
   the source is your own address.

## 5. Tests in CI

The GitHub Actions run of `.github/workflows/ci.yml` shows: app typecheck/tests/build,
`cargo test` (contracts, including USDC tests), and `e2e-local` (a local Stellar network:
one-command deploy, then contribute/finalize/refund in USDC signed by the investor's
key, plus refusals of tampered, wrong-network and repeated transactions).
