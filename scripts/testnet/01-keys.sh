#!/usr/bin/env bash
# Crea (si hace falta) y fondea las tres cuentas de testnet:
#   fc-deployer  — admin de los contratos
#   fc-issuer    — emisor del token clásico (SDEX, AUTH_REQUIRED)
#   fc-por       — oráculo de proof-of-reserve (tiene que ser distinto del admin)
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib.sh"
need_stellar

ensure_identity "$DEPLOYER_ID"
ensure_identity "$ISSUER_ID"
ensure_identity "$POR_ID"

echo
echo "deployer  $(addr "$DEPLOYER_ID")  XLM=$(horizon_balance "$DEPLOYER_ID")"
echo "issuer    $(addr "$ISSUER_ID")  XLM=$(horizon_balance "$ISSUER_ID")"
echo "por       $(addr "$POR_ID")  XLM=$(horizon_balance "$POR_ID")"

if [[ ! -f "$BACKEND_ENV" ]]; then
  cp "$ROOT/backend/.env.example" "$BACKEND_ENV"
  chmod 600 "$BACKEND_ENV"
fi

write_env_secret STELLAR_DEPLOYER_SECRET "$DEPLOYER_ID"
write_env_secret STELLAR_ISSUER_SECRET "$ISSUER_ID"

python3 - "$BACKEND_ENV" <<'PY'
import pathlib, sys
path = pathlib.Path(sys.argv[1])
text = path.read_text() if path.exists() else ""
defaults = {
    "STELLAR_NETWORK": "testnet",
    "STELLAR_HORIZON_URL": "https://horizon-testnet.stellar.org",
    "STELLAR_RPC_URL": "https://soroban-testnet.stellar.org",
    "STELLAR_FRIENDBOT_URL": "https://friendbot.stellar.org",
    "STELLAR_NETWORK_PASSPHRASE": "Test SDF Network ; September 2015",
    "STELLAR_USDC_CODE": "USDC",
    "STELLAR_USDC_ISSUER": "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
}
lines = text.splitlines()
keys = {line.split("=", 1)[0] for line in lines if line and not line.startswith("#") and "=" in line}
for key, value in defaults.items():
    if key not in keys:
        lines.append(f"{key}={value}")
path.write_text("\n".join(lines) + "\n")
PY

mkdir -p "$DEPLOYMENTS"
python3 - "$DEPLOYMENTS/testnet.json" "$(addr "$DEPLOYER_ID")" "$(addr "$ISSUER_ID")" "$(addr "$POR_ID")" <<'PY'
import json, pathlib, sys, datetime
path = pathlib.Path(sys.argv[1])
data = {}
if path.exists():
    data = json.loads(path.read_text())
data.update({
    "network": "testnet",
    "updatedAt": datetime.datetime.utcnow().isoformat() + "Z",
    "deployer": sys.argv[2],
    "issuer": sys.argv[3],
    "porOracle": sys.argv[4],
})
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(data, indent=2) + "\n")
PY

echo
echo "Públicas escritas en deployments/testnet.json"
echo "Secretos (S…) escritos en backend/.env — no lo subas."
echo "Siguiente: scripts/testnet/02-build.sh"
