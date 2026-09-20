# Runbook demo P0 — Las Lilas (local, sin push)

Fecha: 2026-09-20 · Caps pitch: soft=hard=100 XLM (un ticket de 100 puede cerrar on-chain).

## Antes del pitch (5 min)

1. `cd backend` → copiar `.env.example` a `.env` si falta.
2. Asegurar `HACKATHON_DEMO=true`.
3. Instancia live:
   - Si ya tenes `STELLAR_LICITACION_ADMIN_SECRET` de una instancia anterior con caps viejos: **redeploy** con caps nuevos:
     `npx ts-node src/stellar/deploy_licitacion.ts`
   - Eso escribe admin secret, bindea `IPO-SOJA-PERGAMINO-2026` y actualiza `deployments/testnet.json`.
4. Probar on-chain (opcional): script `prove:contribute` si existe en package.json; si no, aporte desde la UI.
5. `npm run dev` en backend (:4000) y frontend (:3000).

## Guion 90 segundos

1. Home → leer leyenda real/maqueta.
2. Register / login → onboarding wallet **custodial** (no quiz de seed).
3. KYC (auto en demo).
4. Market → solo pools del API (sin MOCK 345k al primer paint).
5. Las Lilas → **Aportar XLM** → ver hash en Stellar Expert.
6. Decir en voz alta: pago demo = XLM Friendbot; RWA = unidades en el contrato, no asset Freighter; USDC/forwards/warrants/Merval = maqueta.

## Si falla

| Sintoma | Que hacer |
|---------|-----------|
| 401 / no contribute | Falta admin secret o listing no live |
| Caps inalcanzables | Redeploy `deploy_licitacion.ts` (100/100) |
| Market vacio | Backend abajo o `/api/market/pools` vacio |
| Wallet sin G... | Pasar por `/onboarding/wallet` custodial |

## No hacer en este runbook

- Commit / push (pedido explicito).
- Instanciar forward/warrant para el pitch.
- Prometer USDC Circle live sin faucet.

## Archivos tocados en esta sesion P0 (working tree)

- `backend/src/stellar/deploy_licitacion.ts` — caps 100/100
- `backend/data/listings.json` — Las Lilas 100/100 XLM
- `backend/src/admin/listings.ts` — defaults bind 100/100
- `frontend/src/app/market/page.tsx` — sin MOCK_POOLS inicial + banner
- `frontend/src/app/market/[id]/page.tsx` — sin fallback MOCK + banner
- `frontend/src/app/wallet/page.tsx` — sin mnemonic falso
- `frontend/src/lib/i18n.ts` — honesty / wallet / legend
- `frontend/src/app/page.tsx` — leyenda home (si se inserto)
- este runbook
