'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useWalletStore } from '@/store/walletStore';
import ConnectWalletButton from '@/components/wallet/ConnectWalletButton';
import NetworkSwitcher from '@/components/wallet/NetworkSwitcher';
import { BACKEND_URL } from '@/lib/constants';
import { adminFetch } from '@/lib/adminAuth';

const LogoMark = ({ color = '#111118' }: { color?: string }) => (
  <svg viewBox="0 0 100 108" fill="none" className="h-7 w-7 shrink-0" aria-label="HyperDex">
    {/* Left pillar — 3 parallel vertical strokes */}
    <rect x="5"  y="5" width="8" height="98" fill={color} />
    <rect x="17" y="5" width="8" height="98" fill={color} />
    <rect x="29" y="5" width="8" height="98" fill={color} />
    {/* Right pillar — 3 parallel vertical strokes */}
    <rect x="63" y="5" width="8" height="98" fill={color} />
    <rect x="75" y="5" width="8" height="98" fill={color} />
    <rect x="87" y="5" width="8" height="98" fill={color} />
    {/* Crossbar — 3 parallel horizontal strokes */}
    <rect x="5" y="42" width="90" height="8" fill={color} />
    <rect x="5" y="54" width="90" height="8" fill={color} />
    <rect x="5" y="66" width="90" height="8" fill={color} />
  </svg>
);

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = pathname === href || (href !== '/' && pathname.startsWith(href));
  return (
    <Link
      href={href}
      className={`text-sm font-semibold transition-opacity duration-150 text-ink ${
        isActive ? 'opacity-100' : 'opacity-70 hover:opacity-100'
      }`}
    >
      {children}
    </Link>
  );
}

export default function Navbar() {
  const [scrolled, setScrolled]     = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const { isAdmin } = useWalletStore();

  useEffect(() => {
    if (!isAdmin) return;
    const fetchPending = () => {
      adminFetch(`${BACKEND_URL}/api/admin/pending?status=pending`)
        .then(r => r.json())
        .then(d => setPendingCount(d.total ?? 0))
        .catch(() => {});
    };
    fetchPending();
    const t = setInterval(fetchPending, 60_000);
    return () => clearInterval(t);
  }, [isAdmin]);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);

  // The wrong-network banner is fixed to the very top and publishes its own
  // height in --net-banner-h; sitting at that offset keeps the nav directly
  // below the banner, while the matching body padding in globals.css keeps the
  // page content below the nav instead of sliding under it.
  return (
    <nav
      style={{ top: 'var(--net-banner-h, 0px)' }}
      // Only the scroll-state chrome animates. `transition-all` used to include
      // `top`, so the nav slid up through the banner whenever it appeared.
      className={`fixed left-0 w-full z-50 transition-[background-color,border-color,box-shadow,padding] duration-300 ${
        scrolled
          ? 'bg-white/85 backdrop-blur-md border-b border-black/5 shadow-sm py-3'
          : 'bg-transparent py-5'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 md:px-10 flex items-center justify-between md:grid md:grid-cols-[1fr_auto_1fr]">

        {/* Left — logo + wordmark */}
        <Link href="/" className="flex items-center gap-2.5 md:justify-self-start">
          <LogoMark />
          <span className="font-display text-[15px] font-bold tracking-tight text-ink">HyperDex</span>
        </Link>

        {/* Center — nav links */}
        <div className="hidden md:flex items-center gap-8 md:justify-self-center">
          <NavLink href="/swap">Swap</NavLink>
          <a href="/docs" target="_blank" rel="noopener noreferrer" className="text-sm font-semibold transition-opacity duration-150 text-ink opacity-70 hover:opacity-100">Docs</a>
          {!isAdmin ? (
            <NavLink href="/maker">Maker</NavLink>
          ) : (
            <>
              <NavLink href="/admin">Admin</NavLink>
              <Link
                href="/admin/pending"
                className="relative text-sm font-semibold text-amber-600 hover:text-amber-700 transition-colors"
              >
                Pending
                {pendingCount > 0 && (
                  <span className="absolute -top-2 -right-3.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1">
                    {pendingCount}
                  </span>
                )}
              </Link>
            </>
          )}
        </div>

        {/* Right — network switcher + connect wallet */}
        <div className="hidden md:flex items-center gap-2.5 md:justify-self-end">
          <NetworkSwitcher />
          <ConnectWalletButton />
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden text-ink p-1"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {mobileOpen ? (
              <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>
            ) : (
              <><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></>
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-white border-t border-black/5 px-6 py-6 space-y-4">
          <Link href="/swap" className="block text-sm font-semibold text-ink" onClick={() => setMobileOpen(false)}>
            Swap
          </Link>
          <a href="/docs" target="_blank" rel="noopener noreferrer" className="block text-sm font-semibold text-ink" onClick={() => setMobileOpen(false)}>
            Docs
          </a>
          {!isAdmin ? (
            <Link href="/maker" className="block text-sm font-semibold text-ink-muted" onClick={() => setMobileOpen(false)}>
              Maker
            </Link>
          ) : (
            <Link href="/admin" className="block text-sm font-semibold text-amber-600" onClick={() => setMobileOpen(false)}>
              Admin
            </Link>
          )}
          <div className="pt-2 space-y-3">
            <NetworkSwitcher />
            <div onClick={() => setMobileOpen(false)}>
              <ConnectWalletButton />
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
