'use client';

import { useEffect, useRef, useState } from 'react';
import { useNetwork } from '@/hooks/useNetwork';
import { NETWORK_IDS, NETWORKS, type NetworkId } from '@/lib/networks';

/**
 * Mainnet/testnet toggle that sits next to the connect-wallet button.
 *
 * Switching reloads the page (see switchNetwork), which drops the wallet
 * session — the confirmation step below exists so that never happens on a
 * stray click, and so the user knows to flip Freighter over to match.
 */
export default function NetworkSwitcher() {
  const { mounted, networkId, switchNetwork } = useNetwork();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const active = NETWORKS[networkId];

  // One neutral treatment for both networks — the pill already names the
  // selected network, so it does not also need to be colour-coded.
  const pillClass = 'border-black/10 bg-white/70 text-ink hover:bg-white';

  function choose(next: NetworkId) {
    setOpen(false);
    if (next !== networkId) switchNetwork(next);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Network: ${active.label}. Change network`}
        // The label depends on localStorage, which the server cannot know;
        // suppress the first-pass diff rather than flashing an empty pill.
        suppressHydrationWarning
        className={`flex items-center gap-2 px-3.5 py-2.5 border text-sm font-semibold rounded-full transition-colors ${pillClass}`}
      >
        <span suppressHydrationWarning>{mounted ? active.shortLabel : ' '}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
             className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 mt-2 w-64 bg-white border border-black/10 rounded-2xl shadow-lg p-1.5 z-50"
        >
          {NETWORK_IDS.map(id => {
            const net = NETWORKS[id];
            const isActive = id === networkId;
            return (
              <button
                key={id}
                role="option"
                aria-selected={isActive}
                onClick={() => choose(id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-colors ${
                  isActive ? 'bg-black/5' : 'hover:bg-black/[0.03]'
                }`}
              >
                <span className="flex-1">
                  <span className="block text-sm font-semibold text-ink">{net.label}</span>
                  <span className="block text-[11px] text-ink-muted">
                    {id === 'testnet' ? 'Test funds — safe to experiment' : 'Live funds'}
                  </span>
                </span>
                {isActive && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-ink shrink-0">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })}
          <p className="px-3 py-2 text-[11px] leading-snug text-ink-muted border-t border-black/5 mt-1">
            Switching reloads the page and disconnects your wallet. Set Freighter to the
            matching network before reconnecting.
          </p>
        </div>
      )}
    </div>
  );
}
