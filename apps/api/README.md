# @fractachain/api

API REST de Fractachain: Express 5 + TypeScript estricto, arquitectura por
capas (`domain` → `application` → `infrastructure` / `http`) con inyección de
dependencias en `src/container.ts`. Detalle: [`docs/architecture.md`](../../docs/architecture.md).

## Scripts

| Comando (desde la raíz) | Qué hace |
|---|---|
| `npm run dev:api` | `tsx watch` en :4000 |
| `npm run build -w @fractachain/api` | compila a `dist/` |
| `npm run start -w @fractachain/api` | `node dist/main.js` |
| `npm test -w @fractachain/api` | vitest (unitarios + HTTP con supertest, sin red) |
| `npm run typecheck -w @fractachain/api` | `tsc --noEmit` (src + tests) |
| `npm run deploy:licitacion -w @fractachain/api` | nueva licitación XLM de Las Lilas en testnet |
| `npm run deploy:forward-warrant -w @fractachain/api` | despliega forward + warrant |
| `npm run testnet:clone-factory -w @fractachain/api` | factory propia para desarrollo sin la clave del deployer |

## Configuración

Copiá `.env.example` a `.env`. La configuración se valida al arrancar
(`src/config/env.ts`): en `NODE_ENV=production` el proceso no inicia sin
`AUTH_SECRET` y `WALLET_PEPPER` propios.

## Contrato HTTP

Las rutas y los formatos de respuesta son los mismos de v1 (la web los
consume tal cual), con estos cambios de seguridad:

- Las sesiones expiran (`expiresAt` en cada login) y `POST /api/auth/logout` las revoca.
- `POST /api/auth/google` (mock) responde **410**; Google = `POST /api/auth/firebase` con `idToken` verificado.
- `GET /api/kyc/selfie/:id` requiere sesión del titular o de un admin.
- `POST /api/auth/wallet` con `publicKey` ya no vincula wallets: se usa `/api/auth/wallet/link` (firma).
- Los relays (`/api/sdex/submit`, `/api/wallet/usdc/submit`, `…/contribute/submit`, `…/refund/submit`) validan origen y operaciones de la tx; el monto aportado se lee del contrato.
- Errores: `{ success: false, message, code, issues? }` con status HTTP real (400/401/403/404/409/413/429/502/503).
