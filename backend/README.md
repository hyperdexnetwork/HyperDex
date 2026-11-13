# HyperDex Backend

WebSocket RFQ router and REST API for the HyperDex sealed-bid DEX on Stellar Soroban. Handles real-time maker connections, price book, RFQ dispatch, and trade history — never touches funds.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        HyperDex Backend                         │
│                         (Node.js / TS)                          │
│                                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌────────────────┐  │
│  │  REST API    │     │  WebSocket   │     │   PriceBook    │  │
│  │  (Express)   │     │  Server      │     │   (in-memory)  │  │
│  │              │     │  /ws/maker   │     │                │  │
│  │ POST /quote  │────▶│              │────▶│ getBestMakers()│  │
│  │ GET  /makers │     │ Auth → Ping  │     │ simulateFill() │  │
│  │ GET  /trades │     │ /Pong loop   │     │ staleDetect()  │  │
│  │ GET  /stats  │     │              │     └────────────────┘  │
│  └──────────────┘     └──────┬───────┘                         │
│         │                    │                                  │
│         │             ┌──────▼───────┐                         │
│         │             │  RFQ Router  │                         │
│         └────────────▶│              │                         │
│                        │ Dispatch →  │                         │
│                        │ Race makers │                         │
│                        │ Best quote  │                         │
│                        └──────┬───────┘                        │
│                               │                                 │
│  ┌────────────────────────────▼──────────────────────────────┐ │
│  │                        MongoDB                             │ │
│  │  Maker | ApiKey | Trade                                    │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
         │                              │
    ┌────▼─────┐               ┌────────▼────────┐
    │ Frontend │               │  Market Makers  │
    │ (Takers) │               │  (WS clients)   │
    └──────────┘               └─────────────────┘
```

## Running Locally

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — set MONGODB_URI and contract addresses at minimum

# 3. Start development server (hot-reload via ts-node)
npm run dev

# 4. Build for production
npm run build
npm start
```

Requires Node.js 20+ and a running MongoDB instance.

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | no | `4000` | HTTP server port |
| `NODE_ENV` | no | `development` | `development` or `production` |
| `MONGODB_URI` | **yes** | — | MongoDB connection string |
| `MONGODB_DB_NAME` | no | `hyperdex` | Database name |
| `STELLAR_NETWORK` | no | `testnet` | Must be `testnet` (mainnet is deprecated) |
| `STELLAR_RPC_URL` | no | soroban-testnet | Soroban RPC endpoint |
| `USDC_CONTRACT_ADDRESS` | **yes** | — | USDC token contract |
| `EURC_CONTRACT_ADDRESS` | **yes** | — | EURC token contract |
| `VAULT_CONTRACT_ADDRESS` | **yes** | — | Vault contract for balance reads |
| `POOL_REGISTRY_CONTRACT_ADDRESS` | **yes** | — | Pool registry contract |
| `CORS_ORIGINS` | no | `http://localhost:3000` | Comma-separated allowed origins |
| `RFQ_TIMEOUT_MS` | no | `750` | Maker quote deadline (ms) |
| `RFQ_MAX_MAKERS` | no | `3` | Max makers to race per RFQ |
| `PRICE_LEVEL_STALE_MS` | no | `5000` | Price levels expire after N ms |
| `WS_PING_INTERVAL_MS` | no | `30000` | Heartbeat interval |
| `WS_PONG_TIMEOUT_MS` | no | `10000` | Disconnect if no pong within N ms |
| `RATE_LIMIT_WINDOW_MS` | no | `1000` | Rate limit window |
| `RATE_LIMIT_MAX_REQUESTS` | no | `10` | Max requests per window |
| `POLL_INTERVAL_MS` | no | `5000` | Poller cycle interval (ms) |
| `TX_TIMEOUT_MS` | no | `300000` | Give up on unconfirmed tx after N ms |
| `POLL_CONCURRENCY` | no | `10` | Max parallel RPC checks per cycle |
| `QUOTE_VERIFIER_CONTRACT_ADDRESS` | **yes** | — | Soroban quote verifier contract (C… format) |

## Maker WebSocket Connection

**URL:** `ws://localhost:4000/ws/maker`

**Required headers:**
```
Authorization: Bearer sk_live_<api_key>
marketmaker: My Maker Name
```

### Connection Flow

