# Evidencia E2E — Instaward 1 (testnet)

Corrida: 2026-10-30T11:38:09.930Z → 2026-10-30T11:50:24.891Z · API http://localhost:4603

- Inversor (firma todas sus transacciones): [GAUGBIUNSCRO3X6ZIICJXKZ4QQV7HLL6ZDQLKGOSOYEL4QO2IASTPASC](https://stellar.expert/explorer/testnet/account/GAUGBIUNSCRO3X6ZIICJXKZ4QQV7HLL6ZDQLKGOSOYEL4QO2IASTPASC)
- Fiduciario (cobra el finalize): [GAKL5UNFMDOHFJDMSYJGREDIJQ43UWWGR7L5GJ4SRIZBI4WAVHLR6B26](https://stellar.expert/explorer/testnet/account/GAKL5UNFMDOHFJDMSYJGREDIJQ43UWWGR7L5GJ4SRIZBI4WAVHLR6B26)
- USDC: USDC · emisor `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` · SAC [CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA](https://stellar.expert/explorer/testnet/contract/CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA) · 7 decimales
- Licitación éxito: [CAFGRYWYCDZJYEIXOD4ZU47D55MXGSRFN6DVGSPEGQHM3MGC7CXMTO6V](https://stellar.expert/explorer/testnet/contract/CAFGRYWYCDZJYEIXOD4ZU47D55MXGSRFN6DVGSPEGQHM3MGC7CXMTO6V) (listing `IPO-EE92783-mvuwey1o`)
- Licitación reembolso: [CC347DKS4FWI6N4ZFTY2F7HROOJ5O5E35H3OI5V7T4IRQIASLOYIG7B4](https://stellar.expert/explorer/testnet/contract/CC347DKS4FWI6N4ZFTY2F7HROOJ5O5E35H3OI5V7T4IRQIASLOYIG7B4) (listing `IPO-ER92783-mvuwgq91`)

## Transacciones

| Paso                                             | Hash                                                                                                                         | Firmante                                                   |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| trustline USDC                                   | [b20bd716b4d3…](https://stellar.expert/explorer/testnet/tx/b20bd716b4d3218c6a4fcc127e254c05fa438d50f06764f54586a8f10818aee5) | `GAUGBIUNSCRO3X6ZIICJXKZ4QQV7HLL6ZDQLKGOSOYEL4QO2IASTPASC` |
| contribute 20 USDC (licitación éxito)            | [02de1a44076b…](https://stellar.expert/explorer/testnet/tx/02de1a44076b920b85f4919e9869b9b0aabd6584e0d36df0c8915b558eb8d115) | `GAUGBIUNSCRO3X6ZIICJXKZ4QQV7HLL6ZDQLKGOSOYEL4QO2IASTPASC` |
| contribute 20 USDC (licitación reembolso)        | [9c6ad572e34b…](https://stellar.expert/explorer/testnet/tx/9c6ad572e34b1e9866355a4f8f3bf4311663dabd0383daa731835d9fea451669) | `GAUGBIUNSCRO3X6ZIICJXKZ4QQV7HLL6ZDQLKGOSOYEL4QO2IASTPASC` |
| finalize (mínimo alcanzado → USDC al fiduciario) | [c58843cb2d40…](https://stellar.expert/explorer/testnet/tx/c58843cb2d404156e18df5e4a7bdd20a7c8d1aeaa39622af89d2228d1d17c802) | `GAUGBIUNSCRO3X6ZIICJXKZ4QQV7HLL6ZDQLKGOSOYEL4QO2IASTPASC` |
| finalize (no alcanzó el mínimo → Failed)         | [d2e70b2f1034…](https://stellar.expert/explorer/testnet/tx/d2e70b2f103432d2c4e3a8374684752b7c192b3c76d7f9e7c56bc0b4447f2f4c) | `GAUGBIUNSCRO3X6ZIICJXKZ4QQV7HLL6ZDQLKGOSOYEL4QO2IASTPASC` |
| refund 20 USDC                                   | [aff8e733c52e…](https://stellar.expert/explorer/testnet/tx/aff8e733c52e760270b5372aec08b6fbfc7bc3cdc94b28cb08f501b335eb26b0) | `GAUGBIUNSCRO3X6ZIICJXKZ4QQV7HLL6ZDQLKGOSOYEL4QO2IASTPASC` |

## Chequeos

- ✅ GET /api/chain/network expone la red y el USDC — Test SDF Network ; September 2015 · CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA
- ✅ login con firma SEP-53 de la wallet — GAUGBIUNSCRO3X6ZIICJXKZ4QQV7HLL6ZDQLKGOSOYEL4QO2IASTPASC
- ✅ KYC aprobado — APPROVED
- ✅ trustline USDC (firmada por el inversor) — b20bd716b4d3218c6a4fcc127e254c05fa438d50f06764f54586a8f10818aee5
- ✅ USDC de prueba desde el pool (no faucet) — 100 USDC
- ✅ contribute 20 USDC (licitación éxito) (firmada por el inversor) — 02de1a44076b920b85f4919e9869b9b0aabd6584e0d36df0c8915b558eb8d115
- ✅ contribute 20 USDC (licitación reembolso) (firmada por el inversor) — 9c6ad572e34b1e9866355a4f8f3bf4311663dabd0383daa731835d9fea451669
- ✅ GET /api/chain/tenders: posición y recaudado leídos del contrato, en USDC — rwa=2 raised=20 USDC CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA
- ✅ XDR distinto del construido (monto alterado) — 422 TX_MISMATCH
- ✅ firma para otra red (passphrase de mainnet) — 422 TX_BAD_SIGNATURE
- ✅ reenvío de una transacción ya enviada — 409 TX_ALREADY_SUBMITTED
- ✅ finalize (mínimo alcanzado → USDC al fiduciario) (firmada por el inversor) — c58843cb2d404156e18df5e4a7bdd20a7c8d1aeaa39622af89d2228d1d17c802
- ✅ licitación Successful y 20 USDC en la cuenta del fiduciario — Successful · fiduciario +20.00 USDC
- ✅ finalize (no alcanzó el mínimo → Failed) (firmada por el inversor) — d2e70b2f103432d2c4e3a8374684752b7c192b3c76d7f9e7c56bc0b4447f2f4c
- ✅ licitación Failed — Failed
- ✅ refund 20 USDC (firmada por el inversor) — aff8e733c52e760270b5372aec08b6fbfc7bc3cdc94b28cb08f501b335eb26b0
- ✅ reembolso: 20 USDC de vuelta y posición en cero — +20.00 USDC · rwa=0
