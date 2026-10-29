# Testnet (Stellar SDF)

Sí se puede. El trial on-chain es: **cuentas Friendbot + WASM + factory/licitación/stock en testnet + emisor AUTH_REQUIRED**. El primario de Las Lilas invoca `contribute()` / `finalize()` del contrato (XLM SAC) cuando `paymentKind` es `XLM`.

## Qué hace falta

| Cosa | Quién la pone | Estado |
|------|----------------|--------|
| Stellar CLI 28 | máquina (`stellar --version`) | opcional; el deploy 04/05 es Node |
| rustc + `wasm32v1-none` | máquina | ya está (para recompilar) |
| 3 cuentas testnet con XLM | `01-keys.sh` (Friendbot) | se crean |
| WASM | `02-build.sh` | se compilan |
| Secretos `S…` | `.env` en la raíz (gitignored) | `01-keys.sh` o pegar fc-deployer / fc-issuer |

No hace falta mainnet, Firebase ni Railway para este paso.

## Cómo

```bash
cd fractachain   # raíz del repo
bash scripts/testnet/01-keys.sh    # G… + Friendbot + .env (raíz)
bash scripts/testnet/02-build.sh   # WASM
bash scripts/testnet/03-deploy.sh  # sube e inicializa factory/stock/CBO3
bash scripts/testnet/04-licitacion-xlm.sh  # nueva licitación XLM + bind Las Lilas
```

En Windows (sin bash), desde la raíz:

```bash
npm run deploy:licitacion -w @fractachain/api
```

El 03 escribe `deployments/testnet.json` (solo IDs públicos). Las claves `S…` quedan en `.env` (raíz). El 04 deja `licitacionLegacy` = CBO3… (caps rotos / USDC) y `licitacion` = la instancia XLM nueva.

`stellar` en la máquina de Eros es un wrapper Docker: monta el directorio actual como `/workspace`. Los scripts 01–03 hacen `cd` a la raíz del repo y pasan rutas relativas (`deployments/wasm/*.wasm`).

## Verificación de `initialize` (SC-06)

`deploy` e `initialize` son dos transacciones: cualquiera que mire la red puede
inicializar una instancia recién desplegada antes que nosotros y quedarse con
el admin. Por eso `03-deploy.sh`:

- guarda cada ID en `deployments/testnet.json` **recién después** de un
  `initialize` exitoso (si el init falla, el script corta y no queda nada a
  medio guardar);
- lee `get_admin` de factory, stock vault y licitación y corta si no es el
  `fc-deployer` (también al reutilizar IDs ya guardados);
- comprueba que el stock vault apunte a nuestra factory (`get_registry`).

Si aparece `Posible initialize adelantado`, borrá ese ID del JSON y corré de
nuevo. Pendiente a futuro: pasar los contratos a `__constructor` (deploy +
init atómicos), lo que implica cambiar también el flujo de deploy del API.

## Después del deploy

1. Reiniciar el API (`npm run dev:api` desde la raíz).
2. En Admin → Testnet, modo `deploy`.
3. Al crear un listing, usar el `issuer` de `deployments/testnet.json` (no `GTEST`).
4. Orderbook SDEX: el API usa `STELLAR_ISSUER_SECRET`.
5. Aportar on-chain a Las Lilas gasta **XLM nativo** de la wallet custodial (Friendbot). Mínimo 100 XLM. Hard cap demo 500 XLM para poder `finalize` en escena.

## Qué no hace este pipeline

- No toca pubnet.
- No cubre autocustodia / Freighter: el `contribute` on-chain firma con la clave custodial.
- No rota peppers de sesión: cambialos en `.env` si el host no es solo tu máquina.