```
Client                                Server
  │                                      │
  │──── WS upgrade (/ws/maker) ─────────▶│
  │     Authorization: Bearer <key>       │
  │                                      │ verify API key in DB
  │◀─── { type: "connected", ... } ──────│
  │                                      │
  │──── { type: "priceLevels", ... } ───▶│ stored in PriceBook
  │                                      │
  │     every 30s:                        │
  │◀─── { type: "ping", timestamp } ─────│
  │──── { type: "pong", timestamp } ────▶│
  │                                      │
  │     when taker requests quote:        │
  │◀─── { type: "rfq", message: {...} } ─│
  │                                      │
  │──── { type: "rfqQuote", ... } ──────▶│ resolves pending promise
  │  or { type: "rfqError", ... }        │
```

### Inbound Message Types (maker → server)

**priceLevels** — Broadcast current pricing (non-cumulative levels, best→worst):
```json
{
  "type": "priceLevels",
  "message": {
    "tokenIn": "CBIELTK6YBZJU5U...",
    "tokenOut": "CCUUDM434BMZMYW...",
    "levels": [
      { "quantity": "1000000", "price": "0.9245" },
      { "quantity": "5000000", "price": "0.9240" }
    ]
  }
}
```

**rfqQuote** — Respond to an RFQ with a signed quote:
```json
{
  "type": "rfqQuote",
  "message": {
    "rfqId": "550e8400-e29b-41d4-a716-446655440000",
    "quoteId": "abcdef1234...(64 hex chars)",
    "makerAddress": "GABC...",
    "takerAddress": "GXYZ...",
    "tokenIn": "CBIELTK6...",
    "tokenOut": "CDOIV...",
    "amountIn": "1000000",
    "amountOut": "924500",
    "expiryTimestamp": 1716000060,
    "salt": "deadbeef...(64 hex chars)",
    "signature": "aabbcc...(128 hex chars)"
  }
}
```

**rfqError** — Decline an RFQ:
```json
{
  "type": "rfqError",
  "message": {
    "rfqId": "550e8400-...",
    "reason": "insufficient_liquidity"
  }
}
```
Valid reasons: `insufficient_liquidity` | `pair_not_supported` | `market_conditions` | `internal_error` | `rate_limit`

**pong** — Heartbeat reply:
```json
{ "type": "pong", "timestamp": 1716000000000 }
```

### Outbound Message Types (server → maker)

**rfq** — Server sends a quote request (respond within 750ms):
```json
{
  "type": "rfq",
  "message": {
    "rfqId": "550e8400-e29b-41d4-a716-446655440000",
    "takerAddress": "GXYZ...",
    "tokenIn": "CBIELTK6...",
    "tokenOut": "CDOIV...",
    "amountIn": "1000000",
    "requestedAt": 1716000000000
  }
}
```

## REST API Endpoints

### POST /api/quote
Get best quote for a swap. Rate limited: 10 req/s per IP.

**Request:**
```json
{
  "tokenIn": "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  "tokenOut": "CCUUDM434BMZMYWYDITHFXHDMIVTGGD6T2I5UKNX5BSLXLW7HVR4MCGZ",
  "amountIn": "1000000",
  "takerAddress": "GABC...XYZ"
}
```

**Response 200:**
```json
{
  "success": true,
  "quote": {
    "rfqId": "550e8400-...",
    "quoteId": "abcdef...",
    "makerAddress": "GMAKER...",
    "takerAddress": "GTAKER...",
    "tokenIn": "CBIELTK6...",
    "tokenOut": "CDOIV...",
    "amountIn": "1000000",
    "amountOut": "924500",
    "expiryTimestamp": 1716000060,
    "salt": "deadbeef...",
    "signature": "aabbcc...",
    "rate": "0.924500",
    "expiresInSeconds": 60,
    "makerName": "Alpha MM"
  }
}
```

**Response 503:** No liquidity available  
**Response 400:** Validation error

---

### POST /api/quote/confirm
Called by frontend after taker submits on-chain.

**Request:**
```json
{ "quoteId": "abcdef...", "txHash": "abc123...", "takerAddress": "GTAKER..." }
```

**Response 200:** `{ "success": true }`

---

### GET /api/makers
List active makers for frontend display.

**Response:**
```json
{
  "makers": [
    {
      "name": "Alpha MM",
      "stellarAddress": "GABC...XYZ",
      "connectionStatus": "connected",
      "lastSeenAt": "2024-05-18T12:00:00.000Z",
      "supportedPairs": [{ "tokenIn": "CBIELTK6...", "tokenOut": "CDOIV..." }],
      "totalTrades": 142,
      "totalVolume": 520000
    }
  ]
}
```

---

### POST /api/makers/register
Register a new market maker. Returns API key **once** — save it immediately.

