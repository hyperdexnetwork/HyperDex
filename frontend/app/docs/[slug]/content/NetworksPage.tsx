import { H1, H2, H3, P, Ul, Li, Table, Callout, Code, Mono } from '@/components/docs/DocsPrimitives';

export default function NetworksPage() {
  return (
    <>
      <H1 tag="Getting Started">Network: Stellar Testnet</H1>
      <P>HyperDex runs on <strong>Stellar Testnet only</strong>. All swaps, maker pools and quotes use free test funds from Friendbot. Nothing on HyperDex moves real money.</P>

      <Callout type="info" title="Maker onboarding is open in beta on testnet">Every onboarding step runs end to end against the deployed testnet contracts — application, API key, <Mono>deploy_pool</Mono>, inventory deposit and a live quoting session. Backend: <Mono>https://backend-production-c4e14cb9.up.railway.app</Mono>. See <strong>Maker Registration</strong> to start.</Callout>

      <H2 id="network-details">Network details</H2>
      <Table
        headers={['', 'Testnet']}
        rows={[
          ['Passphrase', 'Test SDF Network ; September 2015'],
          ['Soroban RPC', 'https://soroban-testnet.stellar.org'],
          ['Horizon', 'https://horizon-testnet.stellar.org'],
          ['Backend', 'https://backend-production-c4e14cb9.up.railway.app'],
          ['Explorer', 'stellar.expert/explorer/testnet'],
          ['Funds', 'Test funds — free from Friendbot'],
        ]}
      />

      <H2 id="wrong-network">Wrong-network detection</H2>
      <P>After connecting, HyperDex compares the wallet&apos;s reported network passphrase with Stellar Testnet. On a mismatch a banner names the connected wallet and that it should be on Testnet, and signing is blocked before the wallet is ever opened.</P>
      <P>Wallets that do not expose a network (hardware devices, some bridges) return <Mono>null</Mono> and are allowed through — the check runs again at signing time. This matters: a signature produced against the wrong passphrase is rejected on-chain as <Mono>txBadAuth</Mono>, <em>after</em> the user has already approved it.</P>

      <H2 id="env-vars">Environment variables</H2>
      <P>The frontend reads <Mono>NEXT_PUBLIC_TESTNET_*</Mono> variables first and falls back to the un-prefixed ones.</P>
      <Code>{`NEXT_PUBLIC_TESTNET_STELLAR_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_TESTNET_HORIZON_URL=https://horizon-testnet.stellar.org
NEXT_PUBLIC_TESTNET_BACKEND_URL=https://backend-production-c4e14cb9.up.railway.app
NEXT_PUBLIC_TESTNET_POOL_REGISTRY_CONTRACT=...
NEXT_PUBLIC_TESTNET_QUOTE_VERIFIER_CONTRACT=...
NEXT_PUBLIC_TESTNET_MAKER_POOL_FACTORY_ADDRESS=...
NEXT_PUBLIC_TESTNET_FEE_DISTRIBUTOR_CONTRACT=...
NEXT_PUBLIC_TESTNET_USDC_CONTRACT=...
NEXT_PUBLIC_TESTNET_EURC_CONTRACT=...
NEXT_PUBLIC_TESTNET_ADMIN_ADDRESS=...`}</Code>

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
