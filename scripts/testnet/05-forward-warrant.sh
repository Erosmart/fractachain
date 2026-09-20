#!/usr/bin/env bash
# Instancia forward + warrant desde los WASM hashes ya en testnet.
# Requiere STELLAR_DEPLOYER_SECRET (set_warrantera en la factory).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/backend"
npx ts-node src/stellar/deploy_forward_warrant.ts
