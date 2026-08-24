import { H1, P } from '@/components/docs/DocsPrimitives';

export default function TroubleshootPage() {
  const issues = [
    { problem: "Health check shows activeMakers: 0", why: "The Maker SDK is not connected to the backend WebSocket.", fix: "Ensure the SDK is running (npm run dev <name> in maker-sdk/). Check that MAKER_API_KEY and BACKEND_WS_URL in credentials/<name>.cred are correct. Check the SDK terminal for connection error logs." },
    { problem: "\"No bids received\" after the 30-second auction", why: "The maker did not send a bid. Usually the SDK is offline, the pool has zero balance for that token, or the drift guard paused quoting (ghost price >3% from the live oracle mid).", fix: "Check maker-sdk terminal logs. Query the /api/makers/<address>/inventory endpoint and deposit if zero. If drift-paused, press Ctrl+R to re-price." },
    { problem: "Dashboard shows \"SDK Offline\" but the SDK terminal is connected", why: "Idle WebSocket connections drop on hosted backends; the SDK auto-reconnects and the backend now guards the reconnect race so the live socket stays registered.", fix: "Usually self-heals within seconds. If it persists, restart the SDK (Ctrl+C, then npm run dev <name>)." },
    { problem: "Custom --engine did not load", why: "The engine path is wrong or the file does not export getLevels/getQuote.", fix: "Fix the path and keep the -- separator (npm run dev <name> -- --engine=./x.ts). The SDK falls back to the built-in engine and logs why, so check the banner Engine: line." },
    { problem: "\"Your wallet cannot receive EURC yet\" before the auction starts", why: "Stellar will not deliver a classic asset to an account that has not opted in to holding it, and your wallet has no trustline for that asset. HyperDex checks this before opening an auction, so you see it in about two seconds instead of after a 30-second auction and a failed transaction.", fix: "Click Add EURC trustline in the swap card and sign the transaction — it is a one-time approval per asset. You can also add it from the asset list in your wallet, or with node scripts/add-trustlines.js <SECRET> on testnet." },
    { problem: "\"Not enough USDC. This trade needs X…\"", why: "Your wallet holds less of the sell asset than the amount you entered. The pre-flight check compares your on-chain balance against the trade size before contacting any maker.", fix: "Reduce the amount or fund the wallet. The message shows exactly what you hold." },
    { problem: "Wallet shows \"Transaction Failed\"", why: "The quote expired (30-second quote window elapsed) or the pool balance was drained between auction and settlement.", fix: "Accept quotes faster. If pool balance is the issue, deposit more inventory." },
    { problem: "\"<wallet> is on a different network\" banner", why: "The wallet is set to a different Stellar network than the one selected in the HyperDex navbar switcher. Signing on the wrong network is rejected on-chain as txBadAuth.", fix: "Either switch the wallet to the network named in the banner, or use the navbar pill to switch HyperDex to the network the wallet is on. Then reconnect." },
    { problem: "Wallet does not appear in the connect sheet", why: "The extension is not installed, or was installed after the sheet was already open.", fix: "Detection re-runs each time the sheet opens — close and reopen it. Wallets that are not installed still appear with an Install pill that opens the vendor site." },
    { problem: "Connect hangs on \"Connecting…\"", why: "The wallet never answered — a popup was blocked, the extension is locked, or a hardware device is not unlocked.", fix: "The request times out after 90 seconds. Unlock the wallet (or plug in and unlock the Ledger), allow popups for the site, and retry." },
    { problem: "Contracts / balances look wrong after switching networks", why: "A network switch stores the choice and hard-reloads so no component keeps a half-swapped mix of two networks. If the reload was interrupted, stale values can linger.", fix: "Reload the page. Confirm the navbar pill shows the network you expect, and that your wallet matches it." },
    { problem: "Testnet selected but requests fail / no quotes", why: "The testnet backend is a separate instance — by default http://localhost:4000 — and is not running.", fix: "Start the backend with STELLAR_NETWORK=testnet and the testnet contract addresses, then bootstrap a maker with scripts/bootstrap-testnet-maker.sh." },
    { problem: "\"Maker not registered\" error on /maker page", why: "Your wallet address is not in the pool_registry contract.", fix: "Complete the on-chain registration step — paste your signer public key and call register_maker via the /maker UI." },
  ];

  return (
    <>
      <H1 tag="Getting Started">Troubleshooting</H1>
      <P>Common issues and their solutions when setting up or using HyperDex.</P>
      {issues.map(t => (
        <div key={t.problem} className="border border-black/10 rounded-2xl p-5 mb-3 bg-white hover:-translate-y-0.5 transition-transform">
          <p className="font-display font-bold text-ink text-sm mb-1">{t.problem}</p>
          <p className="text-ink-muted text-xs mb-2"><strong>Why:</strong> {t.why}</p>
          <p className="text-ink-muted text-xs"><strong>Fix:</strong> {t.fix}</p>
        </div>
      ))}
    </>
  );
}