**Request:**
```json
{
  "stellarAddress": "GMAKER...",
  "name": "Alpha MM",
  "signerPublicKey": "abcdef...(64 hex chars)",
  "supportedPairs": [
    { "tokenIn": "CBIELTK6...", "tokenOut": "CDOIV..." }
  ]
}
```

**Response 201:**
```json
{
  "success": true,
  "maker": { "id": "...", "stellarAddress": "GMAKER...", "name": "Alpha MM" },
  "apiKey": "sk_live_abcdef...(72 chars)"
}
```

---

### GET /api/makers/:address/inventory
Fetch maker vault balances from Soroban.

**Response:**
```json
{ "balances": { "usdc": "5000000000", "eurc": "4800000000" } }
```

---

### GET /api/trades
Trade history with optional filters.

**Query params:** `makerAddress`, `takerAddress`, `status`, `limit` (max 100, default 20), `offset`

**Response:**
```json
{ "trades": [...], "total": 500, "hasMore": true }
```

---

### GET /api/stats
Global protocol stats.

**Response:**
```json
{
  "totalVolume24h": 1200000,
  "totalTrades24h": 48,
  "activeMakers": 3,
  "totalFeesCollected": 12000,
  "topPairs": [
    { "tokenIn": "CBIELTK6...", "tokenOut": "CDOIV...", "volume24h": 800000 }
  ]
}
```

---

### GET /health
Health check, no auth required.

**Response:**
```json
{
  "status": "ok",
  "uptime": 3600.5,
  "activeMakers": 2,
  "priceBookEntries": 4,
  "dbStatus": "connected",
  "timestamp": 1716000000000
}
```

## Confirmation Poller

The confirmation poller is a background service that watches the Stellar blockchain and updates trade statuses from `submitted` → `confirmed` or `failed`. It runs automatically as part of the backend process — no separate process required.

### What it does

After a taker calls `POST /api/quote/confirm`, the trade is marked `submitted` in MongoDB. The poller then:

1. Queries all `submitted` trades every 5 seconds
2. Calls the Stellar RPC (`getTransaction`) for each txHash
3. On success — parses the Soroban `quote_executed` event, updates the trade to `confirmed`, and increments the maker's stats
4. On failure — marks the trade `failed` with the on-chain error code
5. On timeout (5 minutes with no confirmation) — marks the trade `failed`
6. Expires `quoted` trades that were never submitted after 2 minutes

### Poll cycle

```
Every 5 seconds:
MongoDB (submitted trades)
     ↓
Stellar RPC (getTransaction)
     ↓ SUCCESS
Parse Soroban events
     ↓
Update Trade → "confirmed"
Update Maker stats
     ↓
Frontend polls /api/trades/:id/status
Shows "Swap Confirmed ✓" to taker
```

### Tuning for production

| Variable | Default | Notes |
|---|---|---|
| `POLL_INTERVAL_MS` | `5000` | Lower = more RPC calls. Stellar finalises in ~5 s, so 5 s is already tight. |
| `TX_TIMEOUT_MS` | `300000` | 5 minutes. Stellar finality is ~5 s, so 5 min means something is genuinely wrong. |
| `POLL_CONCURRENCY` | `10` | Max parallel RPC calls per cycle. Raise with caution — the RPC endpoint may rate-limit. |
| `QUOTE_VERIFIER_CONTRACT_ADDRESS` | required | The deployed Soroban contract address (C… StrKey format). |

### What to do if trades get stuck

Run this query in the MongoDB shell to find all `submitted` trades older than 10 minutes:

```javascript
db.trades.find({
  status: "submitted",
  submittedAt: { $lt: new Date(Date.now() - 600_000) }
})
```

To manually force-confirm a trade (use only as a last resort — the chain is truth):

```javascript
db.trades.updateOne(
  { quoteId: "<quoteId>" },
  { $set: { status: "confirmed", confirmedAt: new Date() } }
)
```

To recalculate a maker's stats from scratch (if they drift out of sync), call `StatsUpdater.recalculateMakerStats(makerAddress)` from a one-off script.

### The 5-minute timeout rationale

Stellar Soroban finalises transactions in approximately 5 seconds. If a transaction has not appeared on-chain after 5 minutes, one of the following has occurred:

- The transaction was never broadcast (frontend bug)
- The sequence number was consumed by another transaction
- The network experienced an outage

In all these cases, the quote has almost certainly expired, so marking the trade `failed` is the correct recovery action.

## MongoDB Index Strategy

