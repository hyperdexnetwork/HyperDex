import { MakerConnectionRegistry } from '../websocket/MakerConnection';
import { logger } from '../utils/logger';
import { config } from '../config';

export interface PriceLevelEntry {
  makerId: string;
  makerAddress: string;
  buyLevels: Array<{ quantity: number; price: number }>;
  sellLevels: Array<{ quantity: number; price: number }>;
  updatedAt: number;
  stale: boolean;
}

export interface RankedMaker {
  makerId: string;
  makerAddress: string;
  estimatedAmountOut: number;
}

interface MakerPenalty {
  makerId: string;
  penaltyScore: number;
  totalRfqsSent: number;
  totalRefusals: number;
  totalBadQuotes: number;
  lastPenaltyAt: number;
}

export class PriceBook {
  private static instance: PriceBook;
  // key: "baseToken:quoteToken" (one entry per pair, not directional)
  private book: Map<string, Map<string, PriceLevelEntry>> = new Map();
  private penalties: Map<string, MakerPenalty> = new Map();

  static getInstance(): PriceBook {
    if (!PriceBook.instance) {
      PriceBook.instance = new PriceBook();
      PriceBook.instance.startStaleDetection();
    }
    return PriceBook.instance;
  }

  private pairKey(tokenIn: string, tokenOut: string): string {
    return `${tokenIn}:${tokenOut}`;
  }

  update(
    makerId: string,
    makerAddress: string,
    tokenIn: string,
    tokenOut: string,
    buyLevels: Array<{ quantity: number; price: number }>,
    sellLevels: Array<{ quantity: number; price: number }>
  ): void {
    const key = this.pairKey(tokenIn, tokenOut);
    if (!this.book.has(key)) {
      this.book.set(key, new Map());
    }
    this.book.get(key)!.set(makerId, {
      makerId,
      makerAddress,
      buyLevels,
      sellLevels,
      updatedAt: Date.now(),
      stale: false,
    });
  }

  getBestMakers(tokenIn: string, tokenOut: string, amountIn: number): RankedMaker[] {
    const usdc = config.USDC_CONTRACT_ADDRESS;
    const eurc = config.EURC_CONTRACT_ADDRESS;

    // Determine direction and which side to use
    // USDC→EURC: trader is buying EURC, maker is selling EURC → use sellLevels
    // EURC→USDC: trader is buying USDC, maker is selling USDC → use buyLevels
    // Canonical pair key is always USDC:EURC regardless of direction
    const isUsdcToEurc = tokenIn === usdc && tokenOut === eurc;
    const key = this.pairKey(usdc, eurc);

    const entries = this.book.get(key);
    if (!entries) return [];

    const registry = MakerConnectionRegistry.getInstance();
    const ranked: RankedMaker[] = [];

    for (const [makerId, entry] of entries) {
      if (entry.stale) continue;
      if (!registry.isConnected(makerId)) continue;

      const levels = isUsdcToEurc ? entry.sellLevels : entry.buyLevels;
      const estimatedAmountOut = this.simulateFill(levels, amountIn);
      if (estimatedAmountOut > 0) {
        const penalty = this.getPenaltyScore(makerId);
        const penaltyFactor = 1 - penalty / 200;
        ranked.push({
          makerId,
          makerAddress: entry.makerAddress,
          estimatedAmountOut: estimatedAmountOut * penaltyFactor,
        });
      }
    }

    return ranked.sort((a, b) => b.estimatedAmountOut - a.estimatedAmountOut);
  }

  /**
   * Estimated output for `amountIn` walked across `levels`.
   *
   * Returns 0 when the levels cannot fill the whole size. Previously this
   * returned whatever it had accumulated, so a maker with 10 USDC of depth was
   * ranked for a 10 000 USDC RFQ on the strength of a 10 USDC estimate — they
   * would win the ranking and then either refuse or bid badly.
   */
  simulateFill(levels: Array<{ quantity: number; price: number }>, amountIn: number): number {
    if (levels.length === 0 || amountIn <= 0) return 0;

    let remaining = amountIn;
    let amountOut = 0;

    for (const level of levels) {
      if (remaining <= 0) break;
      const filled = Math.min(remaining, level.quantity);
      amountOut += filled * level.price;
      remaining -= filled;
    }

    // Not enough depth to cover the request — this maker cannot serve it.
    if (remaining > 0) return 0;

    return amountOut;
  }

  getMakerLevelsForPair(
    makerId: string,
    tokenIn: string,
    tokenOut: string
  ): Array<{ quantity: number; price: number }> | null {
    const usdc = config.USDC_CONTRACT_ADDRESS;
    const eurc = config.EURC_CONTRACT_ADDRESS;
    const isUsdcToEurc = tokenIn === usdc && tokenOut === eurc;
    const key = this.pairKey(usdc, eurc);
    const entry = this.book.get(key)?.get(makerId);
    if (!entry) return null;
    return isUsdcToEurc ? entry.sellLevels : entry.buyLevels;
  }

  simulateLevelRate(
    levels: Array<{ quantity: number; price: number }>,
    amountIn: number
  ): number {
    const amountOut = this.simulateFill(levels, amountIn);
    if (amountIn <= 0) return 0;
    return amountOut / amountIn;
  }

  removeMaker(makerId: string): void {
    for (const [, makers] of this.book) {
      makers.delete(makerId);
    }
  }

