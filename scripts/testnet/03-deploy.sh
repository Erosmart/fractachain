#!/usr/bin/env bash
# Sube los WASM a Stellar testnet, instancia factory + productos demo, registra
# USDC/XLM y prende AUTH_REQUIRED en el emisor.
#
# Requiere: 01-keys.sh y 02-build.sh. Gasta XLM del fc-deployer (Friendbot).
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib.sh"
need_stellar
stage_wasm

DEPLOYER_PK="$(addr "$DEPLOYER_ID")"
ISSUER_PK="$(addr "$ISSUER_ID")"
POR_PK="$(addr "$POR_ID")"

FACTORY_WASM="$(wasm_path issuance_factory)"
LIC_WASM="$(wasm_path fractachain_licitacion)"
STOCK_WASM="$(wasm_path stock_vault)"
FORWARD_WASM="$(wasm_path forward_contract)"
WARRANT_WASM="$(wasm_path warrant_vault)"

mkdir -p "$DEPLOYMENTS"
STATE="$DEPLOYMENTS/testnet.json"

invoke() {
  local id="$1"
  shift
  stellar contract invoke \
    --id "$id" \
    --source-account "$DEPLOYER_ID" \
    --network "$NETWORK" \
    --send=yes \
    -- \
    "$@"
}

# Read-only call (simulation only): prints the JSON result.
view() {
  local id="$1"
  shift
  stellar contract invoke \
    --id "$id" \
    --source-account "$DEPLOYER_ID" \
    --network "$NETWORK" \
    --send=no \
    -- \
    "$@" | tr -d '\r"' | tail -n 1
}

# Contracts run their constructor in the deploy transaction (SC-06), so a
# fresh instance can't be initialized by someone else first. Instances reused
# from the state file may predate that (deploy + initialize): their stored
# admin must still be ours.
require_admin() {
  local id="$1" label="$2"
  local stored
  stored="$(view "$id" get_admin || true)"
  if [[ "$stored" != "$DEPLOYER_PK" ]]; then
    echo "ERROR: $label $id tiene admin '$stored', esperado $DEPLOYER_PK." >&2
    echo "       Instancia ajena o initialize adelantado (WASM viejo): NO se usa. Redeployá." >&2
    exit 1
  fi
  echo "    admin verificado ($label)"
}

# deploy_wasm <file.wasm> [constructor args…]
deploy_wasm() {
  local wasm="$1"
  shift
  stellar contract deploy \
    --wasm "$wasm" \
    --source-account "$DEPLOYER_ID" \
    --network "$NETWORK" \
    -- "$@" \
    | tr -d '\r' | grep -E '^C[A-Z0-9]{55}$' | tail -n 1
}

upload_wasm() {
  stellar contract upload --wasm "$1" --source-account "$DEPLOYER_ID" --network "$NETWORK" | tr -d '\r' | tail -n 1
}

# stellar-cli 28 still panics on named C-style enums; pass the discriminant.
KIND_XLM=0
KIND_USDC=1
KIND_LICITACION=0


read_state() {
  python3 - "$STATE" "$1" <<'PY'
import json, pathlib, sys
path = pathlib.Path(sys.argv[1])
key = sys.argv[2]
if not path.exists():
    print("")
    raise SystemExit
print(json.loads(path.read_text()).get(key) or "")
PY
}

save_state() {
  python3 - "$STATE" "$1" "$2" <<'PY'
import json, pathlib, sys, datetime
path = pathlib.Path(sys.argv[1])
data = json.loads(path.read_text()) if path.exists() else {}
data[sys.argv[2]] = sys.argv[3]
data["network"] = "testnet"
data["updatedAt"] = datetime.datetime.utcnow().isoformat() + "Z"
path.write_text(json.dumps(data, indent=2) + "\n")
PY
}

