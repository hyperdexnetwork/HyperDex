'use client';

import { useEffect, useState } from 'react';
import { useEurcRate } from './useEurcRate';

/**
 * Hero visual: an illustrative, looping sealed-bid auction. It is labelled as
 * an illustration — the maker spreads are examples, anchored to the live
 * EURC reference rate when it is available.
 */

const CYCLE_MS = 10_000;
const COLLECT_END = 5_000; // countdown runs 30s → 0s over this span
const REVEAL_END = 7_200;
const NOTIONAL = 10_000; // USDC
const FEE = 0.001; // disclosed 0.10% protocol fee

const MAKERS = [
  { name: 'Maker 01', bps: 6.2, at: 600 },
  { name: 'Maker 02', bps: 3.4, at: 1_500 },
  { name: 'Maker 03', bps: 8.9, at: 2_500 },
  { name: 'Maker 04', bps: 4.7, at: 3_600 },
];
const BEST = MAKERS.reduce((a, b) => (b.bps < a.bps ? b : a));

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export default function AuctionDemo() {
  const rate = useEurcRate();
  const [t, setT] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    if (mq.matches) return;
    const start = performance.now();
    const id = setInterval(() => setT((performance.now() - start) % CYCLE_MS), 100);
    return () => clearInterval(id);
  }, []);

  // Reduced motion: hold the settled end state.
  const now = reduced ? CYCLE_MS - 1 : t;
  const phase = now < COLLECT_END ? 'collect' : now < REVEAL_END ? 'reveal' : 'settled';
  const secondsLeft = phase === 'collect' ? Math.max(0, Math.ceil(30 * (1 - now / COLLECT_END))) : 0;
  const progress = Math.min(1, now / COLLECT_END);

  const base = rate?.usdcToEurc;
  const quote = (bps: number) => (base ? base * (1 - bps / 10_000) : null);
  const bestQuote = quote(BEST.bps);
  const receive = bestQuote ? NOTIONAL * bestQuote * (1 - FEE) : null;

  return (
    <div
      className="w-full max-w-[400px] rounded-[22px] bg-white/[0.92] backdrop-blur-xl p-5 sm:p-6 text-ink"
      style={{ boxShadow: '0 30px 80px -20px rgba(10,10,30,0.55), 0 0 0 1px rgba(255,255,255,0.4) inset' }}
      role="img"
      aria-label="Illustration of a HyperDex sealed-bid auction: four market makers submit sealed quotes, the best one is selected and settled on Stellar."
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-muted">Sealed-bid auction</p>
          <p className="mt-1.5 text-lg font-semibold tracking-tight">
            {NOTIONAL.toLocaleString('en-US')} USDC <span className="text-ink-muted font-normal">→</span> EURC
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-muted">
            {phase === 'collect' ? 'Closes in' : 'Status'}
          </p>
          <p className="mt-1.5 w-[110px] font-mono text-lg tabular-nums whitespace-nowrap">
            {phase === 'collect' ? `00:${String(secondsLeft).padStart(2, '0')}` : phase === 'reveal' ? 'Revealed' : 'Filled'}
          </p>
        </div>
      </div>

      {/* Countdown bar */}
      <div className="mt-4 h-[3px] w-full rounded-full bg-black/[0.06] overflow-hidden">
        <div
          className="h-full rounded-full bg-purple transition-[width] duration-100 ease-linear"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      {/* Bids */}
      <ul className="mt-4 space-y-1.5">
        {MAKERS.map(m => {
          const arrived = now >= m.at;
          const revealed = phase !== 'collect';
          const isBest = revealed && m === BEST;
          const q = quote(m.bps);
          return (
            <li
              key={m.name}
              className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm transition-all duration-500 ${
                isBest ? 'bg-lavender ring-1 ring-lavender-deep/50' : 'bg-black/[0.03]'
              } ${arrived ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'}`}
            >
              <span className="flex items-center gap-2 font-medium">
                {m.name}
                {isBest && (
                  <span className="rounded-full bg-ink px-2 py-0.5 text-[9px] leading-[14px] font-bold uppercase tracking-[0.12em] text-white">
                    Best
                  </span>
                )}
              </span>
              {revealed ? (
                <span className="font-mono tabular-nums text-ink">
                  {q ? q.toFixed(4) : `−${m.bps.toFixed(1)} bps`}
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-ink-muted">
                  <LockIcon />
                  <span className="text-xs font-semibold uppercase tracking-[0.12em]">Sealed</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {/* Result */}
      <div
        className={`mt-4 rounded-xl border px-3.5 py-3 transition-colors duration-500 ${
          phase === 'settled' ? 'border-emerald-600/25 bg-emerald-50' : 'border-black/[0.06] bg-transparent'
        }`}
      >
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-muted">You receive</span>
          <span className="font-mono tabular-nums font-semibold whitespace-nowrap">
            {phase === 'collect' ? '—' : receive ? `${receive.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} EURC` : 'Best firm quote'}
          </span>
        </div>
        {/* Fixed two-line slot so the card never changes height between phases */}
        <p className={`mt-1 h-8 text-xs leading-4 ${phase === 'settled' ? 'text-emerald-700' : 'text-ink-muted'}`}>
          {phase === 'collect' && 'Makers quote blind. Nobody sees a competing bid.'}
          {phase === 'reveal' && 'Best signed quote wins. 0.10% fee included.'}
          {phase === 'settled' && 'Settled atomically on Stellar in ~5s.'}
        </p>
      </div>

      <p className="mt-3 h-4 text-[10px] leading-4 text-ink-muted/80 whitespace-nowrap overflow-hidden text-ellipsis">
        Illustration using the EURC reference rate. Not a live auction.
      </p>
    </div>
  );
}
