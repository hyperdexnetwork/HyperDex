// ─────────────────────────────────────────────────────────────────────────────
// Example custom engine — fixed rate, no external feeds.
//
// The simplest possible custom engine. Quotes a hard-coded rate, fee-adjusted,
// and demonstrates how to REFUSE a trade (return null) — here it refuses any
// trade larger than MAX_TRADE units. Handy for testing the --engine flow
// offline without any market data.
//
// Run it (note the `--` separator so npm forwards the flag):
//   npm run dev <your-credential> -- --engine=./examples/fixed-rate-engine.ts
// ─────────────────────────────────────────────────────────────────────────────

import { MakerEngine, RfqContext, PriceLevels } from '../src/types/MakerEngine'

const USDC_TO_EURC = Number(process.env.FIXED_RATE_USDC_EURC ?? 0.8590)  // EURC per USDC
const MAX_TRADE    = Number(process.env.FIXED_RATE_MAX_TRADE ?? 1000)    // refuse trades bigger than this

// Basis points of improvement applied to the quoted output, in BOTH directions.
//
// The rate above is a mid with no spread: one side quotes `rate`, the other
// `1/rate`. Raising the rate therefore improves USDC->EURC and worsens
// EURC->USDC by the same stroke, so it cannot make a maker more competitive
// overall. This edge instead improves whatever the quote works out to, which is
// what quoting inside another maker's spread actually looks like.
//
// It comes straight out of margin — 25 bps means paying the taker 0.25% more
// than the mid on every fill — so it is a knob for winning flow, not free money.
const EDGE_BPS = Number(process.env.FIXED_RATE_EDGE_BPS ?? 0)
const EDGE     = 1 + EDGE_BPS / 10_000

const engine: MakerEngine = {
  async getLevels(): Promise<PriceLevels> {
    // Levels are advertised depth, so they carry the same edge the quotes will.
    const sellRate = USDC_TO_EURC * EDGE
    const buyRate  = (1 / USDC_TO_EURC) * EDGE
    return {
      sellLevels: [{ quantity: '1000000000', price: sellRate.toFixed(8) }],
      buyLevels:  [{ quantity: '1000000000', price: buyRate.toFixed(8) }],
    }
  },

  async getQuote(ctx: RfqContext): Promise<string | null> {
    if (ctx.amountInHuman > MAX_TRADE) return null  // refuse — too big

    const rate   = ctx.tokenInSymbol === 'USDC' ? USDC_TO_EURC : 1 / USDC_TO_EURC
    const feeAdj = 1 - ctx.feesBps * 0.0001
    const out    = Math.floor(ctx.amountInHuman * rate * feeAdj * EDGE * 1e7)
    return out > 0 ? out.toString() : null
  },
}

export default engine
