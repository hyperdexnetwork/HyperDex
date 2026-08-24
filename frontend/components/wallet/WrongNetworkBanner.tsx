'use client';

import { useEffect, useRef } from 'react';
import { useWalletStore } from '@/store/walletStore';
import { useNetwork } from '@/hooks/useNetwork';

/**
 * Name of the CSS variable holding the banner's live height.
 *
 * The banner is fixed to the very top of the viewport, so it takes no space in
 * the document flow — everything below it has to be told how far to move. That
 * used to be a hardcoded 42px that only <Navbar> read, which pushed the nav
 * down onto the page content while the content itself stayed put. Publishing
 * the *measured* height on <html> instead means the whole document (body
 * padding, the fixed nav, the docs sticky rails) shifts by exactly one banner,
 * and keeps working when the copy wraps to two lines on a narrow screen.
 */
export const BANNER_HEIGHT_VAR = '--net-banner-h';

/** Fallback height used before the first measurement lands. */
export const WRONG_NETWORK_BANNER_HEIGHT = 42;

export default function WrongNetworkBanner() {
  const isWrongNetwork = useWalletStore(s => s.isWrongNetwork);
  const walletName = useWalletStore(s => s.walletName);
  const { network } = useNetwork();
  const ref = useRef<HTMLDivElement>(null);

  // Mirror the rendered height into the CSS variable, and re-measure on resize
  // so a wrapped two-line banner still offsets the page correctly.
  useEffect(() => {
    const root = document.documentElement;
    const el = ref.current;

    if (!isWrongNetwork || !el) {
      root.style.setProperty(BANNER_HEIGHT_VAR, '0px');
      return;
    }

    const publish = () => root.style.setProperty(BANNER_HEIGHT_VAR, `${el.offsetHeight}px`);
    publish();

    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.setProperty(BANNER_HEIGHT_VAR, '0px');
    };
  }, [isWrongNetwork]);

  if (!isWrongNetwork) return null;

  // Any of eight wallets can be connected now, so the copy names the one in use
  // and avoids "extension settings" — Albedo is a web app, LOBSTR is a phone,
  // and Ledger is a device, none of which have extension settings.
  const wallet = walletName ?? 'your wallet';

  return (
    <div
      ref={ref}
      role="alert"
      style={{ minHeight: WRONG_NETWORK_BANNER_HEIGHT }}
      className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-center gap-2.5 px-4 py-2 bg-[#FDF3E3] border-b border-amber-500/30"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2.2"
           className="shrink-0" aria-hidden="true">
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      <p className="text-[13px] leading-tight text-[#B45309] text-center">
        <strong className="font-semibold">{wallet}</strong> is on a different network.
        Switch it to <strong className="font-semibold">{network.label}</strong>, then reconnect.
      </p>
    </div>
  );
}
