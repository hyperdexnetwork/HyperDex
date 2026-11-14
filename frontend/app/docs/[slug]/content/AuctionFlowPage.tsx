import { H1, P, Code, Callout } from '@/components/docs/DocsPrimitives';

export default function AuctionFlowPage() {
  return (
    <>
      <H1 tag="Protocol Spec">Auction Flow</H1>
      <Callout type="info" title="Changing in v3">In v3, quotes are collected within about 0.5–2 seconds instead of a 30-second window. See <strong>v3 &amp; Roadmap</strong>.</Callout>
      <P>The full lifecycle of a HyperDex auction, from taker request to on-chain settlement:</P>
      <Code>{`Taker                   Backend                  Maker SDK             Soroban
  │                        │                           │                      │
  │──POST /auctions/start─▶│                           │                      │
  │◀─{ auctionId }─────────│                           │                      │
  │                        │──WS: rfq_request──────────▶                      │
  │                        │   { auctionId, tokenIn,   │                      │
  │                        │     tokenOut, amountIn,   │                      │
  │                        │     taker, expiry }        │                      │
  │                        │                           │─ price swap           │
  │                        │                           │─ build Quote struct   │
  │                        │                           │─ sign SHA256(XDR)     │
  │                        │◀──POST /auctions/:id/bid──│                      │
  │                        │   { quote, signature }    │                      │
  │     ... 30 seconds ... │                           │                      │
  │──GET /auctions/:id/result▶                         │                      │
  │◀─{ bestQuote, sig }────│                           │                      │
  │                        │                           │                      │
  │── sign tx in Freighter │                           │                      │
  │──────────────────────────────────────────────────────▶execute_quote()    │
  │                        │                           │  ├─ verify ed25519   │
  │                        │                           │  ├─ check expiry     │
  │                        │                           │  ├─ maker_pool.swap()     │
  │                        │                           │  └─ fee_distributor  │
  │◀──────────────────────────────────────────────────────tx confirmed ~5s────│`}</Code>
    </>
  );
}
