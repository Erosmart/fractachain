# Testnet deploy helpers.
#
# Identities live in the Stellar CLI keystore (~/.config/stellar/identity),
# not in git. Public IDs land in deployments/testnet.json.

NETWORK="${NETWORK:-testnet}"
DEPLOYER_ID="${DEPLOYER_ID:-fc-deployer}"
ISSUER_ID="${ISSUER_ID:-fc-issuer}"
POR_ID="${POR_ID:-fc-por}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTRACTS="$ROOT/contracts"
DEPLOYMENTS="$ROOT/deployments"
BACKEND_ENV="$ROOT/backend/.env"
# Host path for copies; the stellar wrapper docker-mounts $(pwd) as /workspace,
# so invoke/deploy must use paths relative to ROOT.
WASM_HOST="$DEPLOYMENTS/wasm"
WASM_DIR="deployments/wasm"

# Cursor/sandbox sessions inject CARGO_TARGET_DIR; drop it so stellar-cli does
# not look in a cache the container cannot see.
unset CARGO_TARGET_DIR || true
cd "$ROOT"

USDC_CODE="${STELLAR_USDC_CODE:-USDC}"
USDC_ISSUER="${STELLAR_USDC_ISSUER:-GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5}"

need_stellar() {
  if ! command -v stellar >/dev/null 2>&1; then
    echo "Falta el Stellar CLI (stellar). Lo tenés que tener en PATH." >&2
    exit 1
  fi
}

addr() {
  stellar keys address "$1"
}

ensure_identity() {
  local name="$1"
  if stellar keys address "$name" >/dev/null 2>&1; then
    echo "identity $name already exists: $(addr "$name")"
    return
  fi
  echo "generating + funding $name on $NETWORK"
  stellar keys generate "$name" --network "$NETWORK" --fund
}

horizon_balance() {
  local pk
  pk="$(addr "$1")"
  curl -sS "https://horizon-testnet.stellar.org/accounts/$pk" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(next((b['balance'] for b in d.get('balances',[]) if b.get('asset_type')=='native'),'missing'))"
}

write_env_secret() {
  local key="$1"
  local identity="$2"
  local secret
  secret="$(stellar keys secret "$identity" --unquote 2>/dev/null || stellar keys secret "$identity")"
  mkdir -p "$(dirname "$BACKEND_ENV")"
  touch "$BACKEND_ENV"
  chmod 600 "$BACKEND_ENV"
  if grep -q "^${key}=" "$BACKEND_ENV" 2>/dev/null; then
    python3 - "$BACKEND_ENV" "$key" "$secret" <<'PY'
import pathlib, sys
path, key, secret = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3]
lines = path.read_text().splitlines()
out = []
found = False
for line in lines:
    if line.startswith(key + "="):
        out.append(f"{key}={secret}")
        found = True
    else:
        out.append(line)
if not found:
    out.append(f"{key}={secret}")
path.write_text("\n".join(out) + "\n")
PY
  else
    printf '%s=%s\n' "$key" "$secret" >> "$BACKEND_ENV"
  fi
}

wasm_path() {
  local crate="$1"
  local rel="$WASM_DIR/${crate}.wasm"
  if [[ ! -f "$ROOT/$rel" ]]; then
    echo "No está $ROOT/$rel — corré primero scripts/testnet/02-build.sh" >&2
    exit 1
  fi
  echo "$rel"
}

stage_wasm() {
  local src="$CONTRACTS/target/wasm32v1-none/release"
  mkdir -p "$WASM_HOST"
  if [[ ! -d "$src" ]]; then
    echo "No está $src — corré scripts/testnet/02-build.sh" >&2
    exit 1
  fi
  cp -f "$src"/*.wasm "$WASM_HOST"/
}
