# Testnet (Stellar SDF)

Sí se puede. El trial on-chain es: **cuentas Friendbot + WASM + factory/licitación/stock en testnet + emisor AUTH_REQUIRED**. El primario de Las Lilas invoca `contribute()` / `finalize()` del contrato (XLM SAC) cuando `paymentKind` es `XLM`.

## Qué hace falta

| Cosa | Quién la pone | Estado |
|------|----------------|--------|
| Stellar CLI 28 | máquina (`stellar --version`) | opcional; el deploy 04/05 es Node |
| rustc + `wasm32v1-none` | máquina | ya está (para recompilar) |
| 3 cuentas testnet con XLM | `01-keys.sh` (Friendbot) | se crean |
| WASM | `02-build.sh` | se compilan |
| Secretos `S…` | `backend/.env` (gitignored) | `01-keys.sh` o pegar fc-deployer / fc-issuer |

No hace falta mainnet, Firebase ni Railway para este paso.

## Cómo

```bash
cd /home/nawuel/fractachain
bash scripts/testnet/01-keys.sh    # G… + Friendbot + backend/.env
bash scripts/testnet/02-build.sh   # WASM
bash scripts/testnet/03-deploy.sh  # sube e inicializa factory/stock/CBO3
bash scripts/testnet/04-licitacion-xlm.sh  # nueva licitación XLM + bind Las Lilas
# opcional, después del loop inversor:
bash scripts/testnet/05-forward-warrant.sh
```

En Windows, desde `backend/`:

```bash
npx ts-node src/stellar/deploy_licitacion.ts
npx ts-node src/stellar/deploy_forward_warrant.ts
```

El 03 escribe `deployments/testnet.json` (solo IDs públicos). Las claves `S…` quedan en `backend/.env`. El 04 deja `licitacionLegacy` = CBO3… (caps rotos / USDC) y `licitacion` = la instancia XLM nueva.

`stellar` en la máquina de Eros es un wrapper Docker: monta el directorio actual como `/workspace`. Los scripts 01–03 hacen `cd` a la raíz del repo y pasan rutas relativas (`deployments/wasm/*.wasm`).

## Después del deploy

1. Reiniciar el backend (`npm run dev` en `backend/`).
2. En Admin → Testnet, modo `deploy`.
3. Al crear un listing, usar el `issuer` de `deployments/testnet.json` (no `GTEST`).
4. Orderbook SDEX: el backend usa `STELLAR_ISSUER_SECRET`.
5. Aportar on-chain a Las Lilas gasta **XLM nativo** de la wallet custodial (Friendbot). Mínimo 100 XLM. Hard cap demo 500 XLM para poder `finalize` en escena.

## Qué no hace este pipeline

- No toca pubnet.
- No cubre autocustodia / Freighter: el `contribute` on-chain firma con la clave custodial.
- No rota peppers de sesión: cambialos en `.env` si el host no es solo tu máquina.
