'use client';

import Link from 'next/link';
import DocsTableOfContents from '@/components/docs/DocsTableOfContents';
import DocsPageNav from '@/components/docs/DocsPageNav';
import { H1, H2, P, FeatureCard, PageDescription } from '@/components/docs/DocsPrimitives';

export default function DocsIntroPage() {
  return (
    <>
      <main className="docs-content flex-1 min-w-0 px-6 md:px-12 py-10 pb-24">
        <H1 tag="Start">Welcome to HyperDex</H1>
        <PageDescription>
          Sealed-bid RFQ exchange with fixed-price, non-custodial settlement on Stellar Testnet.
        </PageDescription>

        <P>HyperDex is a <strong>sealed-bid Request-for-Quote (RFQ) decentralised exchange</strong> built on Stellar and Soroban smart contracts. Market makers compete to quote a firm price for the exact size requested; the trade settles atomically at that price or not at all, and HyperDex never takes custody of funds. HyperDex runs on Stellar Testnet and is not yet independently audited.</P>
        <P>HyperDex v3 turns this into an <strong>RFQ liquidity and settlement layer</strong> for stablecoin FX on Stellar: wallet-to-wallet settlement, an on-chain maker registry, and every quote compared with the best SDEX and AMM route. See <Link href="/docs/roadmap" className="underline">v3 &amp; Roadmap</Link>.</P>
        <P>This documentation covers everything you need to understand, use, and build on HyperDex — whether you are a trader making your first swap, a developer integrating the Maker SDK, or a researcher studying the protocol design.</P>

        <H2 id="get-started">Get started</H2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 mb-8">
          <Link href="/docs/first-swap" className="docs-intro-card group border border-black/10 rounded-2xl p-6 bg-white hover:-translate-y-1 hover:shadow-lg hover:border-lavender-mid/40 transition-all duration-200">
            <div className="mb-3">
              <p className="font-display font-bold text-ink text-base">Make Your First Swap</p>
            </div>
            <p className="text-ink-muted text-sm leading-relaxed">Connect a Stellar wallet, enter an amount, wait 30 seconds for the best sealed bid, and sign once. Fixed price — the trade settles at the quoted amount or not at all.</p>
          </Link>

          <Link href="/docs/maker-setup" className="docs-intro-card group border border-black/10 rounded-2xl p-6 bg-white hover:-translate-y-1 hover:shadow-lg hover:border-lavender-mid/40 transition-all duration-200">
            <div className="mb-3">
              <p className="font-display font-bold text-ink text-base">Become a Market Maker</p>
            </div>
            <p className="text-ink-muted text-sm leading-relaxed">Run the Maker SDK, deposit inventory into the vault, and earn the spread on every filled auction. Full control over pricing logic.</p>
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 mb-8">
          <FeatureCard title="For Traders" desc="Connect a Stellar wallet, enter an amount, wait 30 seconds for the best sealed bid, and sign once. Fixed price — the trade settles at the quoted amount or not at all." />
          <FeatureCard title="For Market Makers" desc="Run the Maker SDK, deposit inventory into the vault, and earn the spread on every filled auction. Full control over pricing logic." />
          <FeatureCard title="For Developers" desc="Five open-source Soroban contracts, a WebSocket-driven RFQ backend, and a fully open Maker SDK you can fork and extend." />
        </div>

        <H2 id="go-further">Go further</H2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <Link href="/docs/architecture" className="docs-intro-card group border border-black/10 rounded-2xl p-6 bg-white hover:-translate-y-1 hover:shadow-lg hover:border-lavender-mid/40 transition-all duration-200">
            <div className="mb-3">
              <p className="font-display font-bold text-ink text-base">Architecture</p>
            </div>
            <p className="text-ink-muted text-sm leading-relaxed">Understand the hybrid off-chain/on-chain design and how the five Soroban contracts compose.</p>
          </Link>

          <Link href="/docs/rest-api" className="docs-intro-card group border border-black/10 rounded-2xl p-6 bg-white hover:-translate-y-1 hover:shadow-lg hover:border-lavender-mid/40 transition-all duration-200">
            <div className="mb-3">
              <p className="font-display font-bold text-ink text-base">Build on HyperDex</p>
            </div>
            <p className="text-ink-muted text-sm leading-relaxed">Integrate with the REST API, WebSocket events, and Maker SDK to build custom trading solutions.</p>
          </Link>
        </div>

        <DocsPageNav />
      </main>
      <DocsTableOfContents />
    </>
  );
}
