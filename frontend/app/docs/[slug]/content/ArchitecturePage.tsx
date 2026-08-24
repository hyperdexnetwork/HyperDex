import { H1, H2, P, Table, Mono } from '@/components/docs/DocsPrimitives';
import ArchitectureFlow from '@/components/docs/ArchitectureFlow';

export default function ArchitecturePage() {
  return (
    <>
      <H1 tag="Start">Architecture</H1>
      <P>HyperDex is a <strong>hybrid off-chain/on-chain system</strong>. The division of responsibilities is strict: everything that can be done off-chain is done off-chain (pricing, competition, selection), and everything that must be trustless is done on-chain (signature verification, atomic token transfer, fee collection).</P>

      <ArchitectureFlow />

      <H2 id="why-this-split">Why this split?</H2>
      <P>Putting pricing on-chain would mean every price update costs gas and is publicly visible — giving arbitrageurs a free look at market intent. Keeping pricing off-chain means makers can react to real-world market conditions in milliseconds, with no gas cost, while the on-chain layer only sees the final signed commitment.</P>
      <P>The on-chain contracts do exactly one thing: <strong>verify that a registered maker cryptographically committed to a price, then atomically execute it</strong>. There is no room for manipulation between the quote and the settlement.</P>

      <H2 id="component-summary">Component Summary</H2>
      <Table
        headers={['Component', 'Location', 'Why it exists']}
        rows={[
          ['Backend', 'Off-chain server', 'Coordinates the auction: broadcasts RFQs to makers, collects bids, selects best, serves result to frontend'],
          ['Maker SDK', 'Off-chain (each maker)', 'Prices swaps using oracle data, signs quotes with ed25519, submits bids to backend'],
          ['Frontend', 'Browser', 'Taker UI — connects any Stellar wallet via Wallets Kit, starts auctions, shows results, submits the signed quote on-chain'],
          ['pool_registry', 'Soroban contract', 'Stores which addresses are registered makers and what their hot signing keys are'],
          ['quote_verifier', 'Soroban contract', 'Taker calls this — verifies ed25519 signature, checks expiry, calls the maker_pool and fee_distributor'],
          ['maker_pool', 'Soroban contract (one per maker)', 'Custodies that maker’s token inventory; executes the atomic token swap on instruction from quote_verifier'],
          ['maker_pool_factory', 'Soroban contract', 'Deploys a dedicated maker_pool per maker at registration (deterministic salt)'],
          ['fee_distributor', 'Soroban contract', 'Accumulates protocol fees per token; admin-controlled withdrawal to treasury'],
        ]}
      />
    </>
  );
}
