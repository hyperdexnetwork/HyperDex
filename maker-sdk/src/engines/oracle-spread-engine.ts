// ─────────────────────────────────────────────────────────────────────────────
// Oracle-spread engine — an unattended, market-tracking maker.
//
// The built-in ghost-price engine asks a human for a fixed rate and pauses when
// the market drifts >3% away from it. That suits someone at a terminal, not a
// service that runs for weeks. This engine instead prices every RFQ from the
// live oracle mid, minus a fixed spread, and never needs input.
//
// Safety rules:
//   - no quote while the oracle has no rate or every source has failed;
//   - no quote larger than MAX_TRADE (in units of the token the taker pays);
//   - no quote the pool cannot pay out from its cached inventory.
//
// Configuration (env):
//   ORACLE_SPREAD_BPS  spread below mid, in basis points   (default 20 = 0.20%)
//   ORACLE_MAX_TRADE   largest accepted trade, human units  (default 500)
//
// Run it:
//   node dist/server.js --engine=./dist/engines/oracle-spread-engine.js
// ─────────────────────────────────────────────────────────────────────────────

import { MakerEngine, RfqContext, PriceLevels } from '../types/MakerEngine'
import { priceOracle } from '../oracle'
import { inventoryChecker } from '../inventory-checker'

const SPREAD_BPS = Number(process.env.ORACLE_SPREAD_BPS ?? 20)
const MAX_TRADE  = Number(process.env.ORACLE_MAX_TRADE ?? 500)
const SPREAD     = 1 - SPREAD_BPS / 10_000
const STROOPS    = 1e7

function liveMid(): number | null {
  const mid = priceOracle.getMidRate()
  if (!mid || !Number.isFinite(mid) || mid <= 0 || priceOracle.isStale()) return null
  return mid // EURC per 1 USDC
}

const engine: MakerEngine = {
  async getLevels(): Promise<PriceLevels> {
    const mid = liveMid()
    if (mid === null) return { sellLevels: [], buyLevels: [] }

    const { usdc, eurc } = inventoryChecker.getCachedBalance()
    const sellRate = mid * SPREAD        // EURC out per USDC in
    const buyRate  = (1 / mid) * SPREAD  // USDC out per EURC in

    // Advertise only what the pool can actually pay out, capped at MAX_TRADE.
    const sellQty = Math.min(MAX_TRADE, eurc / sellRate)
    const buyQty  = Math.min(MAX_TRADE, usdc / buyRate)

    return {
      sellLevels: sellQty > 0 ? [{ quantity: Math.floor(sellQty * STROOPS).toString(), price: sellRate.toFixed(8) }] : [],
      buyLevels:  buyQty  > 0 ? [{ quantity: Math.floor(buyQty  * STROOPS).toString(), price: buyRate.toFixed(8) }]  : [],
    }
  },

  async getQuote(ctx: RfqContext): Promise<string | null> {
    const mid = liveMid()
    if (mid === null) return null
    if (ctx.amountInHuman <= 0 || ctx.amountInHuman > MAX_TRADE) return null

    const rate   = ctx.tokenInSymbol === 'USDC' ? mid : 1 / mid
    const feeAdj = 1 - ctx.feesBps / 10_000
    const outHuman = ctx.amountInHuman * rate * SPREAD * feeAdj

    // Refuse anything the pool cannot pay (gross amount, before the fee split).
    const { usdc, eurc } = inventoryChecker.getCachedBalance()
    const available = ctx.tokenOutSymbol === 'USDC' ? usdc : eurc
    if (outHuman / feeAdj > available) return null

    const out = Math.floor(outHuman * STROOPS)
    return out > 0 ? out.toString() : null
  },

  async onTradeConfirmed() {
    // Refresh inventory right after a fill so the next quote sees it.
    inventoryChecker.invalidateCache()
  },
}

export default engine
