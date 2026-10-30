# Demo video — script (Deliverable 2 evidence)

Goal of the video (SOW §6.1): show an investor **signing in Freighter with their
own wallet** a USDC contribution to a Soroban tender, and the transaction on
Stellar Expert whose signer is the investor's own `G…` address. 3–4 minutes,
screen capture with the Freighter popup visible, testnet.

## Before recording

1. Freighter installed, network **Testnet**, a fresh account funded with Friendbot.
2. App open at the demo URL (or `http://localhost:3000`), signed out.
3. A tender seeded by `npm run stellar:deploy -- --network testnet` is open.

## Shots

| #   | Screen                                       | Say / show                                                                                                                                                                                           |
| --- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Landing → **Ingresar → Conectar con wallet** | Freighter asks to sign a login message (SEP-53). No password, no key leaves the wallet.                                                                                                              |
| 2   | **Cuenta → Verificación**                    | Complete the KYC form (testnet). Show the status.                                                                                                                                                    |
| 3   | **Licitaciones →** the seeded tender         | Point at "Leído del contrato C… ↗": every number comes from the contract (`get_state`, `get_total_raised`, `get_price_per_unit`…). Click the contract ID: Stellar Expert opens on the same contract. |
| 4   | Requirements box                             | **Habilitar USDC** → Freighter signs the trustline. **Recibir USDC de prueba** → the demo pool sends Circle testnet USDC. Show the balance read from the USDC contract.                              |
| 5   | Subscribe 20 USDC                            | The app shows what will be signed: contract, `contribute`, 20 USDC, fee. **Freighter popup**: review and **Sign**.                                                                                   |
| 6   | Transaction component                        | Preparing → signing → sending → confirmed, with the hash.                                                                                                                                            |
| 7   | Stellar Expert (tx link)                     | Source account = the investor's `G…`; the operation invokes `contribute` on the tender; the USDC transfer goes from the investor to the tender contract; the asset is **USDC (GBBD47IF…)**, not XLM. |
| 8   | Portfolio                                    | RWA balance and USDC balance, each with the contract it was read from.                                                                                                                               |
| 9   | (optional) Finalize / refund                 | Same component; on Stellar Expert the payout to the trustee (or the refund) moves USDC.                                                                                                              |

## After recording

Add the video link and the tx hashes shown in it to `evidence.md`.
