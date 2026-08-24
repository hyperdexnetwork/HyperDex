'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import Navbar from '@/components/Navbar';
import { useNetwork } from '@/hooks/useNetwork';

function useReveal() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            e.target.classList.add('active');
            observer.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}

/* ── Coin SVG — metallic lavender disc ───────────────────────── */
function CoinSvg({ size = 220 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 220 220" fill="none">
      <defs>
        <radialGradient id="coinFace" cx="38%" cy="32%" r="68%">
          <stop offset="0%" stopColor="#E8E4FF" />
          <stop offset="40%" stopColor="#C4BCEE" />
          <stop offset="100%" stopColor="#8A7ED4" />
        </radialGradient>
        <radialGradient id="coinEdge" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#A89FDE" />
          <stop offset="100%" stopColor="#5E4FB5" />
        </radialGradient>
        <ellipse id="ellipse" cx="110" cy="110" rx="95" ry="28" />
      </defs>
      {/* Edge/depth */}
      <ellipse cx="110" cy="124" rx="95" ry="28" fill="url(#coinEdge)" opacity="0.9" />
      {/* Face */}
      <ellipse cx="110" cy="106" rx="95" ry="95" fill="url(#coinFace)" />
      {/* Shine */}
      <ellipse cx="82" cy="74" rx="28" ry="18" fill="white" opacity="0.22" transform="rotate(-15 82 74)" />
      {/* H mark */}
      <text x="110" y="120" textAnchor="middle" fontFamily="Georgia, serif" fontSize="62" fontWeight="700" fill="rgba(90,70,180,0.35)" letterSpacing="-2">H</text>
      {/* Rim */}
      <ellipse cx="110" cy="106" rx="95" ry="95" fill="none" stroke="rgba(160,148,220,0.5)" strokeWidth="1.5" />
    </svg>
  );
}

/* ── Ticker data ─────────────────────────────────────────────── */
// The track renders TICKER_COPIES back-to-back copies of this list; the CSS
// loop travels exactly one copy so the seam is invisible.
const TICKER_COPIES = 3;

// Scroll speed in CSS px/second. The animation used to travel 50% of the
// *container* width (a flex container is block-level, so the track was sized by
// its parent, not its content) — which both desynced the loop and made the
// speed depend on viewport width. Pinning px/sec keeps it constant everywhere;
// 20 matches how fast the rail read before.
const TICKER_SPEED_PX_PER_SEC = 20;

const tickerData = [
  { pair: 'EURC/USDC', price: '1.09',       change: '+0.4%',  pos: true  },
  { pair: 'USDC/EURC', price: '0.917',      change: '-0.4%',  pos: false },
  { pair: 'XLM/USDC',  price: '0.112',      change: '+2.1%',  pos: true  },
  { pair: 'BTC/USDC',  price: '64,230.50',  change: '+2.4%',  pos: true  },
  { pair: 'ETH/USDC',  price: '3,450.20',   change: '+1.8%',  pos: true  },
  { pair: 'SOL/USDC',  price: '145.80',     change: '-0.5%',  pos: false },
  { pair: 'ARB/USDC',  price: '1.15',       change: '+4.2%',  pos: true  },
];

/* ── Partner logos (text) ────────────────────────────────────── */

/* ── Main page ───────────────────────────────────────────────── */
/**
 * Drives the marquee duration from the measured width of a single copy, so the
 * rail scrolls at a fixed px/sec no matter the viewport, the font that ends up
 * loading, or how many pairs are listed.
 */
function useTickerSpeed() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const apply = () => {
      const copyWidth = el.scrollWidth / TICKER_COPIES;
      if (copyWidth > 0) {
        el.style.animationDuration = `${copyWidth / TICKER_SPEED_PX_PER_SEC}s`;
      }
    };

    apply();
    // Web fonts land after first paint and change the measured width.
    document.fonts?.ready.then(apply).catch(() => {});

    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return ref;
}

