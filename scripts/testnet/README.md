# Testnet (Stellar SDF)

Sí se puede. El trial on-chain es: **cuentas Friendbot + WASM + factory/licitación/stock en testnet + emisor AUTH_REQUIRED**. La app sandbox (JSON) sigue para el primario hasta que `contribute` hable con el contrato.

## Qué hace falta

| Cosa | Quién la pone | Estado |
|------|----------------|--------|
| Stellar CLI 28 | máquina (`stellar --version`) | ya está |
| rustc + `wasm32v1-none` | máquina | ya está |
| 3 cuentas testnet con XLM | `01-keys.sh` (Friendbot) | se crean |
| WASM | `02-build.sh` | se compilan |
| USDC de testnet (Circle) | testers que quieran aportar on-chain | emisor `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` |
| Secretos `S…` | `backend/.env` (gitignored) | los escribe `01-keys.sh` |

No hace falta mainnet, Firebase ni Railway para este paso.

## Cómo

```bash
cd /home/nawuel/fractachain
bash scripts/testnet/01-keys.sh    # G… + Friendbot + backend/.env
bash scripts/testnet/02-build.sh   # WASM
bash scripts/testnet/03-deploy.sh  # sube e inicializa
```

El último comando escribe `deployments/testnet.json` (solo IDs públicos). Las claves `S…` quedan en `backend/.env`.

`stellar` en esta máquina es un wrapper Docker: monta el directorio actual como `/workspace`. Los scripts hacen `cd` a la raíz del repo y pasan rutas relativas (`deployments/wasm/*.wasm`).

## Después del deploy

1. Reiniciar el backend (`npm run dev` en `backend/`).
2. En Admin → Testnet, modo `deploy`.
3. Al crear un listing, usar el `issuer` de `deployments/testnet.json` (no `GTEST`).
4. Orderbook SDEX: el backend usa `STELLAR_ISSUER_SECRET`.
5. Aportar on-chain a la licitación requiere USDC de testnet en la wallet del inversor.

Forward y warrant se **suben** (hash WASM) y no se instancian: hacen falta productor, comprador y warrantera reales.

## Qué no hace este pipeline

- No toca pubnet.
- No reescribe `contribute` / `deposit_dividends` del backend para que invoquen Soroban (el primario de la UI sigue siendo sandbox). Los contratos sí quedan vivos para invocación por CLI o un siguiente cable.
- No rota peppers de sesión: cambialos en `.env` si el host no es solo tu máquina.
