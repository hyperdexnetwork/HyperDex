import Link from 'next/link';
import { H1, H2, P, FeatureCard } from '@/components/docs/DocsPrimitives';

export default function MissionPage() {
  return (
    <>
      <H1 tag="Start">Our Mission</H1>
      <P>
        A business converting a known amount of USDC to EURC needs to know the exact amount it will receive before it
        commits. Stellar&apos;s on-chain liquidity (the SDEX order book, path payments and AMMs) gives a route{' '}
        <em>estimate</em> that can change with trade size and between quoting and execution. A request-for-quote gives a{' '}
        <strong>firm, maker-signed price for that exact size</strong>, which is how FX is quoted between businesses
        off-chain.
      </P>
      <P>
        HyperDex is built on one idea: <em>price discovery and settlement are separate problems</em>. Price discovery is
        best done off-chain by competing professional makers. Settlement is best done on-chain, atomically, by a contract
        that enforces exactly what both sides signed.
      </P>
      <P>
        Our goal is to become the <strong>RFQ liquidity and settlement layer for stablecoin FX on Stellar</strong>: a new
        liquidity source that wallets, payment platforms and aggregators can route to, with every quote measured against
        the best SDEX and AMM route. See <Link href="/docs/roadmap" className="underline">v3 &amp; Roadmap</Link> for how
        we get there.
      </P>

      <H2 id="core-principles">Core Principles</H2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
        <FeatureCard title="Firm Price" desc="The contract settles at the signed amounts or reverts. The price does not move with trade size after signing." />
        <FeatureCard title="Measured, Not Claimed" desc="From v3, every quote is shown next to the best SDEX and AMM route for the same size, net of fees." />
        <FeatureCard title="Non-Custodial" desc="Your keys stay in your own wallet. HyperDex holds no signing keys and never holds user funds." />
      </div>
    </>
  );
}
