'use client';

import { useEffect, useRef } from 'react';
import { useEurcRate } from './useEurcRate';

// The track renders TICKER_COPIES back-to-back copies of the list; the CSS loop
// travels exactly one copy so the seam is invisible.
const TICKER_COPIES = 3;
// Constant scroll speed in CSS px/second, independent of viewport and font.
const TICKER_SPEED_PX_PER_SEC = 24;

/**
 * Hero rail. Shows protocol facts plus the live EURC reference price — only
 * pairs HyperDex actually trades, and no fabricated prices.
 */
export default function ProtocolTicker() {
  const ref = useRef<HTMLDivElement>(null);
  const rate = useEurcRate();

  const items: { k: string; v: string }[] = [
    { k: 'USDC → EURC', v: rate ? rate.usdcToEurc.toFixed(4) : '—' },
    { k: 'EURC / USD', v: rate ? `$${rate.eurcUsd.toFixed(4)}` : '—' },
    { k: 'Auction window', v: '30s sealed-bid' },
    { k: 'Settlement', v: '~5s on Stellar' },
    { k: 'Protocol fee', v: '0.10%' },
    { k: 'Custody', v: 'Non-custodial' },
    { k: 'Quotes', v: 'ed25519-signed' },
  ];

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => {
      const copyWidth = el.scrollWidth / TICKER_COPIES;
      if (copyWidth > 0) el.style.animationDuration = `${copyWidth / TICKER_SPEED_PX_PER_SEC}s`;
    };
    apply();
    document.fonts?.ready.then(apply).catch(() => {});
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="ticker-track" ref={ref} aria-hidden="true">
      {Array.from({ length: TICKER_COPIES }, () => items).flat().map((item, i) => (
        <div key={i} className="inline-flex items-center gap-3 px-8">
          <span className="text-white/50 text-[11px] font-semibold uppercase tracking-[0.14em]">{item.k}</span>
          <span className="text-white text-sm font-mono">{item.v}</span>
          <span className="ml-8 h-1 w-1 rounded-full bg-white/25" />
        </div>
      ))}
    </div>
  );
}
