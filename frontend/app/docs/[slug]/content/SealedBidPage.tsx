import { H1, H2, P, Table } from '@/components/docs/DocsPrimitives';

export default function SealedBidPage() {
  return (
    <>
      <H1 tag="Concepts">Sealed-Bid Auction</H1>
      <P>HyperDex uses a <strong>first-price sealed-bid auction</strong>. Every maker submits their best price in secret during a 30-second window. No maker can see what others have bid. The taker sees only the single best result after the window closes.</P>

      <H2 id="why-sealed">Why sealed bids?</H2>
      <P>Open auctions (where makers can see each other&apos;s bids) degenerate into minimal-increment games — makers undercut each other by fractions of a basis point rather than competing on true value. Sealed bids force each maker to bid their genuine best price, producing better outcomes for takers.</P>

      <H2 id="why-30-seconds">Why 30 seconds?</H2>
      <P>30 seconds is long enough for makers to consult external market data and calculate a confident price, but short enough that the quote does not become stale relative to market movements. Each signed quote carries its own on-chain expiry (120 seconds after signing by default in the maker SDK), which leaves time for the 10-second accept window and for signing and submitting the transaction.</P>

      <H2 id="auction-states">Auction states</H2>
      <Table
        headers={['State', 'Duration', 'What happens']}
        rows={[
          ['collecting', '30 seconds', 'Backend sends the RFQ to the top-ranked makers (capped by RFQ_MAX_MAKERS) via WS; makers submit sealed bids'],
          ['completed', '10 seconds', 'Best bid revealed to taker; taker decides to accept or reject'],
          ['executing', 'Instant', 'Taker signs in Freighter; transaction submitted to Stellar'],
          ['confirming', '~5 seconds', 'Waiting for Stellar ledger confirmation'],
          ['success', 'Terminal', 'Trade settled; tokens in taker wallet'],
          ['no_quotes', 'Terminal', 'Zero bids received; taker can retry'],
          ['rejected', 'Terminal', 'Taker declined the quote; no funds moved'],
        ]}
      />
    </>
  );
}
