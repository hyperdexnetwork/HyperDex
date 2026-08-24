# Testing Maker Engines (E2E)

How to verify the MakerEngine plugin system: the SDK collecting prices from an
engine, quoting RFQs, and producing swap-ready signed quotes. Also covers how a
maker plugs in their own engine and how to write a new one.

The SDK owns the boring infra (WebSocket, auth, ed25519 quote signing in the
exact XDR encoding the Soroban contract verifies, inventory reads, trade-confirm
handling). An **engine** only answers two questions:

| Method | When | Returns |
|---|---|---|
| `getLevels()` | every ~3s | your resting book `{ sellLevels, buyLevels }` (empty arrays = go offline gracefully) |
| `getQuote(ctx)` | on each RFQ | `amountOut` in stroops (string), or `null` to skip with no penalty |
| `onTradeConfirmed(trade)` *(optional)* | when a fill settles | nothing — use it to refresh inventory / hedge |

---

## 1. Run the SDK with any maker + any engine

```bash
cd maker-sdk

# Built-in ghost-price engine (default). Prompts for a ghost price interactively.
npm run dev hog

# Skip the prompt (CI / non-interactive) by passing the ghost price as an env var:
GHOST_PRICE=0.8788 npm run dev hog

# Custom engine — NOTE the `--` separator (npm strips a bare --flag otherwise):
npm run dev hog -- --engine=./examples/fixed-rate-engine.ts
npm run dev hog -- --engine=./examples/binance-engine.ts

# Any other maker is just a different credential file in credentials/<name>.cred:
npm run dev kino -- --engine=./examples/binance-engine.ts
npm run dev mm1
```

Confirm the startup banner reports the right engine:
- `Engine: Built-in (ghost-price)` for the default
- `Engine: binance-engine.ts [custom]` for a custom one

A custom engine **skips** the ghost-price prompt and the Ctrl+R re-price key —
it owns its full pricing logic.

### Health check while running
```bash
curl -s localhost:3001/health | jq    # midRate, volatility, vault {usdc,eurc}
```

---

## 2. Full E2E: prove the engine quotes a live auction (no browser)

The production backend runs a 30-second sealed-bid auction:
`POST /api/quote/start` dispatches an RFQ to every maker whose price levels rank,
then `GET /api/quote/result/:auctionId` returns the winning **signed** quote.

Recipe (with a maker already running and connected):

```bash
# Testnet backend — the USDC/EURC below are Circle's TESTNET SACs
BACKEND=https://hyperdex-testnet.onrender.com
USDC=CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA
EURC=CCUUDM434BMZMYWYDITHFXHDMIVTGGD6T2I5UKNX5BSLXLW7HVR4MCGZ
TAKER=GBZKYPAK56QGFGSP6NKDLNUNC5CQ3R2HKRXLGHJFSIH236NZ6XRCWB6A

# 1) start an auction (3 USDC in -> EURC out)
curl -s -XPOST $BACKEND/api/quote/start -H 'Content-Type: application/json' \
  -d "{\"tokenIn\":\"$USDC\",\"tokenOut\":\"$EURC\",\"amountIn\":\"30000000\",\"takerAddress\":\"$TAKER\"}"
# -> { auctionId, makerCount }

# 2) poll until completed (~30s)
curl -s $BACKEND/api/quote/result/<auctionId> | jq
# -> bestQuote { makerName, rate, humanAmountOut, signature, ... }
```

What to look for:
- The maker's terminal prints `[RFQ] Quoted rfqId=…` → **the engine produced a quote**.
- The auction result is `completed` with a `bestQuote.signature` (128 hex chars).
- `bestQuote.makerAddress` is your maker → it won.

`amountIn`/`amountOut` are in **stroops** (7 decimals): 1 token = `10000000`.

> A scripted version of this exact harness lives in
> `scratchpad/e2e.js` from the verification run — spawn `server.ts`, wait for
> `Connected to HyperDEX backend`, fire the auction, scrape the `[RFQ]` lines.

### What this proves vs. what it doesn't
- **Proven:** engine → SDK → backend RFQ → `getQuote` → signed quote → auction.
  The SDK signs with the exact XDR ScVal hash the Soroban contract checks, and
  the SDK signer pubkey must equal the maker's registered `signerPublicKey`
  (verify via `GET /api/makers/<G…>/status`). If it does, the quote is
  on-chain-settleable.
