'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

/* ── Navigation data (used by sidebar + page nav) ─────────────── */
export const NAV_SECTIONS = [
  {
    group: 'Start',
    items: [
      { slug: 'introduction',  label: 'Welcome to HyperDex' },
      { slug: 'mission',       label: 'Our Mission' },
      { slug: 'architecture',  label: 'Architecture' },
    ],
  },
  {
    group: 'Getting Started',
    items: [
      { slug: 'networks',       label: 'Mainnet & Testnet' },
      { slug: 'what-you-need',  label: 'What You Need to Trade' },
      { slug: 'wallets',        label: 'Connecting a Wallet' },
      { slug: 'first-swap',     label: 'Making Your First Swap' },
      { slug: 'maker-setup',    label: 'Setting Up as a Maker' },
      { slug: 'pricing-engines',label: 'Pricing Engines' },
      { slug: 'vault-deposit',  label: 'Deposit Pool Inventory' },
      { slug: 'troubleshoot',   label: 'Troubleshooting' },
    ],
  },
  {
    group: 'Concepts',
    items: [
      { slug: 'rfq',            label: 'Request-for-Quote (RFQ)' },
      { slug: 'sealed-bid',     label: 'Sealed-Bid Auction' },
      { slug: 'zero-slippage',  label: 'Zero Slippage' },
      { slug: 'non-custodial',  label: 'Non-Custodial Settlement' },
      { slug: 'ed25519',        label: 'Quote Signing (ed25519)' },
      { slug: 'mev',            label: 'MEV Protection' },
      { slug: 'fees',           label: 'Protocol Fees' },
    ],
  },
  {
    group: 'Protocol Spec',
    items: [
      { slug: 'quote-struct',   label: 'Quote Struct & XDR' },
      { slug: 'auction-flow',   label: 'Auction Flow' },
      { slug: 'settlement',     label: 'Settlement Logic' },
    ],
  },
  {
    group: 'Programs',
    items: [
      { slug: 'programs',       label: 'Programs Overview' },
      { slug: 'pool-registry',  label: 'pool_registry' },
      { slug: 'vault',          label: 'maker_pool' },
      { slug: 'quote-verifier', label: 'quote_verifier' },
      { slug: 'fee-distributor',label: 'fee_distributor' },
    ],
  },
  {
    group: 'API Reference',
    items: [
      { slug: 'rest-api',       label: 'REST Endpoints' },
      { slug: 'websocket',      label: 'WebSocket Events' },
    ],
  },
  {
    group: 'Reference',
    items: [
      { slug: 'deployments',    label: 'Deployments' },
      { slug: 'tokens',         label: 'Supported Tokens' },
      { slug: 'faq',            label: 'FAQ' },
    ],
  },
];

/* ── Flat list of all pages in order ──────────────────────────── */
export const ALL_PAGES = NAV_SECTIONS.flatMap(s => s.items);

/* ── Group icons (optional decorative) ────────────────────────── */
const GROUP_ICONS: Record<string, string> = {
  'Start':           '◆',
  'Getting Started':  '▸',
  'Concepts':        '◈',
  'Protocol Spec':   '⬡',
  'Programs':        '⊞',
  'API Reference':   '⟐',
  'Reference':       '◎',
};

export default function DocsSidebar({ mobile, onClose }: { mobile?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const currentSlug = pathname === '/docs' || pathname === '/docs/'
    ? 'introduction'
    : pathname.replace('/docs/', '');

  const toggleGroup = (group: string) => {
    setCollapsed(prev => ({ ...prev, [group]: !prev[group] }));
  };

  return (
    <aside
      className={`docs-sidebar ${mobile ? 'docs-sidebar-mobile' : 'hidden lg:block w-[260px] shrink-0'}`}
    >
      {/* Scrolling and stickiness are owned by the layout wrapper on desktop;
          a second scroll container here would trap the wheel and clip the nav. */}
      <div className="py-6 px-4">
        {NAV_SECTIONS.map(g => {
          const isCollapsed = collapsed[g.group];
          return (
            <div key={g.group} className="mb-5">
              {/* Group header */}
              <button
                onClick={() => toggleGroup(g.group)}
                className="w-full flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted/60 mb-1.5 pl-2.5 pr-1 py-1 hover:text-ink-muted transition-colors group"
              >
                <span className="text-[10px] opacity-40">{GROUP_ICONS[g.group] ?? '◆'}</span>
                <span className="flex-1 text-left">{g.group}</span>
                <svg
                  width="12" height="12" viewBox="0 0 12 12"
                  className={`opacity-0 group-hover:opacity-40 transition-all duration-200 ${isCollapsed ? '-rotate-90' : ''}`}
                >
                  <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                </svg>
              </button>

              {/* Nav items */}
              {!isCollapsed && (
                <div className="space-y-0.5">
                  {g.items.map(item => {
                    const href = item.slug === 'introduction' ? '/docs' : `/docs/${item.slug}`;
                    const isActive = currentSlug === item.slug;
                    return (
                      <Link
                        key={item.slug}
                        href={href}
                        onClick={onClose}
                        className={`docs-sidebar-item block text-[13px] px-3 py-1.5 rounded-lg transition-all duration-150 ${
                          isActive
                            ? 'font-semibold text-ink bg-lavender/50 docs-sidebar-active'
                            : 'text-ink-muted hover:text-ink hover:bg-black/4'
                        }`}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
