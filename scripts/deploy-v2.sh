#!/usr/bin/env bash
# HyperDEX v2 deploy script — per-maker pool architecture
# Deploys: pool_registry, fee_distributor, maker_pool (wasm upload only),
#          quote_verifier, maker_pool_factory
#
# Usage:
#   export ADMIN_IDENTITY=admin
#   bash scripts/deploy-v2.sh

set -euo pipefail

# Deploy target: NETWORK=mainnet bash scripts/deploy-v2.sh (defaults to testnet).
# On mainnet you must also override USDC/EURC with the Circle mainnet SAC
# addresses and should set TREASURY to a dedicated wallet.
NETWORK="${NETWORK:-testnet}"
if [ "$NETWORK" = "mainnet" ]; then
  export STELLAR_NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015"
  export STELLAR_RPC_URL="${STELLAR_RPC_URL:-https://mainnet.sorobanrpc.com}"
else
  export STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
  # The CLI rejects a passphrase without a matching RPC URL, so set both.
  export STELLAR_RPC_URL="${STELLAR_RPC_URL:-https://soroban-testnet.stellar.org}"
fi
ADMIN_IDENTITY="${ADMIN_IDENTITY:-admin}"

USDC="${USDC:-CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA}"
EURC="${EURC:-CCUUDM434BMZMYWYDITHFXHDMIVTGGD6T2I5UKNX5BSLXLW7HVR4MCGZ}"
PROTOCOL_FEE_BPS=10

ADMIN_ADDRESS=$(stellar keys address "$ADMIN_IDENTITY" 2>/dev/null || {
  echo "ERROR: identity '$ADMIN_IDENTITY' not found."
  exit 1
})
TREASURY="${TREASURY:-$ADMIN_ADDRESS}"

echo "=== HyperDEX v2 Deployment ==="
echo "Network:  $NETWORK"
echo "Admin:    $ADMIN_ADDRESS"
echo "USDC:     $USDC"
echo "EURC:     $EURC"
echo ""

# 1. Build all contracts
echo ">> Building contracts..."
# Use the stellar CLI build pipeline (wasm32v1-none + spec shaking): binaries
# come out ~2x smaller than plain cargo wasm32-unknown-unknown, which halves
# mainnet upload fees and ongoing rent.
stellar contract build
WASM_DIR="target/wasm32v1-none/release"

echo ">> Optimizing WASMs..."
for contract in pool_registry fee_distributor maker_pool maker_pool_factory quote_verifier; do
  stellar contract optimize --wasm "$WASM_DIR/${contract}.wasm" --quiet 2>/dev/null || true
  if [ -f "$WASM_DIR/${contract}.optimized.wasm" ]; then
    cp "$WASM_DIR/${contract}.optimized.wasm" "$WASM_DIR/${contract}_deploy.wasm"
  else
    cp "$WASM_DIR/${contract}.wasm" "$WASM_DIR/${contract}_deploy.wasm"
  fi
done

# 2. Deploy pool_registry
echo ">> Deploying pool_registry..."
POOL_REGISTRY=$(stellar contract deploy \
  --wasm "$WASM_DIR/pool_registry_deploy.wasm" \
  --source "$ADMIN_IDENTITY" \
  --network "$NETWORK")
echo "   pool_registry: $POOL_REGISTRY"

# 3. Deploy fee_distributor
echo ">> Deploying fee_distributor..."
FEE_DISTRIBUTOR=$(stellar contract deploy \
  --wasm "$WASM_DIR/fee_distributor_deploy.wasm" \
  --source "$ADMIN_IDENTITY" \
  --network "$NETWORK")
echo "   fee_distributor: $FEE_DISTRIBUTOR"

# 4. Upload maker_pool wasm only (get hash — don't deploy an instance yet)
echo ">> Uploading maker_pool wasm..."
MAKER_POOL_WASM_HASH=$(stellar contract upload \
  --wasm "$WASM_DIR/maker_pool_deploy.wasm" \
  --source "$ADMIN_IDENTITY" \
  --network "$NETWORK")
echo "   maker_pool wasm hash: $MAKER_POOL_WASM_HASH"

# 5. Deploy quote_verifier
echo ">> Deploying quote_verifier..."
QUOTE_VERIFIER=$(stellar contract deploy \
  --wasm "$WASM_DIR/quote_verifier_deploy.wasm" \
  --source "$ADMIN_IDENTITY" \
  --network "$NETWORK")
echo "   quote_verifier: $QUOTE_VERIFIER"

# 6. Deploy maker_pool_factory
echo ">> Deploying maker_pool_factory..."
MAKER_POOL_FACTORY=$(stellar contract deploy \
  --wasm "$WASM_DIR/maker_pool_factory_deploy.wasm" \
  --source "$ADMIN_IDENTITY" \
  --network "$NETWORK")
echo "   maker_pool_factory: $MAKER_POOL_FACTORY"

# 7. Initialize all contracts

echo ">> Initializing pool_registry..."
stellar contract invoke \
  --id "$POOL_REGISTRY" \
  --source "$ADMIN_IDENTITY" \
  --network "$NETWORK" \
  -- initialize \
  --admin "$ADMIN_ADDRESS" \
  --factory "$MAKER_POOL_FACTORY"