echo "== 1. SAC de USDC y XLM (ids determinísticos; deploy es no-op si ya existen)"
XLM_SAC="$(stellar contract id asset --asset native --network "$NETWORK")"
USDC_SAC="$(stellar contract id asset --asset "${USDC_CODE}:${USDC_ISSUER}" --network "$NETWORK")"
stellar contract asset deploy --asset native --source-account "$DEPLOYER_ID" --network "$NETWORK" >/dev/null 2>&1 || true
stellar contract asset deploy --asset "${USDC_CODE}:${USDC_ISSUER}" --source-account "$DEPLOYER_ID" --network "$NETWORK" >/dev/null 2>&1 || true
echo "    XLM SAC  $XLM_SAC"
echo "    USDC SAC $USDC_SAC"
save_state usdcSac "$USDC_SAC"
save_state xlmSac "$XLM_SAC"

echo "== 2. Factory"
FACTORY_ID="$(read_state factory)"
if [[ "$FACTORY_ID" == C* ]]; then
  echo "    reusing factory $FACTORY_ID"
  require_admin "$FACTORY_ID" factory
  # Vaults are deployed by the factory now (deploy_stock_vault, SC-02).
  if ! view "$FACTORY_ID" product_id_of --contract_address "$FACTORY_ID" >/dev/null 2>&1; then
    echo "ERROR: la factory $FACTORY_ID es del WASM viejo (no despliega vaults)." >&2
    echo "       Borrá \"factory\" de $STATE para desplegar una nueva." >&2
    exit 1
  fi
else
  FACTORY_ID="$(deploy_wasm "$FACTORY_WASM" --admin "$DEPLOYER_PK")"
  echo "    factory  $FACTORY_ID"
  require_admin "$FACTORY_ID" factory
  save_state factory "$FACTORY_ID"
fi
invoke "$FACTORY_ID" set_payment_asset --admin "$DEPLOYER_PK" --kind "$KIND_USDC" --token "$USDC_SAC"
invoke "$FACTORY_ID" set_payment_asset --admin "$DEPLOYER_PK" --kind "$KIND_XLM" --token "$XLM_SAC"

echo "== 3. Stock vault + licitación demo"
FACTORY_HASH="$(upload_wasm "$FACTORY_WASM")"
STOCK_HASH="$(upload_wasm "$STOCK_WASM")"
LIC_HASH="$(upload_wasm "$LIC_WASM")"
save_state factoryWasmHash "$FACTORY_HASH"
save_state stockVaultWasmHash "$STOCK_HASH"
save_state licitacionWasmHash "$LIC_HASH"

STOCK_ID="$(read_state stockVault)"
if [[ "$STOCK_ID" == C* ]]; then
  echo "    reusing stock $STOCK_ID"
  require_admin "$STOCK_ID" "stock vault"
else
  # SC-02: the factory deploys the vault and signs off its constructor; that
  # is the only way a vault can name this factory as its registry. It also
  # registers the product.
  STOCK_ID="$(invoke "$FACTORY_ID" deploy_stock_vault \
    --admin "$DEPLOYER_PK" \
    --wasm_hash "$STOCK_HASH" \
    --salt "$(python3 -c 'import secrets; print(secrets.token_hex(32))')" \
    --custodian "$DEPLOYER_PK" \
    --por_oracle "$POR_PK" \
    --payment_kind "$KIND_USDC" \
    --terms '{"ticker":"TFC","company_name":"Fractachain Demo SA","isin":"ARDEMOTEST01","custodian_cuit":"30712345678"}' \
    --name "Fractachain Demo stock" | tr -d '\r"' | tail -n 1)"
  echo "    stock    $STOCK_ID"
  require_admin "$STOCK_ID" "stock vault"
  if [[ "$(view "$STOCK_ID" get_registry)" != "$FACTORY_ID" ]]; then
    echo "ERROR: el stock vault no apunta a la factory $FACTORY_ID" >&2
    exit 1
  fi
  save_state stockVault "$STOCK_ID"
fi

