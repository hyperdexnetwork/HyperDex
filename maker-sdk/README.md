# HyperDEX Maker SDK

Connect to HyperDEX and earn spread by providing USDC/EURC liquidity on Stellar.

The SDK handles the boring infrastructure — WebSocket connection, API-key auth,
ed25519 quote signing (in the exact XDR encoding the on-chain contract verifies),
inventory reads, and trade-confirmation handling. **You only decide how to
price.** Pricing lives in a pluggable **engine**: beginners use the built-in
ghost-price engine; advanced makers ship their own.

## Requirements

- Node.js 18 or higher
- Git
- An API key from the HyperDEX admin (apply at https://hyperdex-psi.vercel.app/maker)

## Setup (one time)

```bash
git clone https://github.com/hyperdexnetwork/HyperDex.git
cd hyperdex/maker-sdk
npm install
npm run setup
```

When prompted, enter your API key. The wizard connects to the live HyperDEX
backend automatically — no manual configuration needed. It saves your
credentials to `credentials/<yourname>.cred` (API key + signing keypair).

> **Deploy a pool first.** Before you can fill trades you need a liquidity pool
> with USDC/EURC in it. Deploy it at https://hyperdex-psi.vercel.app/maker, then
> add `POOL_ADDRESS=C...` to your `credentials/<yourname>.cred`.

## Start (default engine)

```bash
npm run dev <yourname>
```

You will be prompted to set your **ghost price** — the EURC amount you offer per
1 USDC. The SDK then connects and auto-bids that rate, fee-adjusted, on every
RFQ. This is the built-in ghost-price engine; no code required.

## What happens

1. SDK loads your pricing engine (default ghost-price, or a custom `--engine`)
2. Connects to `wss://hyperdex.onrender.com/ws/maker` and authenticates with your API key
3. Reads your pool balance from Stellar
4. Every ~3s the engine's `getLevels()` publishes your resting order book
5. On each RFQ the engine's `getQuote()` returns your `amountOut`; the SDK signs and submits it
6. You earn spread on every trade you win

---

## The Engine Plugin System

Pricing is driven by a **MakerEngine** — an object that answers two questions:

| Method | Called | Returns |
|--------|--------|---------|
| `getLevels()` | every ~3s | your resting book `{ sellLevels, buyLevels }` (return empty arrays to go offline gracefully) |
| `getQuote(ctx)` | on each RFQ | `amountOut` in **stroops** as a string, or `null` to skip this trade (no penalty) |
| `onTradeConfirmed(trade)` *(optional)* | when a fill settles | nothing — use it to refresh inventory, hedge on a CEX, log fills |

### Tier 1 — Built-in ghost-price engine (default)

```bash
npm run dev <yourname>
```

- Set a single ghost price; the SDK quotes it on every RFQ, fee-adjusted.
- Includes an **inventory check** (won't quote more than ~80% of your pool balance).
- Includes a **drift guard**: warns when your ghost price is >1% from the live
  oracle mid and **pauses quoting** at >3% so you don't get arbitraged.
- Press `Ctrl+R` while running to re-price; `Ctrl+C` to disconnect.

### Tier 2 / 3 — Custom engine

Run any engine file with the `--engine` flag. **Note the `--` separator** —
without it, npm swallows the flag:

```bash
npm run dev <yourname> -- --engine=./examples/fixed-rate-engine.ts
npm run dev <yourname> -- --engine=./examples/binance-engine.ts
npm run dev <yourname> -- --engine=./path/to/your-engine.ts
```

The path is resolved relative to where you run the command. A custom engine
**owns its full pricing logic**, so the SDK skips the ghost-price prompt and the
`Ctrl+R` re-price key. If the file is missing or doesn't implement
`getLevels`/`getQuote`, the SDK logs the error and **falls back to the built-in
engine** — it won't crash.

Confirm the right engine loaded from the startup banner:
`Engine: Built-in (ghost-price)` vs `Engine: binance-engine.ts [custom]`.

### Writing your own engine

```typescript
// my-engine.ts
import { MakerEngine, RfqContext, PriceLevels } from '../src/types/MakerEngine'
// (published form: import { MakerEngine } from 'hyperdex-maker-sdk')

const engine: MakerEngine = {
  async getLevels(): Promise<PriceLevels> {
    return {
      sellLevels: [{ quantity: '1000000000', price: '0.87800000' }], // USDC→EURC
      buyLevels:  [{ quantity: '1000000000', price: '1.13800000' }], // EURC→USDC
    }
  },

  async getQuote(ctx: RfqContext): Promise<string | null> {
    // ctx.tokenInSymbol is 'USDC' | 'EURC'; ctx.amountInHuman is human units;
    // ctx.feesBps is the protocol fee (e.g. 10 = 0.10%)
    const rate   = ctx.tokenInSymbol === 'USDC' ? 0.8780 : 1 / 0.8780
    const feeAdj = 1 - ctx.feesBps * 0.0001
    const out    = Math.floor(ctx.amountInHuman * rate * feeAdj * 1e7)
    return out > 0 ? out.toString() : null   // null = skip, no penalty
  },

  async onTradeConfirmed(trade) {
    // refresh inventory / hedge / log
  },
}

export default engine
```

You can connect any price feed (Binance, Coinbase, your own), use any model,
refuse specific trades, track inventory, and trigger hedging after fills. The
SDK still handles the WebSocket, auth, signing, and Soroban for you.

**Two things to get right** (see `TESTING_ENGINES.md`):
1. **Direction.** A `USDC→EURC` rate (~0.88) is the inverse of a `EURC→USDC`
   rate (~1.14). If you pull a feed like Binance `EURUSDT` (~1.14 = USDT per
   EUR), the USDC→EURC rate is `1 / price`, not `price`.
2. **Inventory.** The SDK does **not** stop a custom engine from quoting more
   than your pool holds. Quoting size you can't fill makes the on-chain swap
   revert. Read your balance and cap your quote (the default engine does this
   via `inventoryChecker.canFill()`).

The two files under `examples/` are templates for the `--engine` flow — read
their caveats in `CUSTOM_ENGINE.md` / `TESTING_ENGINES.md` before pointing them
at a real funded pool.

### Skipping the prompt (CI / non-interactive)

The default engine needs a ghost price. When there's no TTY to prompt, pass it
via env:

```bash
GHOST_PRICE=0.8788 npm run dev <yourname>
```

---

## Check your status

- Backend health: https://hyperdex.onrender.com/health
- Your dashboard: https://hyperdex-psi.vercel.app/maker (shows **SDK Online** while your SDK is connected)
- Local health endpoint while running: `curl localhost:3001/health`

## Available Commands

| Command | Description |
|---------|-------------|
| `npm run setup` | One-time wizard: verify API key, generate signing keypair, save credentials |
| `npm run dev <name>` | Start the maker server (built-in ghost-price engine) |
| `npm run dev <name> -- --engine=./x.ts` | Start with a custom engine (note the `--`) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run start` | Run compiled server (e.g. `node dist/server.js <name> --engine=./x.js`) |

## Keyboard shortcuts (while running, default engine)

- `Ctrl+R` — update your ghost price live
- `Ctrl+C` — gracefully disconnect and exit

## Further reading

- `CUSTOM_ENGINE.md` — full guide to building a custom pricing engine
- `TESTING_ENGINES.md` — how to E2E-test an engine (run with any maker, trigger a live auction, common pitfalls)
- `src/types/MakerEngine.ts` — the `MakerEngine` / `RfqContext` / `PriceLevels` type definitions
- `examples/` — working `fixed-rate-engine.ts` and `binance-engine.ts` templates
