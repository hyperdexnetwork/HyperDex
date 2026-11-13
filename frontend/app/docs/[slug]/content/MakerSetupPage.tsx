import { H1, H2, H3, P, Code, Mono, Callout } from '@/components/docs/DocsPrimitives';

export default function MakerSetupPage() {
  return (
    <>
      <H1 tag="Getting Started">Setting Up as a Market Maker</H1>
      <P>Becoming a HyperDex market maker requires both an on-chain registration (so the smart contract recognises your signing key) and an off-chain registration (so the backend lets you into the WebSocket auction feed). The <Mono>maker-sdk</Mono> handles all the infrastructure — you only decide how to price.</P>

      <H2 id="why-register">Why do I need to register?</H2>
      <P>Only makers approved by the HyperDex backend (with an issued API key) can submit bids. This approval is enforced off-chain today; on-chain, <Mono>deploy_pool</Mono> registers any maker. The backend also checks that a bidding maker holds inventory in its own pool, though a maker can still withdraw before the taker settles, in which case the trade reverts.</P>

      <H3 id="step-1-apply">Step 1 — Apply on the dashboard</H3>
      <P>Open <strong>/maker</strong>, connect your maker wallet in Freighter, and submit the application form (name + contact). This creates a pending application the admin reviews.</P>

      <H3 id="step-2-approval">Step 2 — Admin approval &amp; API key</H3>
      <P>An admin approves your application at <strong>/admin</strong> and issues an <Mono>sk_live_...</Mono> API key. This key authenticates your Maker SDK WebSocket connection and is shown once — copy it.</P>

      <H3 id="step-3-setup">Step 3 — Run the setup wizard</H3>
      <P>In <Mono>maker-sdk/</Mono>, run the wizard. It verifies your API key, generates an ed25519 signing keypair (a <strong>hot key</strong>, separate from your funds wallet), and saves everything to <Mono>credentials/&lt;yourname&gt;.cred</Mono> (file perms 600 — git-ignored, never commit it).</P>
      <Code>{`cd maker-sdk
npm install
npm run setup
# → enter your sk_live_... API key
# → prints your SIGNER PUBLIC KEY (64 hex) — copy it
# → saved: credentials/<yourname>.cred`}</Code>

      <H3 id="step-4-onchain">Step 4 — On-chain registration via the frontend</H3>
      <P>Back on <strong>/maker</strong>, paste the signer public key from Step 3 and click <strong>Register On-Chain</strong>. Freighter signs one transaction that calls <Mono>pool_registry.register_maker()</Mono> and the factory deploys your personal <Mono>maker_pool</Mono>. Then deposit USDC/EURC inventory from the Inventory tab.</P>

      <H3 id="step-5-run-sdk">Step 5 — Run the Maker SDK</H3>
      <Code>{`# Built-in ghost-price engine (prompts you for a ghost price on start)
npm run dev <yourname>

# ...or run your own pricing engine — NOTE the \`--\` separator (npm strips a bare flag)
npm run dev <yourname> -- --engine=./examples/binance-engine.ts

# Skip the prompt in CI:
GHOST_PRICE=0.8788 npm run dev <yourname>
# → LIVE banner (Maker / Address / Pool / Backend / Engine), then [WS] Connected`}</Code>
      <Callout type="tip" title="Pluggable pricing">The SDK does the WebSocket, auth, ed25519 signing, inventory reads and trade confirmations. Pricing lives in a <strong>MakerEngine</strong>: use the built-in ghost-price engine or ship your own. See <strong>Pricing Engines</strong> in the sidebar.</Callout>

      <H2 id="ghost-price">The built-in ghost-price engine</H2>
      <P>With no <Mono>--engine</Mono> flag, the SDK runs the default engine. You set one <strong>ghost price</strong> — the EURC you offer per 1 USDC — and it auto-bids that rate, fee-adjusted, on every RFQ. It is gated by an <strong>inventory check</strong> (never quotes more than ~80% of your pool balance) and a <strong>drift guard</strong> that warns when your ghost price is &gt;1% from the live oracle mid and <strong>pauses quoting at &gt;3%</strong> so you don&apos;t get arbitraged. Press <Mono>Ctrl+R</Mono> to re-price, <Mono>Ctrl+C</Mono> to disconnect.</P>
    </>
  );
}
