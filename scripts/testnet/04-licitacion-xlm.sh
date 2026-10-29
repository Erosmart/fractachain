#!/usr/bin/env bash
# Instancia una licitación Las Lilas pagada en XLM (stroops) y la bindea al listing.
# Requiere STELLAR_DEPLOYER_SECRET en .env de la raíz (fc-deployer = GDUA6DQZ…).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
npm run deploy:licitacion -w @fractachain/api
