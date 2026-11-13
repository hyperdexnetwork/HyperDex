import { H1, P } from '@/components/docs/DocsPrimitives';

export default function FaqPage() {
  const faqs = [
    { q: 'Why sealed-bid instead of open auction?', a: 'Open auctions degenerate into minimal-increment games where makers undercut each other by fractions of a basis point. Sealed bids force each maker to submit their genuine best price, leading to better outcomes for takers.' },
    { q: 'What happens if no makers respond to an auction?', a: 'After 30 seconds with zero bids the auction ends in a "no_quotes" state. The taker is informed and can retry immediately. This is rare when makers are online and have pool inventory.' },
    { q: 'Can a quote be used more than once?', a: 'No. The quote_verifier stores a spent-quote ledger set. Once quote_id is recorded as settled, any resubmission is rejected — even if the signature is valid.' },
    { q: "What if a maker runs out of inventory mid-auction?", a: "The built-in engine checks the pool balance before bidding and won't submit a bid it can't fill (a custom engine should do the same). If balance drops between bid and settlement, the Soroban maker_pool.execute_swap() call fails and reverts the transaction." },
    { q: 'Can the admin steal funds from a maker pool?', a: 'No. The admin has no function in the maker_pool contract. Admin privileges are limited to: deactivating makers in pool_registry, adjusting fee_bps in quote_verifier, and withdrawing accumulated fees from fee_distributor.' },
    { q: 'How is the exchange rate calculated?', a: 'Entirely by the market maker. HyperDex imposes no on-chain pricing model. Each maker uses their own oracle data, inventory position, and risk parameters. Competition between makers ensures the best rate wins.' },
    { q: 'What are the protocol fees?', a: '10 basis points (0.10%) deducted from amount_out. On a 100 EURC → USDC swap at rate 1.09, the taker receives 108.891 USDC (109 × 0.999).' },
    { q: 'Is HyperDex open source?', a: 'Yes. Smart contracts, Maker SDK, and backend are open source. See the GitHub repository linked in the footer.' },
    { q: 'Is HyperDex live on mainnet?', a: 'No. HyperDex runs on Stellar Testnet only, with free test funds. An earlier mainnet deployment is deprecated and unsupported. Mainnet returns only after an independent security audit.' },
  ];

  return (
    <>
      <H1 tag="Reference">FAQ</H1>
      <P>Frequently asked questions about HyperDex protocol, trading, and development.</P>
      {faqs.map(item => (
        <div key={item.q} className="border-b border-black/8 py-5 last:border-0">
          <p className="font-display font-semibold text-ink mb-2">{item.q}</p>
          <p className="text-ink-muted text-sm leading-relaxed">{item.a}</p>
        </div>
      ))}
    </>
  );
}