export default function HomePage() {
  useReveal();
  const { network } = useNetwork();
  const tickerRef = useTickerSpeed();

  return (
    <>
      <Navbar />

      {/* ── HERO ──────────────────────────────────────────────── */}
      <section className="pt-24 pb-8 px-4 md:px-8">
        <div className="max-w-7xl mx-auto">
          <div
            className="relative w-full rounded-3xl overflow-hidden"
            style={{ minHeight: '520px' }}
          >
            {/* Background image */}
            <img
              src="/hero-bg.avif"
              alt=""
              className="absolute inset-0 w-full h-full object-cover object-center"
            />

            {/* Dark overlay */}
            <div className="absolute inset-0 bg-black/40" />

            {/* Centered text */}
            <div className="relative z-10 flex flex-col items-center justify-center text-center px-6 pt-24 pb-20 min-h-[520px]">
              <h1 className="font-display text-5xl md:text-7xl font-bold text-white leading-tight mb-8">
                Trade Without<br />Limits
              </h1>

              <Link
                href="/swap"
                className="inline-block bg-white text-navy text-sm font-semibold px-8 py-3.5 rounded-full hover:bg-white/90 transition-colors mb-6 mt-4"
              >
                Launch App
              </Link>
            </div>

            {/* Ticker — inside the hero card, fades in/out at edges */}
            <div className="absolute bottom-0 left-0 right-0 z-20 py-4 overflow-hidden"
              style={{
                background: 'rgba(0,0,0,0.35)',
                backdropFilter: 'blur(4px)',
                WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)',
                maskImage: 'linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)',
              }}
            >
              <div className="ticker-track" ref={tickerRef} aria-hidden="true">
                {Array.from({ length: TICKER_COPIES }, () => tickerData).flat().map((item, i) => (
                  <div key={i} className="inline-flex items-center gap-3 px-8 border-r border-white/15">
                    <span className="text-white text-sm font-semibold">{item.pair}</span>
                    <span className="text-white/50 text-sm">${item.price}</span>
                    <span className={`text-sm font-semibold ${item.pos ? 'text-green-400' : 'text-red-400'}`}>
                      {item.change}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── WHAT IS HYPERDEX ──────────────────────────────────── */}
      <section className="py-24 px-4 md:px-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-start">
          <div className="reveal">
            <h2 className="font-display text-5xl md:text-6xl font-bold text-ink leading-tight mb-6">
              What is<br />HyperDex?
            </h2>
            <Link
              href="/swap"
              className="inline-block bg-ink text-white text-sm font-semibold px-6 py-3 rounded-full hover:bg-navy-light transition-colors"
            >
              Explore now
            </Link>
          </div>

          <div className="reveal delay-1 pt-2">
            <p className="text-ink text-xl md:text-2xl font-medium leading-snug">
              HyperDex is a Request-For-Quote exchange where professional market makers
              compete in sealed-bid auctions to deliver the best price — with zero slippage
              and instant Stellar settlement.
            </p>
          </div>
        </div>
      </section>

      {/* ── FEATURE CARDS ─────────────────────────────────────── */}
      <section className="pb-20 px-4 md:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="reveal rounded-2xl border border-black/20 overflow-hidden flex flex-col md:flex-row">

            {[
              {
                title: 'Capital that compounds.',
                tag: 'LIQUIDITY REWARDS',
                desc: 'Earn on every trade through our maker rewards programme. Provide liquidity and collect competitive spreads on each settled auction.',
              },
              {
                title: 'Always liquid, always settled.',
                tag: 'STELLAR SETTLEMENT',
                desc: 'Trades settle directly on Stellar — no pool imbalances, no lockups. Funds are yours the moment the ledger closes (~5s).',
              },
              {
                title: '100% non-custodial.',
                tag: 'SELF CUSTODY',
                desc: 'Your keys never leave Freighter. Smart contracts enforce every trade atomically — no trust required, no withdrawal delays.',
              },
            ].map((card, i) => (
              <div
                key={card.tag}
                className="group relative flex-1 p-9 flex flex-col justify-between min-h-[340px] cursor-default transition-all duration-300 hover:-translate-y-2"
                style={{ borderRight: i < 2 ? '1px solid rgba(0,0,0,0.20)' : 'none' }}
              >
                {/* Hover background — soft lavender */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{ background: 'linear-gradient(135deg, #C8C3EE 0%, #D2CDEF 60%, #BEB9E8 100%)' }}
                />

                {/* Headline */}
                <h3 className="relative z-10 text-ink text-3xl font-bold leading-tight">
                  {card.title}
                </h3>

                {/* Tag + description */}
                <div className="relative z-10 mt-auto pt-10">
                  <p className="text-xs font-bold uppercase tracking-widest text-ink-muted mb-3">
                    {card.tag}
                  </p>
                  <p className="text-sm text-ink-muted leading-relaxed">
                    {card.desc}
                  </p>
                </div>
              </div>
            ))}

          </div>
        </div>
      </section>


      {/* ── USE CASES ─────────────────────────────────────────── */}
      <section className="py-16 px-4 md:px-8">
        <div className="max-w-7xl mx-auto">

          {/* Header row — Use cases left, Ecosystem right */}
          <div className="reveal flex flex-col md:flex-row md:items-start justify-between gap-8 mb-10">

            {/* Left */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted mb-3">
                HyperDex in Action
              </p>
              <h2 className="font-display text-5xl md:text-6xl font-bold text-ink leading-tight">
                Use cases
              </h2>
            </div>

            {/* Right — Ecosystem */}
            <div className="flex flex-col items-start">
              <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted mb-3">
                Ecosystem
              </p>
              <div className="flex items-center gap-6 -ml-3">
                <img src="/logo-stellar.png" alt="Stellar" className="object-contain" style={{ height: '108px', width: '108px', filter: 'brightness(0)' }} />
                <img src="/logo-usdc.png"     alt="USDC"    className="h-14 w-14 object-contain" />
                <img src="/logo-eurc.png"     alt="EURC"    className="h-14 w-14 object-contain" />
              </div>
            </div>

          </div>

          <div className="reveal rounded-2xl border border-black/20 overflow-hidden flex flex-col md:flex-row">
            {[
              {
                title: 'Market Makers.',
                tag: 'MAKER PROGRAMME',
                desc: 'Integrate our Maker SDK to participate in sealed-bid RFQ auctions. Earn spreads on every filled trade with full inventory control and automated quote management.',
              },
              {
                title: 'Traders.',
                tag: 'ZERO SLIPPAGE',
                desc: 'Get the best available price from competing market makers in a 30-second sealed-bid auction. Zero slippage, guaranteed execution on Stellar.',
              },
              {
                title: 'Institutions.',
                tag: 'BLOCK TRADES',
                desc: 'Execute large block trades with certainty. Our RFQ protocol delivers institutional-grade fills with cryptographic settlement on Stellar.',
              },
            ].map((card, i) => (
              <div
                key={card.tag}
                className="group relative flex-1 p-9 flex flex-col justify-between min-h-[340px] cursor-default transition-all duration-300 hover:-translate-y-2"
                style={{ borderRight: i < 2 ? '1px solid rgba(0,0,0,0.20)' : 'none' }}
              >
                {/* Hover background */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{ background: 'linear-gradient(135deg, #C8C3EE 0%, #D2CDEF 60%, #BEB9E8 100%)' }}
                />

                <h3 className="relative z-10 text-ink text-3xl font-bold leading-tight">
                  {card.title}
                </h3>

                <div className="relative z-10 mt-auto pt-10">
                  <p className="text-xs font-bold uppercase tracking-widest text-ink-muted mb-3">
                    {card.tag}
                  </p>
                  <p className="text-sm text-ink-muted leading-relaxed">
                    {card.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ──────────────────────────────────────── */}
      <section className="px-4 md:px-10">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row">

          {/* Left — heading */}
          <div className="reveal lg:w-1/2 py-20 lg:pr-16">
            <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted mb-3">Protocol</p>
            <h2 className="font-display text-5xl font-bold text-ink leading-tight mb-5">
              How HyperDex<br />works
            </h2>
            <p className="text-ink-muted leading-relaxed max-w-sm">
              The efficiency of a centralised exchange with the self-custody and
              security of DeFi — three steps to optimal execution.
            </p>
          </div>

          {/* Vertical divider — connects down to the bottom border */}
          <div className="hidden lg:block w-px bg-black/10 my-24" />

          {/* Right — steps (no numbering) */}
          <div className="lg:w-1/2 py-20 lg:pl-16 flex flex-col gap-10">
            {[
              {
                title: 'Connect Wallet',
                desc: 'Link your Freighter wallet. HyperDex reads your public key only — your private keys never leave your device.',
              },
              {
                title: 'Start an Auction',
                desc: 'Enter amount and token pair. Market makers compete in a sealed 30-second bid round to give you the best rate.',
              },
              {
                title: 'Execute Instantly',
                desc: 'Sign once in Freighter. The Soroban contract atomically settles at the guaranteed price — no slippage ever.',
              },
            ].map((step, i) => (
              <div key={step.title} className={`reveal delay-${i + 1}`}>
                <h3 className="text-lg font-bold text-ink mb-2">{step.title}</h3>
                <p className="text-ink-muted text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────── */}
      <footer className="bg-cream border-t border-black/10 px-4 md:px-10">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row min-h-[480px]">

            {/* ── LEFT PANEL ── */}
            <div className="flex-1 py-16 pr-0 lg:pr-16 flex flex-col justify-between">
              {/* Logo + headline */}
              <div>
                <div className="flex items-center gap-2.5 mb-10">
                  <svg viewBox="0 0 100 108" fill="none" className="h-6 w-6 shrink-0">
                    <rect x="5"  y="5" width="8" height="98" fill="#111118" />
                    <rect x="17" y="5" width="8" height="98" fill="#111118" />
                    <rect x="29" y="5" width="8" height="98" fill="#111118" />
                    <rect x="63" y="5" width="8" height="98" fill="#111118" />
                    <rect x="75" y="5" width="8" height="98" fill="#111118" />
                    <rect x="87" y="5" width="8" height="98" fill="#111118" />
                    <rect x="5" y="42" width="90" height="8" fill="#111118" />
                    <rect x="5" y="54" width="90" height="8" fill="#111118" />
                    <rect x="5" y="66" width="90" height="8" fill="#111118" />
                  </svg>
                  <span className="font-display font-bold text-ink text-base">HyperDex</span>
                </div>

                <h2 className="font-display text-5xl md:text-6xl font-bold text-ink leading-tight mb-12">
                  Trade without<br />limits.
                </h2>
              </div>

              {/* Nav columns */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
                {[
                  {
                    title: 'PRODUCT',
                    links: [
                      { label: 'Swap',           href: '/swap' },
                      { label: 'Maker',          href: '/maker' },
                      { label: 'Docs',           href: '/docs', external: true },
                      { label: 'Fees',           href: '#' },
                    ],
                  },
                  {
                    title: 'PROTOCOL',
                    links: [
                      { label: 'RFQ Spec',       href: '#' },
                      { label: 'Smart Contracts', href: '#' },
                      { label: 'Soroban',        href: '#' },
                      { label: 'Bug Bounty',     href: '#' },
                    ],
                  },
                  {
                    title: 'COMPANY',
                    links: [
                      { label: 'About',          href: '#' },
                      { label: 'Blog',           href: '#' },
                      { label: 'Careers',        href: '#' },
                    ],
                  },
                  {
                    title: 'SOCIAL',
                    links: [
                      { label: 'Twitter / X',    href: 'https://x.com/hyperdex_live', external: true },
                      { label: 'Discord',        href: '#' },
                      { label: 'GitHub',         href: 'https://github.com/hyperdexnetwork/HyperDex', external: true },
                    ],
                  },
                ].map(col => (
                  <div key={col.title}>
                    <p className="text-xs font-bold uppercase tracking-widest text-ink-muted mb-4">{col.title}</p>
                    <ul className="space-y-3">
                      {col.links.map((l: any) => (
                        <li key={l.label}>
                          {l.external ? (
                            <a href={l.href} target="_blank" rel="noopener noreferrer" className="text-[15px] text-ink hover:text-ink-muted transition-colors">
                              {l.label}
                            </a>
                          ) : (
                            <Link href={l.href} className="text-[15px] text-ink hover:text-ink-muted transition-colors">
                              {l.label}
                            </Link>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            {/* ── VERTICAL DIVIDER ── */}
            <div className="hidden lg:block w-px bg-black/10 my-12" />

            {/* ── RIGHT PANEL ── */}
            <div className="lg:w-[420px] py-16 pl-0 lg:pl-16 flex flex-col justify-start">
              <p className="text-xs font-bold uppercase tracking-widest text-ink-muted mb-6">COMMUNITY</p>

              <h3 className="font-display text-4xl md:text-5xl font-bold text-ink leading-tight mb-5">
                Be first on<br />HyperDex.
              </h3>

              <p className="text-ink-muted text-[15px] leading-relaxed mb-12">
                Early access to new trading pairs, maker rewards, and protocol updates.
              </p>

              {/* Email input */}
              <div className="border-b border-black/20 flex items-center gap-3 pb-3">
                <input
                  type="email"
                  placeholder="you@domain.com"
                  className="flex-1 bg-transparent text-ink text-[15px] placeholder:text-ink-muted/50 outline-none"
                />
                <button
                  className="text-ink hover:text-ink-muted transition-colors shrink-0"
                  aria-label="Subscribe"
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M4 16L16 4M16 4H7M16 4V13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>

          </div>

          {/* Bottom bar */}
          <div className="border-t border-black/10 py-5 flex flex-col sm:flex-row justify-between items-center gap-3">
            <p className="text-ink-muted text-sm">&copy; 2026 HyperDex. All rights reserved.</p>
            <p className="text-ink-muted text-sm" suppressHydrationWarning>{network.label}</p>
          </div>
        </div>
      </footer>
    </>
  );
}
