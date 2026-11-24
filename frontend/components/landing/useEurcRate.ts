'use client';

import { useEffect, useState } from 'react';

/**
 * Live USDC→EURC reference rate from the CoinGecko spot proxy
 * (`/api/coingecko/spot`). Returns null until loaded or if the fetch fails —
 * callers must render something honest for the null case, never a made-up
 * number.
 *
 * One request is shared by every component on the page.
 */
export interface EurcRate {
  /** EURC received per 1 USDC. */
  usdcToEurc: number;
  /** USD price of 1 EURC. */
  eurcUsd: number;
}

let inflight: Promise<EurcRate | null> | null = null;

function load(): Promise<EurcRate | null> {
  if (!inflight) {
    inflight = fetch('/api/coingecko/spot')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        const eurc = Number(d?.['euro-coin']?.usd);
        const usdc = Number(d?.['usd-coin']?.usd);
        if (!(eurc > 0) || !(usdc > 0)) return null;
        return { usdcToEurc: usdc / eurc, eurcUsd: eurc };
      })
      .catch(() => null);
  }
  return inflight;
}

export function useEurcRate(): EurcRate | null {
  const [rate, setRate] = useState<EurcRate | null>(null);
  useEffect(() => {
    let alive = true;
    load().then(r => alive && setRate(r));
    return () => { alive = false; };
  }, []);
  return rate;
}
