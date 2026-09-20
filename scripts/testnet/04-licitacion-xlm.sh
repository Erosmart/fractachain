#!/usr/bin/env bash
# Instancia una licitación Las Lilas pagada en XLM (stroops) y la bindea al listing.
# Requiere STELLAR_DEPLOYER_SECRET en backend/.env (fc-deployer = GDUA6DQZ…).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/backend"
npx ts-node src/stellar/deploy_licitacion.ts
