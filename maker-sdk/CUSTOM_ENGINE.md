# Building a Custom Pricing Engine

HyperDex supports **custom pricing engines**. You write the pricing logic; the
SDK handles the WebSocket, authentication, ed25519 quote signing, and Soroban.

There are three tiers of maker:

| Tier | Command | Pricing |
|------|---------|---------|
| **1 — Beginner** | `npm run dev <name>` | Built-in ghost-price engine. Set one rate, oracle + drift guard do the rest. |
| **2 — Intermediate** | `npm run dev <name> -- --engine=./examples/binance-engine.ts` | Live EUR/USD from Binance, sub-second updates. |
| **3 — Professional** | `npm run dev <name> -- --engine=./my-engine.ts` | Aggregated CEX feeds, inventory management, volatility spreads, automated hedging. |

> **Note the `--` separator.** npm strips a bare `--engine=...` flag, so you must
> put `--` before it: `npm run dev <name> -- --engine=./my-engine.ts`. If you run
> the compiled build directly there's no separator: `node dist/server.js <name> --engine=./my-engine.js`.

---

## The interface

Your engine is any object implementing `MakerEngine`
(`src/types/MakerEngine.ts`):

```typescript
export interface MakerEngine {
  // Called ~every 3 seconds to publish resting levels.
  // Return empty arrays to go offline gracefully.
  getLevels(): Promise<PriceLevels>

  // Called per RFQ. Return amountOut in stroops, or null to skip (no penalty).
  getQuote(ctx: RfqContext): Promise<string | null>

  // Optional: fired when one of your quotes settles on-chain.
  onTradeConfirmed?(trade): Promise<void>
}
```

`RfqContext` gives you everything about the request:

```typescript
ctx.amountInHuman   // trade size in human units (e.g. 10.5)
ctx.tokenInSymbol   // 'USDC' or 'EURC'
ctx.tokenOutSymbol  // 'USDC' or 'EURC'
ctx.feesBps         // protocol fee in bps (e.g. 10 = 0.10%)
ctx.takerAddress    // who is asking
// ...rfqId, tokenIn, tokenOut, amountIn, requestedAt
```

---

## Quick start

Create `my-engine.ts`:

```typescript
import { MakerEngine } from 'hyperdex-maker-sdk'
// (inside this repo you can also use: from '../src/types/MakerEngine')

const engine: MakerEngine = {
  async getLevels() {
    // Your resting order book. Called every ~3 seconds.
    return {
      sellLevels: [{ quantity: '100000000', price: '0.85900000' }],
      buyLevels:  [{ quantity: '100000000', price: '1.16400000' }],
    }
  },

  async getQuote(ctx) {
    // Return amountOut in stroops, or null to skip this trade.
    const myRate = 0.8590
    const feeAdj = 1 - ctx.feesBps * 0.0001
    const out = Math.floor(ctx.amountInHuman * myRate * feeAdj * 1e7)
    return out.toString()
  },
}

export default engine
```

Start with your engine (note the `--` separator):

```bash
npm run dev <your-credential> -- --engine=./my-engine.ts
```

The banner will show `Engine: my-engine.ts [custom]`. The path is resolved
relative to where you run the command. Your file may export either a ready
`MakerEngine` object (default export) or a factory function that returns one.

> If the engine fails to load or is missing `getLevels` / `getQuote`, the SDK
> logs the error and **falls back to the built-in default engine** so you stay
> online.

---

## Worked examples

- **`examples/fixed-rate-engine.ts`** — simplest possible engine. Fixed rate,
  no external feeds, and shows how to **refuse** large trades (`return null`).
- **`examples/binance-engine.ts`** — live EUR/USD from the Binance WebSocket
  with a fixed spread.

Run either:

```bash
npm run dev <your-credential> -- --engine=./examples/fixed-rate-engine.ts
npm run dev <your-credential> -- --engine=./examples/binance-engine.ts
```

---

## What you can do in an engine

- Connect to any price feed (Binance, Coinbase, your own).
- Use any pricing model (ML model, CEX arbitrage, fixed rate).
- Refuse specific trades by returning `null` — no penalty.
- Track your own inventory.
- Trigger hedging from `onTradeConfirmed`.
- Apply any spread / skew logic you want.

## What the SDK handles for you

- WebSocket connection to the HyperDex backend (+ reconnect & keep-alive).
- Authentication with your API key.
- ed25519 quote signing.
- Soroban transaction building.
- Trade-confirmation notifications.
- Per-taker rate limiting.

---

## The built-in default engine

If you pass no `--engine` flag, the SDK runs the **ghost-price engine**
(`src/engines/default-engine.ts`):

- You set a single ghost price (EURC per USDC) at startup (`Ctrl+R` to update).
- Every RFQ is quoted at that rate, fee-adjusted, after an inventory check.
- A **drift guard** protects you from the market moving away from your price:
  - **> 1% drift** → dashboard warning (keep quoting).
  - **> 3% drift** → quoting **pauses** automatically until you re-price.

This is the recommended starting point. Graduate to a custom engine when you
want dynamic pricing from live feeds.
