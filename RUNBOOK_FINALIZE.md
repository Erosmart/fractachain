# Runbook — finalize / refund (Las Lilas)

Fecha: 2026-09-20 · Oferta: `IPO-SOJA-PERGAMINO-2026` · Pago demo: **XLM Friendbot testnet** (no Circle USDC).

Este es el tramo que cierra el loop después de `contribute()`. Todo pega el contrato Soroban de licitación; no hay payout inventado en la UI.

## Regla on-chain (la que implementa el contrato)

`finalize()` **no** cierra por soft cap solo. Corre cuando:

1. `raised >= hard_cap`, **o**
2. `now >= deadline`

Después:

- Si `raised >= soft_cap` → estado **Successful**. En la misma transacción el contrato transfiere el XLM a la wallet fiduciaria (`proceedsWallet` / `Fiduciary`).
- Si no → estado **Failed**. El XLM se queda en el contrato hasta que cada inversor llama `refund()`.

En el pitch Las Lilas: **soft = hard = 100 XLM**. Un ticket de 100 alcanza el hard cap y se puede cerrar en el acto.

Lectura live (2026-09-20, testnet, `CDHKGEJNNFYKXW4XOEDXXE5LOF5HCYVORR2JT7AOK2FAN5B6I65X7JLM`): estado **Open**, raised **100 XLM**, `canFinalize=true` (`hard_cap`), proceeds todavía no pagados. El operador puede pulsar finalize en el próximo ensayo — **no lo dispares antes del pitch** o cerrás la oferta de verdad.

`withdraw_proceeds(admin)` es solo reintento si ese pago se interrumpió. No es el camino feliz.

## Qué hay y qué no hay para el inversor

| Estado | Qué pasa on-chain | Qué clickea el inversor |
|---|---|---|
| Successful | XLM ya fue a la empresa. Las unidades RWA se mintearon en `contribute()`. **No hay `claim()` de tokens en el contrato.** | “Anotar unidades RWA en el portfolio” — ledger de la plataforma, **no** un segundo transfer de XLM/USDC. |
| Failed | `refund(contributor)` devuelve XLM testnet a la wallet custodial y quema el RWA. | “Reembolsar XLM (refund on-chain)” y ver el hash en Stellar Expert testnet. |

No hay payout de USDC Circle. No hay claim de un asset clásico LILAS en Freighter: el RWA vive en el storage del contrato.

## Guion pitch (después del aporte)

1. Market → Las Lilas → **Aportar XLM** (100). Ver hash `contribute()` en Stellar Expert testnet.
2. La ficha muestra **Lista para cerrar** (hard cap).
3. Operador (cualquier sesión logueada) → **Cerrar licitación (finalize on-chain)**. Alternativa admin: Emisión → “Finalizar on-chain”.
4. API: `POST /api/listings/IPO-SOJA-PERGAMINO-2026/finalize` (Bearer). Equivale a `POST .../close` (solo admin).
5. Si Successful: decir en voz alta “el XLM fue a la wallet de la empresa en `finalize()`”. El inversor anota RWA en portfolio o ve `get_rwa_balance` en la ficha.
6. Si Failed (solo si no se llegó al soft cap): el inversor hace **refund** (`POST /api/listings/:id/refund`).

## Endpoints

| Método | Ruta | Quién | Contrato |
|---|---|---|---|
| GET | `/api/listings/:id` | público (Bearer opcional para RWA del inversor) | `get_state`, `get_total_raised`, `proceeds_withdrawn` |
| POST | `/api/listings/:id/finalize` | logueado | `finalize()` |
| POST | `/api/listings/:id/close` | admin | mismo `finalize()` si es XLM |
| POST | `/api/listings/:id/refund` | inversor custodial | `refund(contributor)` |
| POST | `/api/listings/:id/claim` | inversor | **no** llama al contrato; anota el ledger |
| POST | `/api/listings/:id/withdraw-proceeds` | admin | `withdraw_proceeds` (reintento) |

Hashes salen con URL `https://stellar.expert/explorer/testnet/tx/<hash>`.

## Si falla

| Síntoma | Qué hacer |
|---|---|
| “Todavía no se puede cerrar” | Falta hard cap on-chain o el deadline. Un aporte de 100 XLM debería bastar. |
| 401 en finalize | Hay que estar logueado. `/close` pide admin. |
| refund rechazado | Solo si el estado es Failed. En Successful el dinero ya no está en el contrato. |
| Falta admin secret | `STELLAR_LICITACION_ADMIN_SECRET` o `STELLAR_DEPLOYER_SECRET` en `backend/.env` (nunca en git). |

## Honestidad para el jurado

- Pago: XLM testnet / Friendbot.
- Custodia: wallet firmada por el backend.
- RWA: unidades en el contrato, no un asset Freighter/SDEX.
- USDC Circle, forwards, warrants, Merval: maqueta.
