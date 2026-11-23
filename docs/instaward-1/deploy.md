# Deploy reproducible (Instaward 1)

Tres comandos, desde la raíz del repo. Todos aceptan `--network local|testnet`.

| Comando                                                                | Qué hace                                                                                                       |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `npm run stellar:deploy -- --network testnet`                          | Sube los 5 contratos, despliega la factory, registra el USDC como medio de pago y siembra instancias de prueba |
| `npm run stellar:fund-pool -- --network testnet --usdc 2000`           | Carga el pool de USDC de demo del que se fondea a los revisores                                                |
| `npm run stellar:fund -- G… 100 --network testnet`                     | Ayudante para revisores: manda USDC de prueba del pool a una cuenta con trustline                              |
| `npm run stellar:e2e -- --network testnet --api http://localhost:4603` | Corre el flujo completo contra un API levantado (ver [ci.md](ci.md))                                           |

Requisitos: Node 22, Rust con el target `wasm32v1-none` (el deploy compila los
contratos; `--no-build` reutiliza `contracts/target`). No hace falta la CLI de
`stellar`: todo usa `@stellar/stellar-sdk`.

## `stellar:deploy`

```bash
npm run stellar:deploy -- --network testnet \
  [--out <deployment.json>] [--env-out <.env>] [--usdc circle|team] \
  [--no-build] [--refund-minutes 120] [--skip-seed] [--new-factory]
```

1. **Cuentas.** Reutiliza las de `--env-out` (o variables de entorno) y crea con
   Friendbot las que falten: deployer/admin, emisor de tokens, oráculo PoR,
   fiduciario (cobra el `finalize`), pool de USDC, y productor / comprador /
   warrantera de las instancias de prueba.
2. **WASM.** Compila y sube `issuance_factory`, `fractachain_licitacion`,
   `stock_vault`, `forward_contract` y `warrant_vault` (los que ya están en la red
   no se vuelven a subir: el hash es el contenido).
3. **Factory** con su `__constructor` (deploy e init en una transacción). Se
   reutiliza si el archivo de deployment ya tiene una con el mismo WASM y admin.
4. **USDC.**
   - `testnet` (por defecto `circle`): el USDC de Circle, emisor
     `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`, SAC
     `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`.
   - `local` (o `--usdc team`): un USDC emitido por el equipo y su SAC.
   - En los dos casos: `decimals()` se lee del SAC, `set_payment_asset(USDC)` en la
     factory, y trustlines del pool, el fiduciario y las contrapartes.
5. **Instancias de prueba**, todas en USDC:
   - stock vault desplegado por la factory, con prueba de reserva (1.000 acciones)
     y 400 tokens emitidos;
   - licitación abierta 30 días (precio 10, mínimo 100, tope 1.000 USDC);
   - licitación corta para la demo de reembolso (`--refund-minutes`, mínimo = tope =
     1.000, así no llega y queda `Failed`);
   - forward (10 kg × 1 USDC en escrow del comprador) y warrant (préstamo de 500 USDC
     sobre 1.000 de inventario), desplegados por la factory con co-firmantes.
6. **Salida.**
   - `--out` (por defecto `packages/api/.local-data/<network>/deployment.json`): IDs
     públicos, hashes de WASM, `usdc { mode, code, issuer, sac, decimals }`,
     `usdcPool`, `trustee`, `seeded { tenders, forwards, warrants, stockVaults }` y
     los hashes de las transacciones de siembra.
   - `--env-out` (por defecto `packages/api/.local-data/<network>/.env`, permisos 600,
     gitignored): las claves secretas y la configuración de red para el API
     (`STELLAR_*`, `USDC_MODE`, `STELLAR_USDC_POOL_SECRET`…).

`deployments/testnet.json` sólo se escribe si se pasa explícitamente como `--out`.

### Usarlo con el API

```bash
set -a; source packages/api/.local-data/testnet/.env; set +a   # o ENV_FILE=…/.env
npm run dev:api-only
```

## `stellar:fund-pool`

El USDC de Circle no lo puede emitir el equipo. El comando lo compra en el DEX de
testnet con XLM de Friendbot: crea cuentas temporales, abre la trustline, hace un
path payment XLM → USDC, manda el USDC al pool y fusiona la cuenta temporal con el
pool (el XLM sobrante no se pierde). Con la liquidez actual una cuenta temporal
alcanza para varios miles de USDC.

También sirve el faucet de Circle (https://faucet.circle.com → Stellar testnet → la
dirección del pool que imprime el comando). En `local` el emisor del equipo acuña lo
que falte.

## Contingencias

| Problema                                                         | Qué hacer                                                                                                                               |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| El USDC de Circle no está disponible o no hay liquidez en el DEX | `--usdc team` en `stellar:deploy`: mismo flujo con un activo de prueba del equipo (la licitación es agnóstica al token)                 |
| Reset de testnet                                                 | Volver a correr `stellar:deploy` (recrea cuentas, sube WASM, siembra) y `stellar:fund-pool`, y regenerar la evidencia con `stellar:e2e` |
| RPC público con rate limit                                       | `STELLAR_RPC_URL=<rpc dedicado> npm run stellar:deploy -- …` (todas las URLs se pueden sobreescribir con las variables `STELLAR_*`)     |