LIC_ID="$(read_state licitacion)"
if [[ "$LIC_ID" == C* ]]; then
  echo "    reusing licitacion $LIC_ID"
  require_admin "$LIC_ID" licitacion
else
  DEADLINE=$(( $(date +%s) + 30*86400 ))
  LEGAL_INFO='{"fideicomiso_hash":"0101010101010101010101010101010101010101010101010101010101010101","cnv_record_id":"CNV-TESTNET-1","legal_terms_uri":"https://fractachain.example/legal"}'
  # Constructor args after `--`: deploy and construction are one transaction.
  LIC_ID="$(deploy_wasm "$LIC_WASM" \
    --admin "$DEPLOYER_PK" \
    --fiduciary "$DEPLOYER_PK" \
    --payment_token "$USDC_SAC" \
    --soft_cap 15000 \
    --hard_cap 100000 \
    --deadline "$DEADLINE" \
    --price_per_unit 10 \
    --legal_info "$LEGAL_INFO")"
  echo "    licitacion $LIC_ID"
  require_admin "$LIC_ID" licitacion
  save_state licitacion "$LIC_ID"
fi

# The stock vault was registered by deploy_stock_vault. The licitación is
# deployed by its admin, so it is registered here (once).
if ! [[ "$(view "$FACTORY_ID" product_id_of --contract_address "$LIC_ID")" =~ ^[0-9]+$ ]]; then
  invoke "$FACTORY_ID" register_product \
    --admin "$DEPLOYER_PK" \
    --kind "$KIND_LICITACION" \
    --contract_address "$LIC_ID" \
    --payment_kind "$KIND_USDC" \
    --price_per_unit 10 \
    --name "Fractachain Demo IPO"
fi

echo "== 4. WASM de forward/warrant subidos (los instancia la factory: 05-forward-warrant.sh)"
FORWARD_HASH="$(upload_wasm "$FORWARD_WASM")"
WARRANT_HASH="$(upload_wasm "$WARRANT_WASM")"
echo "    forward wasm  $FORWARD_HASH"
echo "    warrant wasm  $WARRANT_HASH"

echo "== 5. Flags AUTH_REQUIRED + AUTH_REVOCABLE en el emisor"
stellar tx new set-options \
  --source-account "$ISSUER_ID" \
  --network "$NETWORK" \
  --set-required \
  --set-revocable

python3 - "$STATE" \
  "$DEPLOYER_PK" "$ISSUER_PK" "$POR_PK" \
  "$FACTORY_ID" "$STOCK_ID" "$LIC_ID" \
  "$USDC_SAC" "$XLM_SAC" \
  "$FORWARD_HASH" "$WARRANT_HASH" \
  "$USDC_ISSUER" <<'PY'
import json, pathlib, sys, datetime
path = pathlib.Path(sys.argv[1])
data = json.loads(path.read_text()) if path.exists() else {}
data.update({
    "network": "testnet",
    "updatedAt": datetime.datetime.utcnow().isoformat() + "Z",
    "horizon": "https://horizon-testnet.stellar.org",
    "rpc": "https://soroban-testnet.stellar.org",
    "passphrase": "Test SDF Network ; September 2015",
    "deployer": sys.argv[2],
    "issuer": sys.argv[3],
    "porOracle": sys.argv[4],
    "factory": sys.argv[5],
    "stockVault": sys.argv[6],
    "licitacion": sys.argv[7],
    "usdcSac": sys.argv[8],
    "xlmSac": sys.argv[9],
    "forwardWasmHash": sys.argv[10],
    "warrantWasmHash": sys.argv[11],
    "usdcClassic": {"code": "USDC", "issuer": sys.argv[12]},
})
path.write_text(json.dumps(data, indent=2) + "\n")
print(json.dumps(data, indent=2))
PY

echo
echo "Listo. IDs públicos en deployments/testnet.json"
echo "Lab: https://stellar.expert/explorer/testnet/contract/$FACTORY_ID"
echo "Reiniciá el API (npm run dev:api) para que lea el deployment."
