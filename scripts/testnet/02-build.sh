#!/usr/bin/env bash
# Compila los seis crates a WASM con el Stellar CLI (no usar cargo build --target a mano).
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib.sh"
need_stellar
cd "$CONTRACTS"
stellar contract build
stage_wasm
echo
ls -lh "$WASM_HOST"/*.wasm
echo
echo "Siguiente: scripts/testnet/03-deploy.sh"
