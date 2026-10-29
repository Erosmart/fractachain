# Deploy: Docker local → Railway

Fractachain es **una sola aplicación**: el servidor Node de `apps/web` sirve
las páginas (Astro SSR) y el API (`/api`, `/health`) en el mismo proceso,
puerto y origen. Una imagen (`Dockerfile` en la raíz), un servicio.

Los IDs públicos de testnet viven en `deployments/testnet.json` (sin
secretos). Las `S…` van en variables de entorno, nunca en la imagen.

---

## Probar en local (igual que Railway)

```bash
cp .env.example .env      # completá AUTH_SECRET y WALLET_PEPPER
docker compose up --build
```

- App: http://localhost:3000
- Salud: http://localhost:3000/health

El estado (usuarios, listings, KYC, auditoría…) queda en el volumen
`app-data` (`/app/data`). `docker compose down -v` lo borra.

`PUBLIC_*` se **hornea en el build** (build args). Los secretos del servidor
se leen en runtime.

---

## Railway (un servicio)

| | |
|---|---|
| **Root Directory** | *(vacío — raíz del repo)* |
| **Dockerfile path** | `Dockerfile` |
| **Watch paths** | `apps/web/**`, `packages/**`, `deployments/testnet.json`, `package-lock.json`, `Dockerfile` |
| **Volume** | montado en `/app/data` |
| **Healthcheck** | `GET /health` |

> **Migración desde v1 (dos servicios):** creá (o reutilizá) **un** servicio
> con el `Dockerfile` de la raíz y montale el volumen que tenía el API en
> `/app/data`. El servicio viejo del frontend se puede borrar. Las variables
> `NEXT_PUBLIC_*` pasan a ser `PUBLIC_*` y `PUBLIC_API_URL` queda **vacía**
> (mismo origen). `CORS_ORIGINS` ya no hace falta.

### Variables de runtime (secretas)

Railway asigna `PORT`. Obligatorias en producción (sin ellas no arranca):

```
NODE_ENV=production
AUTH_SECRET=<openssl rand -hex 32>             # firma de sesiones (antes AUTH_PEPPER)
WALLET_PEPPER=<el MISMO valor que usabas en v1>   # cifra wallets custodiales y secretos 2FA
APP_URL=https://<tu-app>.up.railway.app         # links de los emails
ADMIN_EMAILS=admin@tu-dominio
```

Recomendadas / opcionales:

```
SMTP_URL=smtps://usuario:clave@smtp.proveedor.com:465   # sin esto los emails van al log
MAIL_FROM=Fractachain <no-reply@tu-dominio>
ADMIN_BOOTSTRAP_PASSWORD=...     # contraseña inicial del admin (si la cuenta no tiene)
ADMIN_REQUIRE_2FA=true           # default en producción: el panel admin exige TOTP
REQUIRE_EMAIL_VERIFICATION=true  # default en producción: email confirmado antes del KYC
FIREBASE_PROJECT_ID=...          # habilita "Ingresar con Google"
DATABASE_URL=postgres://...      # espejo + restore en Postgres y locks entre réplicas
HACKATHON_DEMO=true              # KYC auto-aprobado para el demo
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

**Primer ingreso del admin en producción:** entra con
`ADMIN_BOOTSTRAP_PASSWORD` (o Google), va a **Cuenta → Seguridad**, escanea el
QR con una app de autenticación y guarda los códigos de recuperación. Hasta
entonces el panel de admin responde "Activá la verificación en dos pasos".

**Rotar `WALLET_PEPPER`:** valor nuevo en `WALLET_PEPPER`, el viejo en
`WALLET_PEPPER_PREVIOUS`; cada secreto se re-cifra la primera vez que se usa.

**Sesiones v1:** los tokens `fc1.` dejan de valer; cada usuario vuelve a
ingresar una vez.

### Variables de build (`PUBLIC_*`)

```
PUBLIC_API_URL=                       # vacío: el API está en el mismo servidor
PUBLIC_STELLAR_RPC_URL=https://soroban-testnet.stellar.org
PUBLIC_STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
PUBLIC_FIREBASE_API_KEY=...           # opcionales: login con Google
PUBLIC_FIREBASE_AUTH_DOMAIN=...
PUBLIC_FIREBASE_PROJECT_ID=...
PUBLIC_FIREBASE_APP_ID=...
```

---

## Desarrollo sin las claves del equipo

La factory compartida de testnet sólo acepta los medios de pago que registró
su admin, y el USDC de testnet lo emite una cuenta del equipo. Para tener el
circuito completo en tu máquina, trabajá contra una **copia local** del
deployment (nunca se toca `deployments/testnet.json`):

```bash
mkdir -p packages/api/.local-data
cp deployments/testnet.json packages/api/.local-data/testnet-deployment.json
echo "STELLAR_DEPLOYMENT_FILE=$PWD/packages/api/.local-data/testnet-deployment.json" >> .env

npm run testnet:clone-factory                     # factory propia (XLM + USDC registrados)
npm run testnet:setup-usdc -w @fractachain/api    # emisor USDC + SAC propios, faucet funcionando
# contratos corregidos (requiere stellar CLI):
bash scripts/testnet/02-build.sh
npm run testnet:upload-wasm -w @fractachain/api -- \
  licitacion=deployments/wasm/fractachain_licitacion.wasm stockVault=deployments/wasm/stock_vault.wasm
```

## Qué no va en Docker

- Contratos Rust / WASM (`contracts/`, `deployments/wasm`)
- Secretos `S…`, `.env`, `agents_secrets.json`
- `deployments/*.local.json` (actores Friendbot)
