# CI y E2E (Instaward 1)

`.github/workflows/ci.yml` corre cuatro jobs en cada push / PR:

| Job         | Qué verifica                                                                           |
| ----------- | -------------------------------------------------------------------------------------- |
| `app`       | typecheck, tests (API + web), build, `npm audit`                                       |
| `docker`    | la imagen de producción construye                                                      |
| `contracts` | compila los WASM y corre `cargo test` (incluye los tests con un SAC de prueba en USDC) |
| `e2e-local` | el flujo completo de Instaward 1 sobre una red Stellar **local**                       |

## `e2e-local`

No depende de testnet: levanta `stellar/quickstart --local` (stellar-core, Horizon,
Stellar RPC y Friendbot en `:8000`), y después:

1. compila los contratos y el API;
2. espera que el RPC responda `getHealth = healthy` y que Friendbot fondee;
3. `npm run stellar:deploy -- --network local` (USDC del equipo, mismo flujo que
   el de Circle en testnet);
4. levanta el API con las variables que generó el deploy;
5. `npm run stellar:e2e -- --network local` y sube como artefacto la evidencia, el
   deployment y el log del API.

## Qué prueba `stellar:e2e`

Un inversor cuya clave nunca sale del proceso de test hace de Freighter: firma
cada XDR que arma el API, con la passphrase de la red.

1. El emisor (admin) crea dos listings en USDC por el API, despliega vault y
   licitación, acuña y abre las licitaciones (cierran en `--deadline-minutes`).
2. El inversor:
   - entra con una firma SEP-53 de su wallet;
   - pasa el KYC;
   - abre la trustline USDC (`POST /api/tx/build` → firma → `POST /api/tx/submit`);
   - recibe USDC del pool (`POST /api/wallet/usdc/fund`).
3. Aporta 20 USDC a cada licitación con build → firma → submit. Se verifica en
   Horizon que el firmante de cada transacción es su propia dirección `G…`, y en
   `GET /api/chain/tenders/:id?holder=` la posición (2 unidades), el recaudado y
   que el token es el SAC del USDC configurado.
4. El API tiene que rechazar tres casos:
   - un XDR distinto del construido (`TX_MISMATCH`);
   - una firma con la passphrase de otra red (`TX_BAD_SIGNATURE`);
   - el reenvío de una transacción ya enviada (`TX_ALREADY_SUBMITTED`).
5. Pasado el plazo:
   - **`finalize` de la licitación que llegó al mínimo:** queda `Successful` y el
     fiduciario recibe exactamente 20 USDC;
   - **`finalize` de la que no llegó:** queda `Failed`;
   - **`refund`:** el inversor recupera 20 USDC y su posición vuelve a 0.

Con `--evidence <archivo.md>` escribe la tabla de transacciones (hash, link a
Stellar Expert en testnet y firmante) y los chequeos, y un `.json` con lo mismo.

## Correrlo contra testnet (evidencia)

```bash
npm run stellar:deploy -- --network testnet --out <dir>/deployment.json --env-out <dir>/.env
npm run stellar:fund-pool -- --network testnet --usdc 2000 --out <dir>/deployment.json --env-out <dir>/.env
set -a; source <dir>/.env; set +a
PORT=4603 DATA_DIR=<dir>/data SETTLEMENT_SWEEP_MS=0 HACKATHON_DEMO=true \
  ADMIN_EMAILS=admin@e2e.local ADMIN_BOOTSTRAP_PASSWORD=<clave> node packages/api/dist/main.js &
ADMIN_EMAIL=admin@e2e.local ADMIN_PASSWORD=<clave> npm run stellar:e2e -- --network testnet \
  --api http://localhost:4603 --out <dir>/deployment.json --env-out <dir>/.env \
  --evidence docs/instaward-1/evidence-testnet.md
```

`SETTLEMENT_SWEEP_MS=0` apaga el cierre automático del servidor, así el `finalize`
lo firma el inversor. El cierre es permissionless en el contrato.
