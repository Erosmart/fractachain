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

deploy_wasm() {
  local wasm="$1"
  stellar contract deploy \
    --wasm "$wasm" \
    --source-account "$DEPLOYER_ID" \
    --network "$NETWORK" \
    | tr -d '\r' | grep -E '^C[A-Z0-9]{55}$' | tail -n 1
}

# stellar-cli 28 still panics on named C-style enums; pass the discriminant.
KIND_XLM=0
KIND_USDC=1
KIND_LICITACION=0
KIND_STOCK=3

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
else
  FACTORY_ID="$(deploy_wasm "$FACTORY_WASM")"
  echo "    factory  $FACTORY_ID"
  save_state factory "$FACTORY_ID"
  invoke "$FACTORY_ID" initialize --admin "$DEPLOYER_PK"
fi
invoke "$FACTORY_ID" set_payment_asset --admin "$DEPLOYER_PK" --kind "$KIND_USDC" --token "$USDC_SAC"
invoke "$FACTORY_ID" set_payment_asset --admin "$DEPLOYER_PK" --kind "$KIND_XLM" --token "$XLM_SAC"

echo "== 3. Stock vault + licitación demo"
STOCK_ID="$(read_state stockVault)"
if [[ "$STOCK_ID" == C* ]]; then
  echo "    reusing stock $STOCK_ID"
else
  STOCK_ID="$(deploy_wasm "$STOCK_WASM")"
  echo "    stock    $STOCK_ID"
  save_state stockVault "$STOCK_ID"
  invoke "$STOCK_ID" initialize_stock \
    --admin "$DEPLOYER_PK" \
    --por_oracle "$POR_PK" \
    --registry "$FACTORY_ID" \
    --payment_token "$USDC_SAC" \
    --ticker TFC \
    --company_name "Fractachain Demo SA" \
    --isin ARDEMOTEST01 \
    --custodian_cuit "30712345678"
fi

LIC_ID="$(read_state licitacion)"
if [[ "$LIC_ID" == C* ]]; then
  echo "    reusing licitacion $LIC_ID"
else
  LIC_ID="$(deploy_wasm "$LIC_WASM")"
  echo "    licitacion $LIC_ID"
  save_state licitacion "$LIC_ID"
  DEADLINE=$(( $(date +%s) + 30*86400 ))
  LEGAL_INFO='{"fideicomiso_hash":"0101010101010101010101010101010101010101010101010101010101010101","cnv_record_id":"CNV-TESTNET-1","legal_terms_uri":"https://fractachain.example/legal"}'
  invoke "$LIC_ID" initialize \
    --admin "$DEPLOYER_PK" \
    --fiduciary "$DEPLOYER_PK" \
    --payment_token "$USDC_SAC" \
    --soft_cap 15000 \
    --hard_cap 100000 \
    --deadline "$DEADLINE" \
    --price_per_unit 10 \
    --legal_info "$LEGAL_INFO"
fi

invoke "$FACTORY_ID" register_product \
  --admin "$DEPLOYER_PK" \
  --kind "$KIND_STOCK" \
  --contract_address "$STOCK_ID" \
  --payment_kind "$KIND_USDC" \
  --price_per_unit 10 \
  --name "Fractachain Demo stock"

invoke "$FACTORY_ID" register_product \
  --admin "$DEPLOYER_PK" \
  --kind "$KIND_LICITACION" \
  --contract_address "$LIC_ID" \
  --payment_kind "$KIND_USDC" \
  --price_per_unit 10 \
  --name "Fractachain Demo IPO"

echo "== 4. WASM de forward/warrant subidos (sin instanciar: necesitan productor/comprador reales)"
FORWARD_HASH="$(stellar contract upload --wasm "$FORWARD_WASM" --source-account "$DEPLOYER_ID" --network "$NETWORK")"
WARRANT_HASH="$(stellar contract upload --wasm "$WARRANT_WASM" --source-account "$DEPLOYER_ID" --network "$NETWORK")"
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
echo "Reiniciá el backend para que lea el deployment."