echo ">> Initializing fee_distributor..."
stellar contract invoke \
  --id "$FEE_DISTRIBUTOR" \
  --source "$ADMIN_IDENTITY" \
  --network "$NETWORK" \
  -- initialize \
  --admin "$ADMIN_ADDRESS" \
  --treasury "$TREASURY"

echo ">> Initializing quote_verifier..."
stellar contract invoke \
  --id "$QUOTE_VERIFIER" \
  --source "$ADMIN_IDENTITY" \
  --network "$NETWORK" \
  -- initialize \
  --admin "$ADMIN_ADDRESS" \
  --registry "$POOL_REGISTRY" \
  --fee_distributor "$FEE_DISTRIBUTOR" \
  --usdc "$USDC" \
  --eurc "$EURC" \
  --fee_bps "$PROTOCOL_FEE_BPS"

echo ">> Initializing maker_pool_factory..."
stellar contract invoke \
  --id "$MAKER_POOL_FACTORY" \
  --source "$ADMIN_IDENTITY" \
  --network "$NETWORK" \
  -- initialize \
  --admin "$ADMIN_ADDRESS" \
  --pool_registry "$POOL_REGISTRY" \
  --quote_verifier "$QUOTE_VERIFIER" \
  --fee_distributor "$FEE_DISTRIBUTOR" \
  --usdc "$USDC" \
  --eurc "$EURC" \
  --pool_wasm_hash "$MAKER_POOL_WASM_HASH"

# 8. Update .env files

update_env() {
  local file=$1
  local key=$2
  local value=$3
  if [ -f "$file" ]; then
    if grep -q "^${key}=" "$file"; then
      sed -i "s|^${key}=.*|${key}=${value}|" "$file"
    else
      echo "${key}=${value}" >> "$file"
    fi
  fi
}

echo ">> Updating .env files..."

BACKEND_ENV="backend/.env"
FRONTEND_ENV="frontend/.env.local"

update_env "$BACKEND_ENV" "POOL_REGISTRY_CONTRACT_ADDRESS" "$POOL_REGISTRY"
update_env "$BACKEND_ENV" "QUOTE_VERIFIER_CONTRACT_ADDRESS" "$QUOTE_VERIFIER"
update_env "$BACKEND_ENV" "FEE_DISTRIBUTOR_CONTRACT_ADDRESS" "$FEE_DISTRIBUTOR"
update_env "$BACKEND_ENV" "MAKER_POOL_FACTORY_ADDRESS" "$MAKER_POOL_FACTORY"
update_env "$BACKEND_ENV" "PROTOCOL_FEE_BPS" "$PROTOCOL_FEE_BPS"
update_env "$BACKEND_ENV" "ADMIN_ADDRESS" "$ADMIN_ADDRESS"
# The token SACs are inputs to this deploy, so record them too — a stale
# USDC/EURC in the backend env silently disagrees with what quote_verifier was
# initialized against, and every settlement then fails on InvalidTokens.
update_env "$BACKEND_ENV" "USDC_CONTRACT_ADDRESS" "$USDC"
update_env "$BACKEND_ENV" "EURC_CONTRACT_ADDRESS" "$EURC"

# The frontend carries BOTH networks at once and selects one at runtime, so
# write network-scoped keys. Writing the unsuffixed keys here would let a
# testnet deploy overwrite the live mainnet addresses.
NET_UPPER=$(echo "$NETWORK" | tr '[:lower:]' '[:upper:]')
update_env "$FRONTEND_ENV" "NEXT_PUBLIC_${NET_UPPER}_POOL_REGISTRY_CONTRACT" "$POOL_REGISTRY"
update_env "$FRONTEND_ENV" "NEXT_PUBLIC_${NET_UPPER}_QUOTE_VERIFIER_CONTRACT" "$QUOTE_VERIFIER"
update_env "$FRONTEND_ENV" "NEXT_PUBLIC_${NET_UPPER}_MAKER_POOL_FACTORY_ADDRESS" "$MAKER_POOL_FACTORY"
update_env "$FRONTEND_ENV" "NEXT_PUBLIC_${NET_UPPER}_FEE_DISTRIBUTOR_CONTRACT" "$FEE_DISTRIBUTOR"
update_env "$FRONTEND_ENV" "NEXT_PUBLIC_${NET_UPPER}_ADMIN_ADDRESS" "$ADMIN_ADDRESS"
update_env "$FRONTEND_ENV" "NEXT_PUBLIC_${NET_UPPER}_USDC_CONTRACT" "$USDC"
update_env "$FRONTEND_ENV" "NEXT_PUBLIC_${NET_UPPER}_EURC_CONTRACT" "$EURC"

# Remove old vault references
for f in "$BACKEND_ENV" "$FRONTEND_ENV"; do
  [ -f "$f" ] && sed -i '/^VAULT_CONTRACT_ADDRESS=/d' "$f" || true
  [ -f "$f" ] && sed -i '/^NEXT_PUBLIC_VAULT_CONTRACT_ADDRESS=/d' "$f" || true
done

echo ""
echo "=== DEPLOYMENT COMPLETE ==="
echo "pool_registry:       $POOL_REGISTRY"
echo "fee_distributor:     $FEE_DISTRIBUTOR"
echo "maker_pool_wasm:     $MAKER_POOL_WASM_HASH"
echo "quote_verifier:      $QUOTE_VERIFIER"
echo "maker_pool_factory:  $MAKER_POOL_FACTORY"
echo ""
echo "All .env files updated. Restart backend and frontend."
