#!/usr/bin/env bash
# Instancia forward + warrant desde los WASM hashes de deployments/testnet.json.
# WASM con constructor: los despliega la factory (deploy_forward/deploy_warrant).
# Con STELLAR_DEPLOYER_SECRET acredita la warrantera en la factory configurada;
# sin él despliega una factory propia para el demo.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
npm run deploy:forward-warrant -w @fractachain/api
