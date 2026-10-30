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
bash scripts/testnet/03-deploy.sh  # sube los WASM y despliega factory/stock/licitación
bash scripts/testnet/04-licitacion-xlm.sh  # nueva licitación XLM + bind Las Lilas
```

En Windows (sin bash), desde la raíz:

```bash
npm run deploy:licitacion -w @fractachain/api
```

El 03 escribe `deployments/testnet.json` (solo IDs públicos). Las claves `S…` quedan en `.env` (raíz). El 04 deja `licitacionLegacy` = CBO3… (caps rotos / USDC) y `licitacion` = la instancia XLM nueva.

`stellar` en la máquina de Eros es un wrapper Docker: monta el directorio actual como `/workspace`. Los scripts 01–03 hacen `cd` a la raíz del repo y pasan rutas relativas (`deployments/wasm/*.wasm`).

## Constructores y factory (SC-06 / SC-02)

Los contratos corren su `__constructor` en la misma transacción del deploy:
no queda un `initialize` suelto que alguien pueda adelantar.

- **Factory y licitación**: `stellar contract deploy --wasm … -- --admin …`
  (los argumentos del constructor van después de `--`).
- **Stock vault, forward y warrant**: los despliega **la factory**
  (`deploy_stock_vault`, `deploy_forward`, `deploy_warrant`). La factory valida
  los términos (activo de pago habilitado, warrantera acreditada) y firma el
  constructor; el vault exige esa firma (`registry.require_auth()`), así que
  ninguna instancia puede declarar a nuestra factory como registry sin que la
  factory la haya desplegado. La factory además la registra como producto
  (`product_id_of`).
- `03-deploy.sh` sigue leyendo `get_admin` / `get_registry` de las instancias
  que reutiliza del JSON (pueden ser del WASM viejo). Si la factory guardada es
  del WASM viejo, el script corta: borrá `factory` del JSON y corré de nuevo.

El API detecta en cada deploy si el WASM tiene `__constructor` (lee el spec
on-chain): con WASMs viejos sigue haciendo deploy + `initialize` + verificación.

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

## Sin Stellar CLI

`stellar contract build` además poda la spec del contrato. Si no podés
instalar el CLI (p. ej. por memoria: `stellar-xdr` necesita varios GB para
compilar), `npm run contracts:build` genera WASM desplegables con cargo
(spec sin podar, mismo código ejecutable) y `npm run testnet:upload-wasm -w
@fractachain/api -- licitacion=… stockVault=…` los sube y actualiza una copia
local del deployment.
