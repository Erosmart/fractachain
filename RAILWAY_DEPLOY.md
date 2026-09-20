# Deploy: Docker local → Railway

Dos contenedores desde el mismo repo: **API Express** (`backend`) y **Next.js** (`frontend`). En Railway van como **dos servicios** independientes.

Los IDs públicos de testnet viven en `deployments/testnet.json` (sin secretos). Las `S…` van en variables de entorno, nunca en la imagen.

---

## Probar en local (igual que Railway)

En la raíz del repo, con Docker Desktop:

```bash
docker compose up --build
```

- UI: http://localhost:3000
- API: http://localhost:4000/health

Si existe `backend/.env`, Compose lo carga (peppers, admin, secretos Stellar). Si no, el API arranca igual en testnet; KYC demo y Friendbot siguen funcionando.

Parar: `Ctrl+C` o `docker compose down`.

Rebuild del frontend si cambia la URL del API:

```bash
NEXT_PUBLIC_API_URL=https://tu-api.up.railway.app docker compose up --build frontend
```

`NEXT_PUBLIC_*` se **hornea en el build**. Cambiar la URL pública implica rebuild, no solo un restart.

---

## Railway (dos servicios)

Mismo Dockerfile que Compose. En cada servicio:

| | Backend | Frontend |
|---|---|---|
| **Root Directory** | *(vacío — raíz del repo)* | *(vacío)* |
| **Dockerfile path** | `backend/Dockerfile` | `frontend/Dockerfile` |
| **Watch paths** | `backend/**`, `deployments/testnet.json` | `frontend/**` |

No uses Root Directory `backend/` / `frontend/`: el contexto de build tiene que ser el repo para copiar `deployments/testnet.json`.

### Variables — backend

Railway asigna `PORT`. Además:

```
NODE_ENV=production
HACKATHON_DEMO=true
ADMIN_EMAILS=tu-email-admin@dominio
AUTH_PEPPER=generá-uno-largo
WALLET_PEPPER=generá-otro
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_FRIENDBOT_URL=https://friendbot.stellar.org
STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
STELLAR_DEPLOYER_SECRET=S...   # opcional; no commitear
STELLAR_ISSUER_SECRET=S...     # opcional
```

Generá peppers distintos a los de `.env.example`.

### Variables — frontend (build)

En el servicio frontend, **Build-time variables**:

```
NEXT_PUBLIC_API_URL=https://<backend>.up.railway.app
NEXT_PUBLIC_STELLAR_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
```

Railway las pasa como `ARG` si el Dockerfile las declara (ya están). Después del primer deploy del API, copiá la URL pública al frontend y **rebuild**.

Firebase es opcional; el login email/password no lo necesita.

### Persistencia

El API escribe `data/users.json`, selfies y orderbook **dentro del contenedor**. Un redeploy borra cuentas locales. Para producción: Volume en Railway montado en `/app/data`.

`listings.json` viaja en la imagen (Las Lilas). Los usuarios no.

---

## Qué no va en Docker

- Contratos Rust / WASM (`contracts/`)
- Secretos `S…` ni `backend/.env`
- `deployments/*.local.json` (actores Friendbot)

Healthcheck del API: `GET /health`.
