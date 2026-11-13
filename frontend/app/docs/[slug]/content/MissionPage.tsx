import { H1, H2, P, FeatureCard } from '@/components/docs/DocsPrimitives';

export default function MissionPage() {
  return (
    <>
      <H1 tag="Start">Our Mission</H1>
      <P>DeFi swaps today suffer from three fundamental problems: <strong>slippage</strong> (AMMs move price against you as you trade), <strong>MEV</strong> (bots front-run your transaction in the mempool), and <strong>custody risk</strong> (bridges and wrapped assets introduce failure points).</P>
      <P>HyperDex solves all three with one insight: <em>price discovery and price settlement are separate problems</em>. Price discovery is better done off-chain by competing professionals. Settlement is better done on-chain by a trustless contract.</P>
      <P>Our mission is to bring the execution quality of institutional trading desks to every on-chain trader — starting with Stellar stablecoins, expanding to every liquid asset on Soroban.</P>

      <H2 id="core-principles">Core Principles</H2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
        <FeatureCard title="Fixed Price" desc="The contract settles at the signed amounts or reverts. No price impact from trade size." />
        <FeatureCard title="Taker-Bound Quotes" desc="Each signed quote names one taker, so nobody else can execute it, and the price is fixed before the transaction is submitted." />
        <FeatureCard title="Self-Custody" desc="Your keys never leave Freighter. Funds are only moved at the moment of atomic on-chain settlement." />
      </div>
    </>
  );
}
