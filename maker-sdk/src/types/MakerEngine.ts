// ─────────────────────────────────────────────────────────────────────────────
// MakerEngine — the pluggable pricing brain of the HyperDex maker SDK.
//
// The SDK handles the boring infrastructure (WebSocket, auth, ed25519 quote
// signing, Soroban, trade-confirmation polling). An engine only has to answer
// two questions:
//
//   1. getLevels()  — "what's my resting order book right now?"  (polled ~3s)
//   2. getQuote(ctx) — "given this exact RFQ, what amountOut do I offer?"
//
// Beginners use the built-in default engine (ghost-price auto-bid). Advanced
// makers ship their own object implementing this interface and load it with
// `--engine=./my-engine.ts`.
// ─────────────────────────────────────────────────────────────────────────────

export interface RfqContext {
  rfqId:          string  // unique id for this request
  takerAddress:   string  // G... address of the trader
  tokenIn:        string  // C... contract address the taker is paying
  tokenOut:       string  // C... contract address the taker wants
  tokenInSymbol:  string  // 'USDC' or 'EURC'
  tokenOutSymbol: string  // 'USDC' or 'EURC'
  amountIn:       string  // stroops as string (7 decimals)
  amountInHuman:  number  // human readable, e.g. 10.5
  feesBps:        number  // protocol fee in basis points, e.g. 10 = 0.10%
  requestedAt:    number  // unix ms when the taker asked
}

export interface PriceLevel {
  quantity: string  // stroops as string
  price:    string  // rate as decimal string, e.g. "0.85900000"
}

export interface PriceLevels {
  sellLevels: PriceLevel[]  // maker sells tokenOut  (USDC→EURC direction)
  buyLevels:  PriceLevel[]  // maker buys  tokenOut  (EURC→USDC direction)
}

export interface MakerEngine {
  // Called every ~3 seconds to publish resting price levels.
  // Return empty arrays ({ sellLevels: [], buyLevels: [] }) to go offline
  // gracefully without disconnecting.
  getLevels(): Promise<PriceLevels>

  // Called when an RFQ arrives. Return the amountOut in stroops as a string.
  // Return null to NOT participate in this quote (no penalty for skipping).
  getQuote(ctx: RfqContext): Promise<string | null>

  // Optional: fired when one of your quotes settles on-chain. Use it to
  // refresh inventory, trigger hedging on a CEX, log fills, etc.
  onTradeConfirmed?: (trade: {
    quoteId:     string
    amountIn:    string
    amountOut:   string
    tokenIn:     string
    tokenOut:    string
    txHash:      string
    confirmedAt: string
  }) => Promise<void>
}

// A factory that builds a fresh engine. Engine files may export either a
// ready MakerEngine object (default export) or a MakerEngineFactory.
export type MakerEngineFactory = () => MakerEngine
