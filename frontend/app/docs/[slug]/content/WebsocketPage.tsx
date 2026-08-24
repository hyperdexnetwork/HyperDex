import { H1, H2, P, Code, Table, Mono, Callout } from '@/components/docs/DocsPrimitives';

export default function WebsocketPage() {
  return (
    <>
      <H1 tag="API Reference">WebSocket Events</H1>
      <P>Makers connect to <Mono>wss://hyperdex.onrender.com/ws/maker</Mono> on mainnet, <Mono>wss://hyperdex-testnet.onrender.com/ws/maker</Mono> on testnet, or <Mono>ws://localhost:4000/ws/maker</Mono> locally, for real-time RFQ delivery. Everything below is handled for you by the <Mono>maker-sdk</Mono> — this page documents the wire protocol for reference.</P>

      <Callout type="info" title="Use the SDK">In practice you never write this by hand. Run <Mono>npm run dev &lt;name&gt;</Mono>; the SDK connects, authenticates, signs, and replies. You only implement a <Mono>MakerEngine</Mono>. See <strong>Pricing Engines</strong>.</Callout>

      <H2 id="connection-auth">Connection &amp; Auth</H2>
      <P>Authentication is done with an <Mono>Authorization: Bearer</Mono> header on the WebSocket upgrade request — there is no separate auth message. A bad key is rejected during the handshake.</P>
      <Code>{`const ws = new WebSocket("wss://hyperdex.onrender.com/ws/maker", {
  headers: { Authorization: "Bearer sk_live_xxx" },
});

ws.onmessage = ({ data }) => {
  const msg = JSON.parse(data);
  switch (msg.type) {
    case "connected": console.log("Connected as", msg.makerName); break;
    case "rfq":       handleRfq(msg); break;
    case "trade":     onTradeConfirmed(msg); break;
    case "ping":      ws.send(JSON.stringify({ type: "pong" })); break;
  }
};`}</Code>

      <H2 id="handling-rfq">Handling an RFQ</H2>
      <P>On an <Mono>rfq</Mono> message, price it, build the quote, sign <Mono>SHA256(XDR(quote))</Mono> with your ed25519 key, and send an <Mono>rfqQuote</Mono> back <strong>over the same socket</strong> (bids are not REST). Send <Mono>rfqError</Mono> to skip.</P>
      <Code>{`function handleRfq(msg) {
  // msg.message: { quoteId, tokenIn, tokenOut, amountIn, takerAddress }
  const amountOut = engine.getQuote(msg.message);        // stroops, or null to skip
  if (!amountOut) {
    ws.send(JSON.stringify({ type: "rfqError",
      message: { quoteId: msg.message.quoteId, reason: "no_inventory" } }));
    return;
  }
  const quote     = buildQuote({ ...msg.message, amountOut });
  const signature = signQuote(quote);                    // SHA256(XDR(quote)) + ed25519
  ws.send(JSON.stringify({ type: "rfqQuote",
    message: { quoteId: msg.message.quoteId, quote, signature } }));
}`}</Code>

      <H2 id="message-types">Message Types</H2>
      <Table
        headers={['Type', 'Direction', 'Description']}
        rows={[
          ['connected', 'Server → Maker', 'Handshake accepted; includes makerName'],
          ['error', 'Server → Maker', 'Auth or protocol error; includes a reason'],
          ['rfq', 'Server → Maker', 'New RFQ — { quoteId, tokenIn, tokenOut, amountIn, takerAddress }'],
          ['rfqQuote', 'Maker → Server', 'Signed sealed bid — { quoteId, quote, signature }'],
          ['rfqError', 'Maker → Server', 'Skip this RFQ — { quoteId, reason: "no_inventory" | "rate_limit" }'],
          ['priceLevels', 'Maker → Server', 'Resting book update (streamed ~every 3s) — { tokenIn, tokenOut, levels[] }'],
          ['trade', 'Server → Maker', 'A won quote settled on-chain — { tradeEventId, txHash, amountIn, amountOut }'],
          ['tradeAck', 'Maker → Server', 'Acknowledge receipt of a trade event — { tradeEventId }'],
          ['ping / pong', 'Server ↔ Maker', 'Keepalive every 30s — respond to ping with pong or the connection drops'],
        ]}
      />
    </>
  );
}