- **Not exercised here:** the taker's final on-chain submission. That needs a
  funded taker wallet signing a Soroban tx in the browser (frontend `/swap`),
  followed by `POST /api/quote/confirm`. The signature validity is already
  guaranteed by the matching key + encoding above.

---

## 3. How a maker plugs in their engine

1. Write an engine file that `export default`s a `MakerEngine` object (or a
   factory function returning one).
2. Launch with `npm run dev <credential> -- --engine=./path/to/engine.ts`
   (the path is resolved relative to where you run the command).
3. If the file fails to load or is missing `getLevels`/`getQuote`, the SDK logs
   the error and **falls back to the built-in default engine** — it won't crash.

That's it. No backend changes, no re-registration. The same API key, signer key,
and pool are used regardless of engine.

---

## 4. How to add a NEW engine

```typescript
// my-engine.ts
import { MakerEngine, RfqContext, PriceLevels } from '../src/types/MakerEngine'
// (published form: import { MakerEngine } from 'hyperdex-maker-sdk')

const engine: MakerEngine = {
  async getLevels(): Promise<PriceLevels> {
    // your resting book; return { sellLevels: [], buyLevels: [] } to go offline
    return {
      sellLevels: [{ quantity: '1000000000', price: '0.87800000' }], // USDC->EURC
      buyLevels:  [{ quantity: '1000000000', price: '1.13800000' }], // EURC->USDC
    }
  },

  async getQuote(ctx: RfqContext): Promise<string | null> {
    // ctx.tokenInSymbol is 'USDC' | 'EURC'; ctx.amountInHuman is human units
    const rate   = ctx.tokenInSymbol === 'USDC' ? 0.8780 : 1 / 0.8780
    const feeAdj = 1 - ctx.feesBps * 0.0001          // protocol fee
    const out    = Math.floor(ctx.amountInHuman * rate * feeAdj * 1e7)
    return out > 0 ? out.toString() : null            // null = skip, no penalty
  },

  async onTradeConfirmed(trade) {
    // refresh inventory / hedge on a CEX / log the fill
  },
}

export default engine
```

### Two pitfalls (found while verifying the shipped examples)

1. **Get the direction right.** A `USDC→EURC` rate (~0.88) is the *inverse* of a
   `EURC→USDC` rate (~1.14). If you pull a feed like Binance `EURUSDT` (~1.14,
   = USDT per EUR), the **USDC→EURC** rate is `1 / price`, not `price`. Quoting
   the raw `EURUSDT` number means offering ~1.14 EURC per USDC — far above market
   and instantly loss-making. Always sanity-check `getQuote` output against the
   live mid for *both* directions.

2. **Gate on inventory yourself.** The SDK does **not** stop a custom engine from
   quoting more than the pool holds. The built-in default engine checks
   `inventoryChecker.canFill()` (and only commits up to 80% of the balance);
   custom engines that skip this can return quotes the pool can't fill, and the
   **on-chain swap will revert** at settlement. Read your balance and cap size:

   ```typescript
   import { inventoryChecker } from '../src/inventory-checker'
   const check = await inventoryChecker.canFill(ctx.tokenOut, out)
   if (!check.canFill) return null
   ```

### Optional: a drift guard (what the default engine does)
The default engine pauses quoting when its ghost price drifts >3% from the oracle
mid (warns at >1%) via `getDriftStatus()` in `src/drift-guard.ts`. Custom engines
that track a live feed generally don't need this, but it's a good pattern if you
quote off a manually-set rate.

---

## Verification results (2026-06-27, maker = `hog`, USDC→EURC)

| Engine | Banner | SDK quoted? | Auction | Notes |
|---|---|---|---|---|
| default (ghost) | `Built-in (ghost-price)` | ✅ (3 USDC) / ❌ (10 USDC) | completed / no_quotes | Correctly **declines** 10 USDC — pool held 3.74 EURC < 80% gate. Quoted 3 USDC @ 0.8779, hog won, signed. |
| fixed-rate | `fixed-rate-engine.ts [custom]` | ✅ | completed, hog won | Quoted 0.85814 (0.859 − fee). **No inventory check** → would quote unfillable size. |
| binance | `binance-engine.ts [custom]` | ✅ | completed, hog won | Quoted **1.1375** EURC/USDC — inverted rate (uses EURUSDT directly). Bug, see Pitfall #1. |

SDK signer pubkey `7eaa3bbc…082f` == hog's registered `signerPublicKey` → quotes
are on-chain-settleable. XDR signing encoding matches the contract.
