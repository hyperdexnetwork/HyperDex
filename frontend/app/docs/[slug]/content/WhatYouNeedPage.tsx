import { H1, H2, P, Ul, Li, Code, Callout, Mono } from '@/components/docs/DocsPrimitives';

export default function WhatYouNeedPage() {
  return (
    <>
      <H1 tag="Getting Started">What You Need to Trade</H1>
      <P>Trading on HyperDex requires three things: a Stellar wallet, test tokens, and a funded XLM balance for transaction fees.</P>

      <H2 id="install-freighter">1. Install Freighter</H2>
      <P>Freighter is the official Stellar browser wallet and the only wallet HyperDex currently supports. It is a browser extension (Chrome / Brave / Firefox).</P>
      <Ul>
        <Li>Download from <strong>freighter.app</strong> and install the extension</Li>
        <Li>Create or import a wallet and <strong>set network to Testnet</strong> (Settings → Network → Testnet)</Li>
        <Li>Keep your seed phrase safe — HyperDex never has access to it</Li>
      </Ul>
      <Callout type="info" title="Testnet only — test funds">HyperDex runs on Stellar Testnet. Fund your account for free with Friendbot; nothing here moves real money.</Callout>

      <H2 id="get-xlm">2. Get XLM for Fees</H2>
      <P>Every Stellar transaction requires a small XLM fee (typically 0.00001 XLM). Buy XLM on an exchange (e.g. Coinbase, Kraken) and withdraw it to your Freighter address on the Stellar network. A few XLM is plenty for fees and trustline reserves.</P>

      <H2 id="get-stablecoins">3. Get USDC / EURC</H2>
      <P>HyperDex swaps USDC ↔ EURC — both are Circle-issued stablecoins on Stellar. Fund your wallet with either:</P>
      <Ul>
        <Li>Buy native Stellar <strong>USDC</strong> on an exchange that supports it (e.g. Coinbase) and withdraw to your Stellar address</Li>
        <Li>Or acquire it on the Stellar DEX via a path payment (XLM → USDC, then USDC → EURC) from a wallet like StellarX or Lobstr</Li>
        <Li>Add a <strong>trustline</strong> for each asset in Freighter before receiving it (0.5 XLM reserve each)</Li>
      </Ul>

      <H2 id="run-services">4. Run Services (for local testing)</H2>
      <Code>{`# Terminal 1 — Backend API + WS hub
cd backend && npm run dev
# → HyperDEX Backend running on port 4000

# Terminal 2 — Maker SDK (provides liquidity)
# after \`npm run setup\` creates credentials/<name>.cred:
cd maker-sdk && npm run dev <name>
# → set a ghost price when prompted (or --engine=./x.ts for a custom engine)
# → [WS] Connected to HyperDEX backend

# Terminal 3 — Frontend
cd frontend && npm run dev
# → Ready on http://localhost:3000

# Verify all systems are live:
curl http://localhost:4000/health
# → { "status": "ok", "activeMakers": 1, "dbStatus": "connected" }`}</Code>
      <Callout type="tip" title="activeMakers must be 1">If the health check returns <Mono>activeMakers: 0</Mono>, the Maker SDK is not connected. Check Terminal 2 logs for connection errors.</Callout>
    </>
  );
}
