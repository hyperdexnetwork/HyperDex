#!/usr/bin/env bash
# Bootstrap a working market maker on the local testnet stack.
#
# Drives the same path a real maker takes — apply, admin approval, signer-key
# registration, on-chain pool deploy — but non-interactively, so the testnet
# environment can be rebuilt from scratch at any time.
#
# Requires: the testnet backend running on $BACKEND_HTTP_URL, the `stellar` CLI,
# and maker-sdk dependencies installed.
#
# Usage:
#   bash scripts/bootstrap-testnet-maker.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_HTTP_URL="${BACKEND_HTTP_URL:-http://localhost:4000}"
MAKER_IDENTITY="${MAKER_IDENTITY:-hyperdex-testnet-maker}"
MAKER_NAME="${MAKER_NAME:-Testnet Maker}"
MAKER_EMAIL="${MAKER_EMAIL:-maker@testnet.local}"

USDC="${USDC:-CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA}"
# Circle testnet EURC (issuer GB3Q6QDZ…, home_domain circle.com). Deliberately
# a different issuer from the USDC above (GBBD47IF…, centre.io).
EURC="${EURC:-CCUUDM434BMZMYWYDITHFXHDMIVTGGD6T2I5UKNX5BSLXLW7HVR4MCGZ}"

# Pulled from the backend's own env so the two can never disagree.
BACKEND_ENV="$ROOT/backend/.env"
[ -f "$BACKEND_ENV" ] || { echo "ERROR: $BACKEND_ENV not found."; exit 1; }
envval() { grep -E "^$1=" "$BACKEND_ENV" | head -1 | cut -d= -f2-; }

ADMIN_API_KEY="$(envval ADMIN_API_KEY)"
POOL_REGISTRY="$(envval POOL_REGISTRY_CONTRACT_ADDRESS)"
QUOTE_VERIFIER="$(envval QUOTE_VERIFIER_CONTRACT_ADDRESS)"
FACTORY="$(envval MAKER_POOL_FACTORY_ADDRESS)"
[ -n "$ADMIN_API_KEY" ] || { echo "ERROR: ADMIN_API_KEY missing from backend/.env"; exit 1; }
[ -n "$FACTORY" ]       || { echo "ERROR: MAKER_POOL_FACTORY_ADDRESS missing from backend/.env"; exit 1; }

echo "=== Bootstrap testnet maker ==="
echo "Backend:  $BACKEND_HTTP_URL"
echo "Factory:  $FACTORY"
echo ""

# ── 1. Maker Stellar account ────────────────────────────────────────────────
if stellar keys address "$MAKER_IDENTITY" >/dev/null 2>&1; then
  echo ">> Reusing identity '$MAKER_IDENTITY'"
else
  echo ">> Creating + funding identity '$MAKER_IDENTITY'"
  stellar keys generate "$MAKER_IDENTITY" --network testnet --fund >/dev/null
fi
MAKER_ADDRESS="$(stellar keys address "$MAKER_IDENTITY")"
echo "   maker: $MAKER_ADDRESS"

# ── 2. Quote-signing keypair (ed25519, separate from the Stellar account) ────
# The pool stores only the public key; the seed lives in maker-sdk/.env and is
# what signs each RFQ quote.
SIGNER_JSON="$(cd "$ROOT/maker-sdk" && node -e '
const nacl = require("tweetnacl");
const crypto = require("crypto");
const seed = crypto.randomBytes(32);
const kp = nacl.sign.keyPair.fromSeed(seed);
console.log(JSON.stringify({
  seed: seed.toString("hex"),
  pub: Buffer.from(kp.publicKey).toString("hex"),
}));
')"
SIGNER_SEED="$(echo "$SIGNER_JSON" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).seed')"
SIGNER_PUB="$(echo "$SIGNER_JSON"  | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).pub')"
echo ">> Signer public key: $SIGNER_PUB"

# ── 3. Apply as a maker (409 = already applied, which is fine) ───────────────
echo ">> Submitting maker application..."
curl -sS -X POST "$BACKEND_HTTP_URL/api/makers/apply" \
  -H 'Content-Type: application/json' \
  -d "{\"stellarAddress\":\"$MAKER_ADDRESS\",\"name\":\"$MAKER_NAME\",\"contactEmail\":\"$MAKER_EMAIL\",\"requestedPairs\":[{\"tokenIn\":\"$USDC\",\"tokenOut\":\"$EURC\"},{\"tokenIn\":\"$EURC\",\"tokenOut\":\"$USDC\"}]}" \
  -o /tmp/hd-apply.json -w '   HTTP %{http_code}\n' || true

# ── 4. Admin approval → API key ─────────────────────────────────────────────
echo ">> Locating pending application..."
PENDING_ID="$(curl -sS "$BACKEND_HTTP_URL/api/admin/pending?status=pending" \
  -H "x-admin-key: $ADMIN_API_KEY" \
  | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
  const addr = process.argv[1];
  let j; try { j = JSON.parse(d); } catch { process.exit(0); }
  const list = j.applications ?? j.data ?? j.pending ?? [];
  const m = list.find(a => a.stellarAddress === addr);
  if (m) process.stdout.write(m._id ?? m.id ?? "");
});' "$MAKER_ADDRESS")"

