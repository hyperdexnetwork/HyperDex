// Per-(maker, taker) quoting rate limits, set by makers over the WebSocket.
//
// Both the key and the expiry are maker-controlled, so this store is bounded on
// three axes: the taker address must be a real Stellar address, the expiry is
// clamped, and each maker gets a fixed number of slots. A single periodic sweep
// replaces the previous one-setTimeout-per-entry, which let a maker accumulate
// unbounded live timers by naming fabricated takers with far-future expiries.

const STELLAR_ADDRESS = /^G[A-Z2-7]{55}$/;

/** Longest a maker may rate-limit a taker for. */
const MAX_LIMIT_MS = 60 * 60_000; // 1 hour

/** Most concurrent rate limits one maker may hold. Oldest is evicted past this. */
const MAX_ENTRIES_PER_MAKER = 500;

const SWEEP_INTERVAL_MS = 60_000;

class RateLimitStore {
  // makerId -> (takerAddress -> expiryMs). Nesting keeps per-maker caps cheap
  // and removes the ambiguity of splitting a flat "makerId:taker" key, which
  // mis-attributed entries whenever a maker id contained a colon.
  private limits: Map<string, Map<string, number>> = new Map();

  /**
   * Rate-limit `takerAddress` for this maker until `expiryMs`. Ignores requests
   * naming a malformed address, and clamps the expiry to MAX_LIMIT_MS.
   */
  setLimit(makerId: string, takerAddress: string, expiryMs: number): void {
    if (!STELLAR_ADDRESS.test(takerAddress)) return;
    if (!Number.isFinite(expiryMs)) return;

    const now = Date.now();
    const clamped = Math.min(Math.max(expiryMs, now), now + MAX_LIMIT_MS);
    if (clamped <= now) return;

    let forMaker = this.limits.get(makerId);
    if (!forMaker) {
      forMaker = new Map();
      this.limits.set(makerId, forMaker);
    }

    // Evict the soonest-expiring entry rather than growing without bound.
    if (!forMaker.has(takerAddress) && forMaker.size >= MAX_ENTRIES_PER_MAKER) {
      let oldestKey: string | null = null;
      let oldestExpiry = Infinity;
      for (const [k, v] of forMaker) {
        if (v < oldestExpiry) {
          oldestExpiry = v;
          oldestKey = k;
        }
      }
      if (oldestKey) forMaker.delete(oldestKey);
    }

    forMaker.set(takerAddress, clamped);
  }

  isLimited(makerId: string, takerAddress: string): boolean {
    const expiry = this.limits.get(makerId)?.get(takerAddress);
    if (!expiry) return false;
    if (Date.now() > expiry) {
      this.limits.get(makerId)!.delete(takerAddress);
      return false;
    }
    return true;
  }

  getExpiry(makerId: string, takerAddress: string): number | null {
    return this.limits.get(makerId)?.get(takerAddress) ?? null;
  }

  getActiveLimitsForMaker(makerId: string): { takerAddress: string; expiresAt: Date }[] {
    const forMaker = this.limits.get(makerId);
    if (!forMaker) return [];
    const now = Date.now();
    const result: { takerAddress: string; expiresAt: Date }[] = [];
    for (const [takerAddress, expiry] of forMaker) {
      if (expiry <= now) continue;
      result.push({ takerAddress, expiresAt: new Date(expiry) });
    }
    return result;
  }

  /** Drop expired entries and empty maker buckets. */
  sweep(): void {
    const now = Date.now();
    for (const [makerId, forMaker] of this.limits) {
      for (const [taker, expiry] of forMaker) {
        if (expiry <= now) forMaker.delete(taker);
      }
      if (forMaker.size === 0) this.limits.delete(makerId);
    }
  }

  /** Drop everything held for a maker — used when their connection closes. */
  clearMaker(makerId: string): void {
    this.limits.delete(makerId);
  }

  get size(): number {
    let n = 0;
    for (const forMaker of this.limits.values()) n += forMaker.size;
    return n;
  }
}

export const rateLimitStore = new RateLimitStore();

const sweeper = setInterval(() => rateLimitStore.sweep(), SWEEP_INTERVAL_MS);
sweeper.unref?.();
