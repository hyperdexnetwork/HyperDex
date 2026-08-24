import { H1, P, Mono } from '@/components/docs/DocsPrimitives';

export default function RestApiPage() {
  const endpoints = [
    { method:'GET',  path:'/health',                          auth:'—',          desc:'System health. Returns active maker count and DB status.',      body:'', response:'{ "status":"ok", "activeMakers":1, "priceBookEntries":1, "dbStatus":"connected" }' },
    { method:'POST', path:'/api/quote',                       auth:'—',          desc:'Single-shot quote — dispatches an RFQ and returns the best signed quote.', body:'{ "tokenIn":"EURC_SAC", "tokenOut":"USDC_SAC", "amountIn":"200000000", "takerAddress":"GABIR…" }', response:'{ "success":true, "quote":{ "quoteId":"…", "amountOut":"…", "signature":"hex", … } }' },
    { method:'POST', path:'/api/quote/start',                 auth:'—',          desc:'Opens a 30-second sealed-bid auction to all connected makers.', body:'{ "tokenIn":"EURC_SAC", "tokenOut":"USDC_SAC", "amountIn":"200000000", "takerAddress":"GABIR…" }', response:'{ "auctionId":"uuid", "makerCount":2 }' },
    { method:'GET',  path:'/api/quote/result/:auctionId',     auth:'—',          desc:'Poll until the auction window closes; returns the winning quote.', body:'', response:'{ "status":"completed", "bestQuote":{…}, "quotesReceived":2, "makerName":"Alpha MM" }' },
    { method:'POST', path:'/api/quote/confirm',               auth:'—',          desc:'Notify the backend of the on-chain settlement tx hash.',        body:'{ "quoteId":"…", "txHash":"…", "takerAddress":"G…" }', response:'{ "success":true }' },
    { method:'GET',  path:'/api/makers',                      auth:'—',          desc:'Lists all makers with WebSocket connection status.',            body:'', response:'[ { "address":"G…", "name":"Alpha MM", "connectionStatus":"connected", "poolAddress":"C…" } ]' },
    { method:'GET',  path:'/api/makers/:address/inventory',   auth:'—',          desc:'Returns a maker pool’s USDC + EURC balances.',              body:'', response:'{ "usdc":"1000.0000000", "eurc":"500.0000000", "poolAddress":"C…" }' },
    { method:'POST', path:'/api/makers/apply',                auth:'—',          desc:'Submit a maker registration application.',                       body:'{ "stellarAddress":"G…", "name":"My MM", "contactEmail":"…", "supportedPairs":[…] }', response:'{ "applicationId":"uuid", "status":"pending" }' },
    { method:'GET',  path:'/api/admin/pending',               auth:'Admin wallet', desc:'Lists all pending maker applications.',                        body:'', response:'{ "applications":[…], "total":1 }' },
    { method:'POST', path:'/api/admin/pending/:id/approve',   auth:'Admin wallet', desc:'Approves an application and returns a one-time API key.',       body:'', response:'{ "apiKey":"sk_live_xxx" }' },
    { method:'POST', path:'/api/admin/pending/:id/reject',    auth:'Admin wallet', desc:'Rejects a maker application.',                                body:'{ "reason":"Insufficient inventory" }', response:'{ "status":"rejected" }' },
  ];

  return (
    <>
      <H1 tag="API Reference">REST Endpoints</H1>
      <P>The backend exposes a REST API — <Mono>https://hyperdex.onrender.com</Mono> on mainnet, <Mono>https://hyperdex-testnet.onrender.com</Mono> on testnet, or <Mono>http://localhost:4000</Mono> locally. Maker <strong>bids are sent over the WebSocket</strong> (not REST); admin endpoints are gated to the admin wallet. Amounts are in stroops (1 token = 1e7).</P>

      {endpoints.map(ep => (
        <div key={ep.path + ep.method} className="border border-black/10 rounded-2xl overflow-hidden mb-4">
          <div className="flex flex-wrap items-center gap-3 px-5 py-3 bg-cream-dark border-b border-black/8">
            <span className={`text-[11px] font-bold font-mono px-2.5 py-1 rounded-lg ${ep.method==='GET'?'bg-green-100 text-green-700':'bg-blue-100 text-blue-700'}`}>{ep.method}</span>
            <code className="font-mono text-sm text-ink font-semibold">{ep.path}</code>
            {ep.auth !== '—' && <span className="ml-auto text-[11px] text-ink-muted bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">{ep.auth}</span>}
          </div>
          <div className="px-5 py-4">
            <p className="text-sm text-ink-muted mb-3">{ep.desc}</p>
            {ep.body && <><p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1">Request Body</p><pre className="text-xs font-mono text-ink-muted bg-cream rounded-xl px-3 py-2 mb-3 overflow-x-auto">{ep.body}</pre></>}
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1">Response</p>
            <pre className="text-xs font-mono text-ink-muted bg-cream rounded-xl px-3 py-2 overflow-x-auto">{ep.response}</pre>
          </div>
        </div>
      ))}
    </>
  );
}