| Collection | Index | Rationale |
|---|---|---|
| Maker | `stellarAddress` (unique) | Primary lookup key for WS auth and trade attribution |
| Maker | `active` | Filter active makers for RFQ routing |
| Maker | `lastSeenAt DESC` | Dashboard: sort by most recently seen |
| ApiKey | `makerId` | Look up all keys for a maker |
| ApiKey | `active` | Filter revoked keys |
| Trade | `quoteId` (unique) | Confirm trades by on-chain quote ID |
| Trade | `makerAddress` | Maker dashboard history |
| Trade | `takerAddress` | Taker swap history |
| Trade | `status` | Filter by trade lifecycle |
| Trade | `quotedAt DESC` | Time-series pagination |
| Trade | `(makerAddress, quotedAt DESC)` | Maker-specific history queries |

## Generating a Maker API Key

1. Register the maker:
```bash
curl -X POST http://localhost:4000/api/makers/register \
  -H "Content-Type: application/json" \
  -d '{
    "stellarAddress": "GMAKER...",
    "name": "My Market Maker",
    "signerPublicKey": "abcdef...",
    "supportedPairs": [
      { "tokenIn": "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
        "tokenOut": "CCUUDM434BMZMYWYDITHFXHDMIVTGGD6T2I5UKNX5BSLXLW7HVR4MCGZ" }
    ]
  }'
```

2. Save the returned `apiKey` — it is **never retrievable again**.

3. Use it to connect:
```
Authorization: Bearer sk_live_<key>
```

## Testing the Full RFQ Flow Locally

**Step 1 — Start the server:**
```bash
cp .env.example .env
# set MONGODB_URI=mongodb://localhost:27017/hyperdex
npm run dev
```

**Step 2 — Register a maker and get an API key:**
```bash
curl -X POST http://localhost:4000/api/makers/register \
  -H "Content-Type: application/json" \
  -d '{"stellarAddress":"GAHJJJKMOKYE4RVPZEWZTKH5FVIIA5T2EMWNA5YQBDAGTBU7BVXD9YWZ","name":"Test MM","signerPublicKey":"'$(head -c 32 /dev/urandom | xxd -p)'","supportedPairs":[{"tokenIn":"CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA","tokenOut":"CCUUDM434BMZMYWYDITHFXHDMIVTGGD6T2I5UKNX5BSLXLW7HVR4MCGZ"}]}'
```

**Step 3 — Connect maker WebSocket client (wscat or websocat):**
```bash
wscat -c ws://localhost:4000/ws/maker \
  -H "Authorization: Bearer sk_live_<your_key>" \
  -H "marketmaker: Test MM"
# You'll receive: {"type":"connected","message":{...}}
```

**Step 4 — Send price levels from the maker client:**
```json
{"type":"priceLevels","message":{"tokenIn":"CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA","tokenOut":"CCUUDM434BMZMYWYDITHFXHDMIVTGGD6T2I5UKNX5BSLXLW7HVR4MCGZ","levels":[{"quantity":"100000","price":"0.9245"},{"quantity":"1000000","price":"0.9240"}]}}
```

**Step 5 — Request a quote from REST (separate terminal):**
```bash
curl -X POST http://localhost:4000/api/quote \
  -H "Content-Type: application/json" \
  -d '{"tokenIn":"CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA","tokenOut":"CCUUDM434BMZMYWYDITHFXHDMIVTGGD6T2I5UKNX5BSLXLW7HVR4MCGZ","amountIn":"500000","takerAddress":"GAHJJJKMOKYE4RVPZEWZTKH5FVIIA5T2EMWNA5YQBDAGTBU7BVXD9YWZ"}'
```

**Step 6 — Watch the RFQ arrive at the maker WebSocket:**
```json
{"type":"rfq","message":{"rfqId":"550e8400-...","takerAddress":"GABC...","tokenIn":"CBIELTK6...","tokenOut":"CDOIV...","amountIn":"500000","requestedAt":1716000000000}}
```

**Step 7 — Send rfqQuote back from maker (within 750ms):**
```json
{"type":"rfqQuote","message":{"rfqId":"550e8400-...","quoteId":"<64 hex chars>","makerAddress":"GMAKER...","takerAddress":"GTAKER...","tokenIn":"CBIELTK6...","tokenOut":"CDOIV...","amountIn":"500000","amountOut":"462250","expiryTimestamp":1716000060,"salt":"<64 hex chars>","signature":"<128 hex chars>"}}
```

**Step 8 — The REST call returns the winning quote** with the signed data ready for on-chain submission.