if [ -n "$PENDING_ID" ]; then
  echo "   approving $PENDING_ID"
  API_KEY="$(curl -sS -X POST "$BACKEND_HTTP_URL/api/admin/pending/$PENDING_ID/approve" \
    -H "x-admin-key: $ADMIN_API_KEY" \
    | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).apiKey ?? ""')"
else
  echo "   no pending application — already approved, rotating key"
  APPROVED_ID="$(curl -sS "$BACKEND_HTTP_URL/api/admin/pending?status=approved" \
    -H "x-admin-key: $ADMIN_API_KEY" \
    | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
  const addr = process.argv[1];
  let j; try { j = JSON.parse(d); } catch { process.exit(0); }
  const list = j.applications ?? j.data ?? j.pending ?? [];
  const m = list.find(a => a.stellarAddress === addr);
  if (m) process.stdout.write(m._id ?? m.id ?? "");
});' "$MAKER_ADDRESS")"
  [ -n "$APPROVED_ID" ] || { echo "ERROR: maker neither pending nor approved."; exit 1; }
  API_KEY="$(curl -sS -X POST "$BACKEND_HTTP_URL/api/admin/pending/$APPROVED_ID/rotate-key" \
    -H "x-admin-key: $ADMIN_API_KEY" \
    | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).apiKey ?? ""')"
fi
[ -n "$API_KEY" ] || { echo "ERROR: no API key returned by backend."; exit 1; }
echo "   API key: ${API_KEY:0:16}…"

# ── 5. Bind the signing key to the maker record ─────────────────────────────
echo ">> Registering signer key with backend..."
curl -sS -X POST "$BACKEND_HTTP_URL/api/makers/register-signer-key" \
  -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' \
  -d "{\"signerPublicKey\":\"$SIGNER_PUB\"}" -w '   HTTP %{http_code}\n' -o /dev/null

# ── 6. Deploy the on-chain pool (also registers it in pool_registry) ────────
echo ">> Deploying maker pool via factory..."
set +e
POOL_ADDRESS="$(stellar contract invoke \
  --id "$FACTORY" \
  --source "$MAKER_IDENTITY" \
  --network testnet \
  --send=yes \
  -- deploy_pool \
  --maker "$MAKER_ADDRESS" \
  --signer_key "$SIGNER_PUB" \
  --supported_pairs "[[\"$USDC\",\"$EURC\"],[\"$EURC\",\"$USDC\"]]" 2>/tmp/hd-pool.err | tr -d '"')"
DEPLOY_RC=$?
set -e

if [ $DEPLOY_RC -ne 0 ] || [ -z "$POOL_ADDRESS" ]; then
  if grep -q "PoolAlreadyDeployed\|#3" /tmp/hd-pool.err 2>/dev/null; then
    echo "   pool already deployed — reading it back from the factory"
    POOL_ADDRESS="$(stellar contract invoke --id "$FACTORY" --source "$MAKER_IDENTITY" --network testnet \
      -- get_pool --maker "$MAKER_ADDRESS" 2>/dev/null | tr -d '"')"
    # deploy_pool short-circuits before register_maker, so the registry still
    # holds the signer key from the FIRST run while step 2 just minted a new
    # one. quote_verifier reads the registry, so leaving these divergent makes
    # every bid fail ed25519 verification. Push the new key on-chain.
    echo "   syncing registry signer key to the freshly generated one"
    stellar contract invoke --id "$POOL_REGISTRY" --source "$MAKER_IDENTITY" --network testnet --send=yes       -- update_signer --maker "$MAKER_ADDRESS" --new_signer_key "$SIGNER_PUB" >/dev/null 2>&1       || { echo "ERROR: update_signer failed — registry key is stale."; exit 1; }
  else
    echo "ERROR: deploy_pool failed:"; cat /tmp/hd-pool.err; exit 1
  fi
fi
echo "   pool: $POOL_ADDRESS"

# ── 7. Write maker-sdk/.env ─────────────────────────────────────────────────
MAKER_ENV="$ROOT/maker-sdk/.env"
echo ">> Writing $MAKER_ENV"
cat > "$MAKER_ENV" <<EOF
# Generated by scripts/bootstrap-testnet-maker.sh — testnet only.
STELLAR_NETWORK=testnet
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
USDC_CONTRACT_ADDRESS=$USDC
EURC_CONTRACT_ADDRESS=$EURC
POOL_REGISTRY_CONTRACT_ADDRESS=$POOL_REGISTRY
QUOTE_VERIFIER_CONTRACT_ADDRESS=$QUOTE_VERIFIER
MAKER_POOL_FACTORY_ADDRESS=$FACTORY
MAKER_API_KEY=$API_KEY
SIGNER_PRIVATE_KEY=$SIGNER_SEED
MAKER_ADDRESS=$MAKER_ADDRESS
POOL_ADDRESS=$POOL_ADDRESS
MAKER_NAME=$MAKER_NAME
PORT=3001
BACKEND_WS_URL=ws://localhost:4000/ws/maker
BACKEND_HTTP_URL=$BACKEND_HTTP_URL
EOF

echo ""
echo "=== MAKER READY ==="
echo "maker address: $MAKER_ADDRESS"
echo "pool address:  $POOL_ADDRESS"
echo "signer pubkey: $SIGNER_PUB"
echo ""
echo "Next: fund the pool with testnet USDC/EURC, then run:"
echo "  cd maker-sdk && npm run dev"