  markStale(makerId: string): void {
    let lastUpdate: string | null = null;
    for (const [, makers] of this.book) {
      const entry = makers.get(makerId);
      if (entry) {
        lastUpdate = new Date(entry.updatedAt).toISOString();
        entry.stale = true;
        makers.set(makerId, entry);
      }
    }
    logger.warn('Maker went stale', { makerId, lastUpdate });
  }

  // ── Penalty Tracking ────────────────────────────────────────────────────────

  private getOrCreatePenalty(makerId: string): MakerPenalty {
    if (!this.penalties.has(makerId)) {
      this.penalties.set(makerId, {
        makerId,
        penaltyScore: 0,
        totalRfqsSent: 0,
        totalRefusals: 0,
        totalBadQuotes: 0,
        lastPenaltyAt: 0,
      });
    }
    return this.penalties.get(makerId)!;
  }

  incrementRfqsSent(makerId: string): void {
    const p = this.getOrCreatePenalty(makerId);
    p.totalRfqsSent++;
  }

  recordRefusal(makerId: string): void {
    const p = this.getOrCreatePenalty(makerId);
    p.totalRefusals++;
    p.totalRfqsSent = Math.max(p.totalRfqsSent, p.totalRefusals);

    const refusalRate = p.totalRefusals / p.totalRfqsSent;
    if (refusalRate > 0.30) {
      p.penaltyScore = Math.min(100, p.penaltyScore + 5);
      p.lastPenaltyAt = Date.now();
      logger.warn('Maker refusal rate penalty', {
        makerId,
        refusalRate: `${(refusalRate * 100).toFixed(1)}%`,
        penaltyScore: p.penaltyScore,
      });
    }
  }

  recordBadQuote(makerId: string, advertisedRate: number, actualRate: number): void {
    const p = this.getOrCreatePenalty(makerId);
    p.totalBadQuotes++;
    p.penaltyScore = Math.min(100, p.penaltyScore + 10);
    p.lastPenaltyAt = Date.now();
    logger.warn('Maker bad quote penalty', {
      makerId,
      advertisedRate: advertisedRate.toFixed(6),
      actualRate: actualRate.toFixed(6),
      penaltyScore: p.penaltyScore,
    });
  }

  /**
   * Penalize by Stellar address rather than makerId, for callers that only hold
   * the signed quote (which names the maker's address, not its database id).
   * A maker who bids more than their pool can pay is demoted so repeated
   * unbacked bidding drops them out of the dispatch set.
   */
  penalizeByAddress(makerAddress: string, reason: string): void {
    for (const [, makers] of this.book) {
      for (const [makerId, entry] of makers) {
        if (entry.makerAddress !== makerAddress) continue;
        const p = this.getOrCreatePenalty(makerId);
        p.totalBadQuotes++;
        p.penaltyScore = Math.min(100, p.penaltyScore + 10);
        p.lastPenaltyAt = Date.now();
        logger.warn('Maker penalized', { makerId, makerAddress, reason, penaltyScore: p.penaltyScore });
        return;
      }
    }
  }

  getPenaltyScore(makerId: string): number {
    return this.penalties.get(makerId)?.penaltyScore ?? 0;
  }

  getPenaltyStats(makerId: string): MakerPenalty | null {
    return this.penalties.get(makerId) ?? null;
  }

  // ── Stats / Info ────────────────────────────────────────────────────────────

  getStats(): object {
    const stats: Record<string, { total: number; fresh: number }> = {};
    for (const [pair, makers] of this.book) {
      let fresh = 0;
      for (const entry of makers.values()) {
        if (!entry.stale) fresh++;
      }
      stats[pair] = { total: makers.size, fresh };
    }
    return stats;
  }

  getMakerLevels(makerId: string): {
    pair: string;
    buyLevels: { quantity: string; price: string }[];
    sellLevels: { quantity: string; price: string }[];
    updatedAt: number;
    stale: boolean;
  }[] | null {
    const result: {
      pair: string;
      buyLevels: { quantity: string; price: string }[];
      sellLevels: { quantity: string; price: string }[];
      updatedAt: number;
      stale: boolean;
    }[] = [];
    for (const [pair, makerMap] of this.book.entries()) {
      const entry = makerMap.get(makerId);
      if (entry) {
        result.push({
          pair,
          buyLevels: entry.buyLevels.map(l => ({
            quantity: l.quantity.toString(),
            price: l.price.toString(),
          })),
          sellLevels: entry.sellLevels.map(l => ({
            quantity: l.quantity.toString(),
            price: l.price.toString(),
          })),
          updatedAt: entry.updatedAt,
          stale: entry.stale,
        });
      }
    }
    return result.length > 0 ? result : null;
  }

  get totalEntries(): number {
    let n = 0;
    for (const makers of this.book.values()) n += makers.size;
    return n;
  }

  private startStaleDetection(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [, makers] of this.book) {
        for (const [makerId, entry] of makers) {
          if (!entry.stale && now - entry.updatedAt > config.PRICE_LEVEL_STALE_MS) {
            entry.stale = true;
            logger.warn('Maker price levels went stale', {
              makerId,
              lastUpdate: new Date(entry.updatedAt).toISOString(),
            });
          }
        }
      }
    }, 3000);
  }
}
