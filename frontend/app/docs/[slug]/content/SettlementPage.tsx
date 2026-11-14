import { H1, P, Mono, Callout } from '@/components/docs/DocsPrimitives';

export default function SettlementPage() {
  const steps = [
    { n: '1', title: 'Signature verification', desc: "Retrieve the maker's registered signing key from pool_registry. Compute SHA256(XDR(quote)). Verify the ed25519 signature against this hash. Reject if invalid." },
    { n: '2', title: 'Maker is active', desc: 'Check pool_registry that the maker is not deactivated. Reject if maker is suspended or unregistered.' },
    { n: '3', title: 'Quote not expired', desc: 'Compare quote.expiry against the current ledger timestamp. Reject if expired.' },
    { n: '4', title: 'Taker authorised', desc: 'quote.taker.require_auth() — only the taker named in the quote can authorise its execution. Quotes are non-transferable.' },
    { n: '5', title: 'Quote ID not replayed', desc: 'Check a spent-quote ledger set. Reject if quote_id has already been used. Each quote can only settle once.' },
    { n: '6', title: 'Execute pool swap', desc: "Call the maker's maker_pool.execute_swap(quote): move amount_in from taker to the pool, move amount_out from the pool to taker." },
    { n: '7', title: 'Pay fee', desc: 'fee_amount = amount_out × fee_bps / 10000. The pool sends amount_out − fee_amount to the taker and transfers fee_amount of token_out directly to fee_distributor.' },
  ];

  return (
    <>
      <H1 tag="Protocol Spec">Settlement Logic</H1>
      <Callout type="info" title="Changing in v3">In v3, settlement moves to hyperdex_settlement: both parties authorise the exact terms, the on-chain registry checks the maker, pair, limits and pauses, and funds move wallet to wallet. See <strong>v3 &amp; Roadmap</strong>.</Callout>
      <P>On-chain settlement is handled exclusively by the <Mono>quote_verifier</Mono> contract. It performs the following checks in order — any failure reverts the entire transaction:</P>

      <div className="space-y-3 mt-4">
        {steps.map(s => (
          <div key={s.n} className="flex gap-4 border border-black/10 rounded-xl p-4 bg-white text-sm hover:-translate-y-0.5 transition-transform">
            <span className="font-display font-bold text-lavender-deep w-5 shrink-0">{s.n}</span>
            <div><span className="font-semibold text-ink">{s.title}: </span><span className="text-ink-muted">{s.desc}</span></div>
          </div>
        ))}
      </div>
    </>
  );
}
