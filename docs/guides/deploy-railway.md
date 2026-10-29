# Deploy: Docker local → Railway

Dos contenedores desde el mismo repo: **API** (`apps/api`, Express) y **web**
(`apps/web`, Astro SSR). En Railway van como **dos servicios** independientes.
Los dos se construyen **desde la raíz** del repo (npm workspaces necesita el
`package-lock.json` raíz).

Los IDs públicos de testnet viven en `deployments/testnet.json` (sin
secretos). Las `S…` van en variables de entorno, nunca en la imagen.

---

## Probar en local (igual que Railway)

```bash
cp apps/api/.env.example apps/api/.env      # completá AUTH_SECRET y WALLET_PEPPER
docker compose up --build
```

- Web: http://localhost:3000
- API: http://localhost:4000/health

El estado del API (usuarios, listings, KYC…) queda en el volumen `api-data`
(`/app/data` dentro del contenedor). `docker compose down -v` lo borra.

`PUBLIC_*` se **hornea en el build** de la web. Si cambia la URL pública del
API, hay que reconstruir:

```bash
PUBLIC_API_URL=https://tu-api.up.railway.app docker compose up --build web
```

---

## Railway (dos servicios)

| | API | Web |
|---|---|---|
| **Root Directory** | *(vacío — raíz del repo)* | *(vacío)* |
| **Dockerfile path** | `apps/api/Dockerfile` | `apps/web/Dockerfile` |
| **Watch paths** | `apps/api/**`, `packages/shared/**`, `deployments/testnet.json`, `package-lock.json` | `apps/web/**`, `packages/shared/**`, `package-lock.json` |
| **Volume** | montado en `/app/data` | — |
| **Healthcheck** | `GET /health` | `GET /` |

> Migración desde v1: cambiá el *Dockerfile path* de los servicios
> (`backend/Dockerfile` → `apps/api/Dockerfile`, `frontend/Dockerfile` →
> `apps/web/Dockerfile`) y renombrá las variables `NEXT_PUBLIC_*` → `PUBLIC_*`.
> El volumen del API sigue en `/app/data`.

### Variables — API (runtime)

Railway asigna `PORT`. Obligatorias en producción (el API no arranca sin ellas):

```
NODE_ENV=production
AUTH_SECRET=<openssl rand -hex 32>          # firma de sesiones (antes AUTH_PEPPER)
WALLET_PEPPER=<el MISMO valor que usabas en v1>   # cifra las wallets custodiales
CORS_ORIGINS=https://<web>.up.railway.app
ADMIN_EMAILS=admin@tu-dominio
```

Opcionales:

```
ADMIN_BOOTSTRAP_PASSWORD=...     # contraseña inicial del admin (si la cuenta no tiene)
FIREBASE_PROJECT_ID=...          # habilita "Ingresar con Google" (verificación de ID token)
DATABASE_URL=postgres://...      # espejo + restore en Postgres (kv_store)
HACKATHON_DEMO=true              # KYC auto-aprobado para el demo
DEMO_SEED_ACCOUNTS=false         # cuenta test@fractachain.dev (por defecto off en prod)
SESSION_TTL_HOURS=12
TRUST_PROXY=1
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_FRIENDBOT_URL=https://friendbot.stellar.org
STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
STELLAR_DEPLOYER_SECRET=S...
STELLAR_ISSUER_SECRET=S...
STELLAR_USDC_ISSUER_SECRET=S...
```

**Rotar `WALLET_PEPPER`:** poné el valor nuevo en `WALLET_PEPPER` y el viejo en
`WALLET_PEPPER_PREVIOUS`. Cada wallet custodial se re-cifra con la clave nueva
la primera vez que se usa. Cuando todas migraron, sacá `WALLET_PEPPER_PREVIOUS`.

**Sesiones v1:** los tokens `fc1.` dejan de valer; cada usuario vuelve a
ingresar una vez.

### Variables — web (build)

En el servicio web, como *build-time variables* (el Dockerfile las declara
como `ARG`):

```
PUBLIC_API_URL=https://<api>.up.railway.app
PUBLIC_STELLAR_RPC_URL=https://soroban-testnet.stellar.org
PUBLIC_STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
PUBLIC_FIREBASE_API_KEY=...            # opcionales: login con Google
PUBLIC_FIREBASE_AUTH_DOMAIN=...
PUBLIC_FIREBASE_PROJECT_ID=...
PUBLIC_FIREBASE_STORAGE_BUCKET=...
PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
PUBLIC_FIREBASE_APP_ID=...
```

Orden: primero el API, copiá su URL pública a `PUBLIC_API_URL` y a
`CORS_ORIGINS` del API (con la URL de la web), y **rebuild** de la web.

---

## Desarrollo sin la clave del deployer

La factory compartida de testnet sólo acepta los medios de pago que registró
su admin. Si no tenés `STELLAR_DEPLOYER_SECRET`, cloná la factory con tu admin
local (no toca `deployments/testnet.json`):

```bash
mkdir -p apps/api/.local-data
cp deployments/testnet.json apps/api/.local-data/testnet-deployment.json
echo "STELLAR_DEPLOYMENT_FILE=$PWD/apps/api/.local-data/testnet-deployment.json" >> apps/api/.env
STELLAR_DEPLOYMENT_FILE=$PWD/apps/api/.local-data/testnet-deployment.json \
  npm run testnet:clone-factory -w @fractachain/api
```

## Qué no va en Docker

- Contratos Rust / WASM (`contracts/`, `deployments/wasm`)
- Secretos `S…`, `apps/api/.env`, `agents_secrets.json`
- `deployments/*.local.json` (actores Friendbot)
