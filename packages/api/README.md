# @fractachain/api

Backend de Fractachain como **librería**: Express 5 + TypeScript estricto,
arquitectura por capas (`domain` → `application` → `infrastructure` / `http`)
con inyección de dependencias en `src/container.ts`. Detalle:
[`docs/architecture.md`](../../docs/architecture.md).

No se despliega solo: la app (`apps/web`) lo monta en su servidor con
`startPlatform({ web })`, y en desarrollo `astro dev` lo carga en el mismo
proceso. También puede correr aislado (`npm run dev:api-only` desde la raíz)
para tests, scripts o un frontend en otro dominio.

```ts
import { startPlatform, handleShutdownSignals } from '@fractachain/api';
handleShutdownSignals(await startPlatform({ web: { handler, clientDir } }));
```

## Scripts

| Comando (desde la raíz) | Qué hace |
|---|---|
| `npm test -w @fractachain/api` | vitest: unitarios + HTTP con supertest (sin red) |
| `npm run typecheck -w @fractachain/api` | `tsc --noEmit` (src + tests) |
| `npm run build -w @fractachain/api` | compila a `dist/` (con `.d.ts`) |
| `npm run dev:api-only` | API sola en `PORT` con `tsx watch` |
| `npm run testnet:deploy-licitacion` | nueva licitación XLM de Las Lilas |
| `npm run testnet:deploy-forward-warrant` | despliega forward + warrant (falla si el init falla) |
| `npm run testnet:clone-factory` | factory propia para desarrollo sin la clave del deployer |
| `npm run testnet:setup-usdc -w @fractachain/api` | emisor USDC + SAC propios (faucet local) |
| `npm run testnet:upload-wasm -w @fractachain/api -- factory=… licitacion=… stockVault=… forward=… warrant=…` | sube WASM nuevos y actualiza los hashes (con `factory=`, después `testnet:clone-factory`) |

Los `testnet:*` que reescriben el deployment exigen `STELLAR_DEPLOYMENT_FILE`
apuntando a una copia local: nunca modifican `deployments/testnet.json`.

## Configuración

Un solo `.env` en la raíz del repo (`.env.example`). Se valida al arrancar
(`src/config/env.ts`): en `NODE_ENV=production` no inicia sin `AUTH_SECRET` y
`WALLET_PEPPER` propios.

## Contrato HTTP

Rutas y formatos de v1 (la web los consume tal cual), más:

| Endpoint | Qué hace |
|---|---|
| Cookie `fc_session` (`__Host-fc_session` en prod) | Sesión `HttpOnly; SameSite=Strict` en cada login; Bearer sigue funcionando para clientes no-browser |
| `X-Requested-With: fractachain` | Requerido en escrituras autenticadas por cookie (CSRF) → si falta, 403 `CSRF` |
| `POST /api/auth/2fa/setup` · `enable` · `disable` · `verify` | TOTP; con 2FA el login responde `{ twoFactorRequired, challenge }` |
| `POST /api/auth/sessions/revoke-all` | Cierra todas las sesiones |
| `POST /api/auth/email/verify` · `resend` | Verificación de email |
| `POST /api/auth/password/forgot` · `reset` | Reseteo de contraseña (sin enumeración; cierra sesiones) |
| `GET /api/admin/audit?limit&action&actor` | Registro de auditoría |
| `GET /api/kyc/provider` | `{ provider: 'didit' \| 'manual', selfieRequired }` |
| `POST /api/kyc/verification` · `GET` · `POST …/sync` | Inicia o retoma la verificación en Didit (`{ url }`), estado, y re-lectura de la decisión al volver |
| `POST /api/kyc/didit/webhook` | Webhook de Didit (firma HMAC, sin sesión) |

**Deploy de contratos.** Los WASM nuevos se configuran en su `__constructor`
(deploy e init en la misma transacción) y vault/forward/warrant sólo se crean
desde la factory (`deploy_stock_vault`, `deploy_forward`, `deploy_warrant`), que
queda fijada como su registry. El API lee el spec de cada WASM on-chain y, para
los WASM viejos del deployment compartido, sigue usando deploy + `initialize` +
verificación (`ContractDeployPlan`).

Otros cambios de seguridad respecto de v1: sesiones con expiración y
revocación, `POST /api/auth/google` → **410**, selfies de KYC sólo para
titular/admin, vincular wallets exige firma, relays validados (el monto
aportado se lee del contrato), errores `{ success:false, message, code, issues? }`
con el status HTTP real.
