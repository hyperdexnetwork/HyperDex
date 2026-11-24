import Link from 'next/link';
import Image from 'next/image';
import Navbar from '@/components/Navbar';
import Reveal from '@/components/landing/Reveal';
import ProtocolTicker from '@/components/landing/ProtocolTicker';
import AuctionDemo from '@/components/landing/AuctionDemo';
import { ACTIVE_NETWORK } from '@/lib/networks';

const GITHUB_URL = 'https://github.com/hyperdexnetwork/HyperDex';
const X_URL = 'https://x.com/hyperdex_live';

/* ── Small pieces ────────────────────────────────────────────── */

function LogoMark({ className = 'h-6 w-6', color = '#111118' }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 100 108" fill="none" className={`${className} shrink-0`} aria-hidden="true">
      {[5, 17, 29, 63, 75, 87].map(x => <rect key={x} x={x} y="5" width="8" height="98" fill={color} />)}
      {[42, 54, 66].map(y => <rect key={y} x="5" y={y} width="90" height="8" fill={color} />)}
    </svg>
  );
}

function Arrow({ className = '' }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M4 16L16 4M16 4H7M16 4V13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Eyebrow({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <p className={`text-[11px] font-bold uppercase tracking-[0.18em] mb-4 ${dark ? 'text-white/50' : 'text-ink-muted'}`}>
      {children}
    </p>
  );
}

type Card = { n: string; title: string; tag: string; desc: string; href: string; image?: string };

/**
 * Three-up bordered card row, shared by "Why HyperDex" and "Who it's for".
 * Cards without an image get the lavender hover; cards with one reveal the
 * photo on hover (and keyboard focus) behind a dark scrim, with the text
 * switching to white.
 */
function CardRow({ cards }: { cards: Card[] }) {
  return (
    <div className="reveal rounded-2xl border border-black/15 overflow-hidden grid grid-cols-1 md:grid-cols-3 bg-white/30">
      {cards.map((card, i) => {
        const img = Boolean(card.image);
        // Text colour flips to white on image cards when the photo shows.
        // Class names are written out in full so Tailwind can detect them.
        const flip = (base: string, onImage: string) => (img ? `${base} transition-colors duration-500 ${onImage}` : base);
        return (
          <Link
            key={card.tag}
            href={card.href}
            className={`group relative isolate overflow-hidden p-8 md:p-9 flex flex-col min-h-[320px] outline-none transition-colors duration-300 ${
              img ? '' : 'hover:bg-lavender/70 focus-visible:bg-lavender/70'
            } ${i > 0 ? 'border-t md:border-t-0 md:border-l border-black/15' : ''}`}
          >
            {card.image && (
              <span aria-hidden="true" className="absolute inset-0 -z-10 opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-focus-visible:opacity-100">
                <Image
                  src={card.image}
                  alt=""
                  fill
                  sizes="(min-width: 768px) 33vw, 100vw"
                  className="object-cover scale-110 transition-transform duration-[1200ms] ease-out group-hover:scale-100 group-focus-visible:scale-100"
                />
                <span className="absolute inset-0 bg-gradient-to-t from-[#0b0b16]/90 via-[#0b0b16]/55 to-[#0b0b16]/35" />
              </span>
            )}
            <div className="flex items-center justify-between">
              <span className={flip('font-mono text-xs text-ink-muted', 'group-hover:text-white/60 group-focus-visible:text-white/60')}>{card.n}</span>
              <Arrow className={`${img ? 'text-white' : 'text-ink'} opacity-0 -translate-x-1 translate-y-1 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0 group-hover:translate-y-0 group-focus-visible:opacity-100`} />
            </div>
            <h3 className={flip('mt-6 text-ink text-[28px] font-semibold tracking-[-0.02em] leading-[1.1]', 'group-hover:text-white group-focus-visible:text-white')}>
              {card.title}
            </h3>
            <div className="mt-auto pt-10">
              <p className={flip('text-[11px] font-bold uppercase tracking-[0.18em] text-ink mb-3', 'group-hover:text-white group-focus-visible:text-white')}>{card.tag}</p>
              <p className={flip('text-sm text-ink-muted leading-relaxed', 'group-hover:text-white/75 group-focus-visible:text-white/75')}>{card.desc}</p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

/* ── Content ─────────────────────────────────────────────────── */

const FACTS = [
  { v: '30s', k: 'Sealed-bid auction window' },
  { v: '~5s', k: 'Settlement on Stellar' },
  { v: '0.10%', k: 'Flat, disclosed protocol fee' },
  { v: '0', k: 'Funds held by HyperDex' },
];

const WHY: Card[] = [
  {
    n: '01',
    title: 'A firm price, for your exact size.',
    tag: 'Firm quotes',
    image: '/cards/firm-price.webp',
    desc: 'Makers sign a quote for the amount you asked for. It settles at that price or not at all. No route estimate, no slippage tolerance.',
    href: '/docs/zero-slippage',
  },
  {
    n: '02',
    title: 'Competition you can’t see, working for you.',
    tag: 'Sealed-bid auction',
    image: '/cards/sealed-bid.webp',
    desc: 'Every maker quotes blind inside a 30-second window, so the only way to win your order is to price it well.',
    href: '/docs/sealed-bid',
  },
  {
    n: '03',
    title: 'Your keys. Your funds. Always.',
    tag: 'Non-custodial',
    image: '/cards/non-custodial.webp',
    desc: 'You sign once in your own wallet. A Soroban contract settles both legs atomically. Nothing sits with HyperDex in between.',
    href: '/docs/non-custodial',
  },
];

const AUDIENCES: Card[] = [
  {
    n: '01',
    title: 'Traders.',
    tag: 'Swap',
    image: '/cards/trader.webp',
    desc: 'Ask for a quote, watch makers compete, accept the best one. One signature, settled in seconds.',
    href: '/swap',
  },
  {
    n: '02',
    title: 'Market makers.',
    tag: 'Maker SDK',
    image: '/cards/maker.webp',
    desc: 'Plug a pricing engine into the Maker SDK, quote the flow you want, and keep full control of your inventory.',
    href: '/docs/maker-setup',
  },
  {
    n: '03',
    title: 'Size traders.',
    tag: 'Block quotes',
    image: '/cards/size-trader.webp',
    desc: 'Get one firm, signature-verified price for the whole order instead of walking a book or splitting across pools.',
    href: '/docs/rfq',
  },
];

const STEPS = [
  {
    title: 'Connect your wallet',
    desc: 'Link Freighter or another Stellar wallet. HyperDex reads your public key only. Your private keys never leave your device.',
  },
  {
    title: 'Request a quote',
    desc: 'Choose the pair and amount. Makers submit sealed bids over a 30-second auction, and the best signed quote is returned to you.',
  },
  {
    title: 'Sign and settle',
    desc: 'Sign once. The Soroban contract verifies the maker’s signature and settles both legs atomically, minus the disclosed 0.10% fee.',
  },
];

const CONTRACTS = [
  { label: 'Quote verifier', id: ACTIVE_NETWORK.quoteVerifier },
  { label: 'Pool registry', id: ACTIVE_NETWORK.poolRegistry },
  { label: 'Fee distributor', id: ACTIVE_NETWORK.feeDistributor },
].filter(c => c.id);

const short = (id: string) => `${id.slice(0, 6)}…${id.slice(-6)}`;

const FOOTER_COLS: { title: string; links: { label: string; href: string; external?: boolean }[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'Swap', href: '/swap' },
      { label: 'Become a maker', href: '/maker' },
      { label: 'Fees', href: '/docs/fees' },
    ],
  },
  {
    title: 'Protocol',
    links: [
      { label: 'How RFQ works', href: '/docs/rfq' },
      { label: 'Sealed-bid auction', href: '/docs/sealed-bid' },
      { label: 'Smart contracts', href: '/docs/programs' },
      { label: 'REST API', href: '/docs/rest-api' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Documentation', href: '/docs' },
      { label: 'Roadmap', href: '/docs/roadmap' },
      { label: 'Security', href: `${GITHUB_URL}/blob/main/SECURITY.md`, external: true },
    ],
  },
];

const SOCIALS = [
  {
    label: 'HyperDex on X',
    href: X_URL,
    path: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z',
  },
  {
    label: 'HyperDex on GitHub',
    href: GITHUB_URL,
    path: 'M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.38 7.86 10.9.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.69 1.25 3.35.96.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z',
  },
];

/* ── Page ────────────────────────────────────────────────────── */

export default function HomePage() {
  return (
    <>
      <Reveal />
      <Navbar />

      {/* ── HERO ──────────────────────────────────────────────── */}
      <section className="pt-24 pb-6 px-4 md:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="relative w-full rounded-[28px] overflow-hidden bg-navy">
            {/* Static background image */}
            <Image
              src="/hero-bg.avif"
              alt=""
              fill
              priority
              sizes="(min-width: 1280px) 1216px, 100vw"
              className="object-cover object-center"
            />
            {/* Legibility: darker on the text side, soft vignette at the bottom */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#0b0b16]/85 via-[#0b0b16]/55 to-[#0b0b16]/25" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0b0b16]/70 via-transparent to-transparent" />

            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-12 items-center px-6 sm:px-10 lg:px-14 pt-20 pb-32 lg:pt-24 lg:pb-36 min-h-[640px]">
              {/* Copy */}
              <div className="hero-in">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 backdrop-blur-md px-3.5 py-1.5 text-xs font-medium text-white/90">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 motion-safe:animate-ping" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                  </span>
                  Live on {ACTIVE_NETWORK.label}
                </span>

                <h1 className="mt-7 text-white text-[52px] sm:text-7xl lg:text-[84px] font-semibold leading-[0.95] tracking-[-0.035em]">
                  Trade <span className="font-serif italic font-normal tracking-[-0.01em]">without</span>
                  <br />limits.
                </h1>

                <p className="mt-7 max-w-[30rem] text-white/75 text-lg leading-relaxed">
                  Sealed-bid RFQ on Stellar. Market makers compete blind for your order,
                  and you get one firm price that settles atomically or not at all.
                </p>

                <div className="mt-9 flex flex-wrap items-center gap-3">
                  <Link
                    href="/swap"
                    className="group inline-flex items-center gap-2 bg-white text-ink text-sm font-semibold pl-7 pr-6 py-3.5 rounded-full hover:bg-lavender transition-colors"
                  >
                    Launch App
                    <Arrow className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </Link>
                  <a
                    href="/docs"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 border border-white/25 text-white text-sm font-semibold px-7 py-3.5 rounded-full hover:bg-white/10 transition-colors"
                  >
                    Read the docs
                  </a>
                </div>
              </div>

              {/* Product visual */}
              <div className="hero-in hero-in-delay flex justify-center lg:justify-end">
                <AuctionDemo />
              </div>
            </div>

            {/* Protocol rail */}
            <div
              className="absolute bottom-0 left-0 right-0 z-20 py-4 overflow-hidden border-t border-white/10"
              style={{
                background: 'rgba(8,8,18,0.45)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)',
                maskImage: 'linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)',
              }}
            >
              <ProtocolTicker />
            </div>
          </div>
        </div>
      </section>

      {/* ── WHAT IS HYPERDEX ──────────────────────────────────── */}
      <section className="pt-24 pb-20 px-4 md:px-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[0.8fr_1.2fr] gap-10 lg:gap-16 items-start">
          <div className="reveal">
            <Eyebrow>What is HyperDex</Eyebrow>
            <h2 className="text-5xl md:text-6xl font-semibold text-ink leading-[1] tracking-[-0.03em]">
              The exchange that <span className="font-serif italic font-normal">asks</span> for a price.
            </h2>
          </div>
          <div className="reveal delay-1 lg:pt-10">
            <p className="text-ink text-xl md:text-2xl font-medium leading-snug tracking-[-0.01em]">
              HyperDex is a request-for-quote exchange. Market makers compete in a
              sealed-bid auction to quote a firm price for your exact size, and the
              trade settles atomically on Stellar.
            </p>
            <Link href="/docs/introduction" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-ink border-b border-ink/30 pb-1 hover:border-ink transition-colors">
              How it’s built <Arrow />
            </Link>
          </div>
        </div>

        {/* Facts */}
        <dl className="reveal delay-2 mt-20 grid grid-cols-2 lg:grid-cols-4 gap-y-10">
          {FACTS.map(f => (
            <div key={f.k} className="border-l border-black/15 pl-6 py-1">
              <dt className="sr-only">{f.k}</dt>
              <dd className="text-5xl md:text-6xl font-semibold tracking-[-0.04em] text-ink tabular-nums">{f.v}</dd>
              <dd className="mt-3 text-sm text-ink-muted">{f.k}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ── WHY ───────────────────────────────────────────────── */}
      <section className="pb-24 px-4 md:px-8">
        <div className="max-w-7xl mx-auto">
          <CardRow cards={WHY} />
        </div>
      </section>

      {/* ── HOW IT WORKS ──────────────────────────────────────── */}
      <section className="px-4 md:px-8 py-24 bg-cream-dark/60 border-y border-black/10">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-14 lg:gap-24">
          <div className="reveal lg:sticky lg:top-32 self-start">
            <Eyebrow>Protocol</Eyebrow>
            <h2 className="text-5xl md:text-6xl font-semibold text-ink leading-[1] tracking-[-0.03em] mb-6">
              Three steps.<br />
              <span className="font-serif italic font-normal">One</span> signature.
            </h2>
            <p className="text-ink-muted leading-relaxed max-w-sm">
              The execution of a professional desk with the self-custody of DeFi.
            </p>
            <Link href="/docs/auction-flow" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-ink border-b border-ink/30 pb-1 hover:border-ink transition-colors">
              Read the auction flow <Arrow />
            </Link>
          </div>

          <ol className="relative">
            {/* rail */}
            <span className="absolute left-[19px] top-3 bottom-3 w-px bg-black/15" aria-hidden="true" />
            {STEPS.map((step, i) => (
              <li key={step.title} className={`reveal delay-${i + 1} relative pl-16 ${i < STEPS.length - 1 ? 'pb-14' : ''}`}>
                <span className="absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-full border border-black/15 bg-cream font-mono text-xs text-ink">
                  0{i + 1}
                </span>
                <h3 className="pt-1.5 text-2xl font-semibold tracking-[-0.02em] text-ink mb-3">{step.title}</h3>
                <p className="text-ink-muted leading-relaxed max-w-md">{step.desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── WHO IT'S FOR ──────────────────────────────────────── */}
      <section className="py-24 px-4 md:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="reveal flex flex-col md:flex-row md:items-end justify-between gap-10 mb-12">
            <div>
              <Eyebrow>Who it’s for</Eyebrow>
              <h2 className="text-5xl md:text-6xl font-semibold text-ink leading-[1] tracking-[-0.03em]">
                Built for both<br />sides of the trade.
              </h2>
            </div>
            <div>
              <Eyebrow>Built on</Eyebrow>
              <div className="flex items-center gap-8 text-ink">
                <Image src="/logo-stellar.png" alt="Stellar" width={1776} height={548} className="h-7 w-auto" />
                <span className="h-6 w-px bg-black/15" aria-hidden="true" />
                <span className="flex items-center gap-2.5">
                  <Image src="/logo-usdc.png" alt="" width={64} height={64} className="h-7 w-7 grayscale contrast-125" />
                  <span className="text-lg font-semibold tracking-tight">USDC</span>
                </span>
                <span className="flex items-center gap-2.5">
                  <Image src="/logo-eurc.png" alt="" width={64} height={64} className="h-7 w-7 grayscale contrast-125" />
                  <span className="text-lg font-semibold tracking-tight">EURC</span>
                </span>
              </div>
            </div>
          </div>
          <CardRow cards={AUDIENCES} />
        </div>
      </section>

      {/* ── VERIFY ────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-24">
        <div className="max-w-7xl mx-auto reveal rounded-[28px] bg-navy text-white overflow-hidden relative">
          <div
            className="pointer-events-none absolute -top-40 -right-40 h-[520px] w-[520px] rounded-full opacity-40 blur-3xl"
            style={{ background: 'radial-gradient(circle, #6B5CF6 0%, transparent 70%)' }}
            aria-hidden="true"
          />
          <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-12 p-8 sm:p-12 lg:p-16">
            <div>
              <Eyebrow dark>Don’t trust. Verify.</Eyebrow>
              <h2 className="text-4xl md:text-5xl font-semibold leading-[1.02] tracking-[-0.03em]">
                Every rule is enforced <span className="font-serif italic font-normal whitespace-nowrap">on-chain.</span>
              </h2>
              <p className="mt-6 text-white/60 leading-relaxed max-w-md">
                Quote signatures, settlement and fees are checked by open-source
                Soroban contracts. Read the code, inspect the contracts, follow
                every trade on the explorer.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-white text-ink text-sm font-semibold px-6 py-3 rounded-full hover:bg-lavender transition-colors">
                  View source <Arrow />
                </a>
                <a href={`${GITHUB_URL}/blob/main/SECURITY.md`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 border border-white/20 text-white text-sm font-semibold px-6 py-3 rounded-full hover:bg-white/10 transition-colors">
                  Security policy
                </a>
              </div>
            </div>

            <div className="flex flex-col justify-end">
              {CONTRACTS.length > 0 ? (
                <ul className="divide-y divide-white/10 border-y border-white/10">
                  {CONTRACTS.map(c => (
                    <li key={c.label}>
                      <a
                        href={`${ACTIVE_NETWORK.explorerBase}/contract/${c.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center justify-between gap-4 py-5 hover:bg-white/[0.03] transition-colors"
                      >
                        <span className="text-white/60 text-sm">{c.label}</span>
                        <span className="flex items-center gap-3 font-mono text-sm text-white">
                          {short(c.id)}
                          <Arrow className="text-white/40 group-hover:text-white transition-colors" />
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="divide-y divide-white/10 border-y border-white/10">
                  {['quote_verifier', 'pool_registry', 'maker_pool', 'fee_distributor'].map(name => (
                    <li key={name}>
                      <Link href={`/docs/${name === 'maker_pool' ? 'vault' : name.replace('_', '-')}`} className="group flex items-center justify-between py-5 hover:bg-white/[0.03] transition-colors">
                        <span className="font-mono text-sm text-white">{name}</span>
                        <Arrow className="text-white/40 group-hover:text-white transition-colors" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-4 text-xs text-white/40">
                {CONTRACTS.length > 0 ? `Deployed on ${ACTIVE_NETWORK.label}. Opens Stellar Expert.` : 'Contract reference documentation.'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────── */}
      <footer className="px-4 md:px-8 pb-6">
        <div className="max-w-7xl mx-auto">
          {/* Links */}
          <div className="border-t border-black/10 pt-16 pb-14 grid grid-cols-2 md:grid-cols-[1.6fr_repeat(3,1fr)] gap-x-10 gap-y-12">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2.5">
                <LogoMark />
                <span className="font-bold text-ink text-base tracking-tight">HyperDex</span>
              </div>
              <p className="mt-5 max-w-[19rem] text-[15px] text-ink-muted leading-relaxed">
                Sealed-bid RFQ for USDC and EURC. Firm quotes from competing makers,
                settled atomically on Stellar.
              </p>
              <div className="mt-7 flex items-center gap-2.5">
                {SOCIALS.map(s => (
                  <a
                    key={s.href}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={s.label}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-black/15 text-ink hover:bg-ink hover:text-white hover:border-ink transition-colors"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d={s.path} />
                    </svg>
                  </a>
                ))}
              </div>
            </div>
            {FOOTER_COLS.map(col => (
              <nav key={col.title} aria-label={col.title}>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-muted mb-5">{col.title}</p>
                <ul className="space-y-3.5">
                  {col.links.map(l => {
                    const cls = 'group inline-flex items-center gap-1.5 text-[15px] text-ink hover:text-purple transition-colors';
                    return (
                      <li key={l.label}>
                        {l.external ? (
                          <a href={l.href} target="_blank" rel="noopener noreferrer" className={cls}>
                            {l.label}
                            <Arrow className="h-3 w-3 opacity-40 group-hover:opacity-100 transition-opacity" />
                          </a>
                        ) : (
                          <Link href={l.href} className={cls}>{l.label}</Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </nav>
            ))}
          </div>

          {/* Bottom bar */}
          <div className="border-t border-black/10 py-6 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-ink-muted">
            <p>&copy; 2026 HyperDex · MIT License</p>
            <p className="inline-flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
              {ACTIVE_NETWORK.label} · test funds only
            </p>
            <a href="#" className="inline-flex items-center gap-1.5 text-ink hover:text-purple transition-colors">
              Back to top
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M10 16V4M10 4L5 9M10 4l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          </div>

          {/* Oversized wordmark — the page's sign-off */}
          <div aria-hidden="true" className="select-none overflow-hidden -mb-6">
            <p
              className="text-center font-semibold leading-[0.8] tracking-[-0.065em] text-[clamp(76px,20vw,276px)] text-transparent bg-clip-text pt-2"
              style={{ backgroundImage: 'linear-gradient(to bottom, rgba(17,17,24,0.16) 0%, rgba(17,17,24,0.02) 85%)' }}
            >
              HyperDex
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
