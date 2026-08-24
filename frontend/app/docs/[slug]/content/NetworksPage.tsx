import { H1, H2, H3, P, Ul, Li, Table, Callout, Code, Mono } from '@/components/docs/DocsPrimitives';

export default function NetworksPage() {
  return (
    <>
      <H1 tag="Getting Started">Mainnet &amp; Testnet</H1>
      <P>HyperDex ships both Stellar networks in a single build. A switcher in the navbar picks one at runtime — no separate deployment, no rebuild.</P>

      <H2 id="how-it-works">How the switcher works</H2>
      <P>Both network configurations — contract addresses, RPC endpoint, Horizon endpoint, backend origin and explorer base — are compiled into the bundle. The one in effect is resolved at module load from <Mono>localStorage[&quot;hyperdex.network&quot;]</Mono>, falling back to the build-time default when a visitor has never chosen.</P>
      <Ul>
        <Li>Click the <strong>Mainnet / Testnet</strong> pill next to <strong>Connect Wallet</strong></Li>
        <Li>Pick a network — the choice is stored and the page <strong>hard-reloads</strong></Li>
        <Li>Set your wallet to the matching network, then reconnect</Li>
      </Ul>

      <Callout type="info" title="Why a full reload">Contract addresses, the RPC URL and the backend origin are read at module scope across the app. Reloading is the only way to guarantee no component is left holding a half-swapped mix of two networks. The reload drops the wallet session, which is why the switcher asks for a second click first.</Callout>

      <H2 id="differences">What differs per network</H2>
      <Table
        headers={['', 'Mainnet', 'Testnet']}
        rows={[
          ['Passphrase', 'Public Global Stellar Network ; September 2015', 'Test SDF Network ; September 2015'],
          ['Soroban RPC', 'https://mainnet.sorobanrpc.com', 'https://soroban-testnet.stellar.org'],
          ['Horizon', 'https://horizon.stellar.org', 'https://horizon-testnet.stellar.org'],
          ['Backend', 'https://hyperdex.onrender.com', 'http://localhost:4000'],
          ['Explorer', 'stellar.expert/explorer/public', 'stellar.expert/explorer/testnet'],
          ['Funds', 'Real — irreversible', 'Test funds — free from Friendbot'],
        ]}
      />

      <H2 id="backend-routing">Backend routing</H2>
      <P>The backend is <strong>single-network per instance</strong> — it reads one <Mono>STELLAR_NETWORK</Mono> from its environment and derives the passphrase from it. Running both networks therefore means running two backend instances.</P>
      <P>Because Next.js route handlers execute on the server, they cannot see the visitor&apos;s <Mono>localStorage</Mono> choice. Every browser call to an internal <Mono>/api/*</Mono> route is tagged with a header, and the handler maps it to the matching backend origin:</P>
      <Code>{`// browser
fetch('/api/maker-application', {
  headers: networkHeaders({ 'Content-Type': 'application/json' }),
  // -> x-hyperdex-network: testnet
});

// server route handler
const backendUrl = backendUrlFromRequest(req);
// -> NETWORKS['testnet'].backendUrl`}</Code>

      <Callout type="info" title="Unknown header falls back">An absent or unrecognised <Mono>x-hyperdex-network</Mono> resolves to the default network rather than guessing — a stale client can never be routed somewhere arbitrary.</Callout>

      <H2 id="wrong-network">Wrong-network detection</H2>
      <P>After connecting, HyperDex compares the wallet&apos;s reported network passphrase with the selected network. On a mismatch a banner names the connected wallet and the network it should be on, and signing is blocked before the wallet is ever opened.</P>
      <P>Wallets that do not expose a network (hardware devices, some bridges) return <Mono>null</Mono> and are allowed through — the check runs again at signing time. This matters: a signature produced against the wrong passphrase is rejected on-chain as <Mono>txBadAuth</Mono>, <em>after</em> the user has already approved it.</P>

      <H2 id="env-vars">Environment variables</H2>
      <P>Each network has its own prefix. Un-suffixed legacy variables are kept as a fallback for whichever network <Mono>NEXT_PUBLIC_STELLAR_NETWORK</Mono> names, so an existing single-network deployment keeps working untouched.</P>
      <Code>{`# Network a first-time visitor sees
NEXT_PUBLIC_DEFAULT_NETWORK=mainnet

# Mainnet
NEXT_PUBLIC_MAINNET_STELLAR_RPC_URL=https://mainnet.sorobanrpc.com
NEXT_PUBLIC_MAINNET_HORIZON_URL=https://horizon.stellar.org
NEXT_PUBLIC_MAINNET_BACKEND_URL=https://hyperdex.onrender.com
NEXT_PUBLIC_MAINNET_POOL_REGISTRY_CONTRACT=...
NEXT_PUBLIC_MAINNET_QUOTE_VERIFIER_CONTRACT=...
NEXT_PUBLIC_MAINNET_MAKER_POOL_FACTORY_ADDRESS=...
NEXT_PUBLIC_MAINNET_FEE_DISTRIBUTOR_CONTRACT=...
NEXT_PUBLIC_MAINNET_USDC_CONTRACT=...
NEXT_PUBLIC_MAINNET_EURC_CONTRACT=...
NEXT_PUBLIC_MAINNET_ADMIN_ADDRESS=...

# Testnet — same keys, TESTNET_ prefix
NEXT_PUBLIC_TESTNET_STELLAR_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_TESTNET_HORIZON_URL=https://horizon-testnet.stellar.org
NEXT_PUBLIC_TESTNET_BACKEND_URL=http://localhost:4000
# ...same contract keys with TESTNET_`}</Code>

      <Callout type="warn" title="Do not refactor into a dynamic lookup">Next.js only inlines statically analysable <Mono>process.env.NEXT_PUBLIC_X</Mono> expressions. Every variable is spelled out literally in <Mono>lib/networks.ts</Mono>; a <Mono>process.env[key]</Mono> lookup resolves to <Mono>undefined</Mono> in the browser.</Callout>

      <H3 id="testnet-funds">Getting testnet funds</H3>
      <P>Fund an account with XLM from Friendbot, then add trustlines and acquire Circle&apos;s testnet USDC/EURC. Note the two assets have <strong>different testnet issuers</strong> — USDC is issued by <Mono>GBBD47IF…</Mono> (centre.io) and EURC by <Mono>GB3Q6QDZ…</Mono> (circle.com).</P>
      <Code>{`# Fund a testnet account
curl "https://friendbot.stellar.org/?addr=<YOUR_G_ADDRESS>"

# Or via the CLI
stellar keys generate my-taker --network testnet --fund`}</Code>

      <H2 id="local-testnet">Running the testnet stack locally</H2>
      <Code>{`# 1. Backend pointed at testnet (backend/.env)
STELLAR_NETWORK=testnet
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
HORIZON_URL=https://horizon-testnet.stellar.org
# ...testnet contract addresses

cd backend && npm run dev      # -> port 4000

# 2. Bootstrap a maker end-to-end (apply, approve, signer key, deploy pool)
bash scripts/bootstrap-testnet-maker.sh
# -> writes maker-sdk/.env with the API key, signer seed and pool address

# 3. Start the maker, then the frontend
cd maker-sdk && npm run dev
cd frontend  && npm run dev    # -> http://localhost:3000`}</Code>

      <Callout type="tip" title="Rebuildable from scratch">The bootstrap script is non-interactive and idempotent — if the pool already exists it reads it back from the factory and re-syncs the registry signer key, so the testnet environment can be torn down and rebuilt at any time.</Callout>
    </>
  );
}
