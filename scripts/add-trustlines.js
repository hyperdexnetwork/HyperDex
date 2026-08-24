/**
 * Add USDC + EURC trustlines to a testnet account.
 *
 * Classic Stellar assets cannot be received without a trustline, so Circle's
 * faucet silently fails against a fresh account. Run this before funding any
 * maker or taker wallet.
 *
 * Usage (from repo root):
 *   node scripts/add-trustlines.js <SECRET_S...>
 */
const path = require('path');
const sdkPath = path.join(__dirname, '../backend/node_modules/@stellar/stellar-sdk');
const { Keypair, TransactionBuilder, Operation, Asset, Networks, Horizon } = require(sdkPath);

// Circle runs SEPARATE testnet issuers per asset — USDC comes from the
// centre.io account and EURC from the circle.com account. Assuming one shared
// issuer produces a trustline the faucet cannot pay into, and transfers simply
// never arrive. Keep these matched to the SAC addresses the contracts are
// initialized with.
const ASSETS = [
  { code: 'USDC', issuer: process.env.USDC_ISSUER || 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5' },
  { code: 'EURC', issuer: process.env.EURC_ISSUER || 'GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO' },
];
const HORIZON = process.env.HORIZON_URL || 'https://horizon-testnet.stellar.org';

const secret = process.argv[2];
if (!secret || !/^S[A-Z2-7]{55}$/.test(secret)) {
  console.error('Usage: node scripts/add-trustlines.js <SECRET_S...>');
  process.exit(1);
}

(async () => {
  const kp = Keypair.fromSecret(secret);
  const server = new Horizon.Server(HORIZON);
  const account = await server.loadAccount(kp.publicKey());

  const assets = ASSETS.map(a => new Asset(a.code, a.issuer));
  const existing = new Set(
    account.balances
      .filter(b => b.asset_code && b.asset_issuer)
      .map(b => `${b.asset_code}:${b.asset_issuer}`)
  );

  const missing = assets.filter(a => !existing.has(`${a.getCode()}:${a.getIssuer()}`));
  if (missing.length === 0) {
    console.log(`${kp.publicKey()}  trustlines already present (USDC, EURC)`);
    return;
  }

  const builder = new TransactionBuilder(account, {
    fee: '100000',
    networkPassphrase: Networks.TESTNET,
  });
  for (const asset of missing) builder.addOperation(Operation.changeTrust({ asset }));

  const tx = builder.setTimeout(60).build();
  tx.sign(kp);
  const res = await server.submitTransaction(tx);
  console.log(`${kp.publicKey()}  added ${missing.map(a => `${a.getCode()}:${a.getIssuer().slice(0, 8)}…`).join(' + ')}  tx=${res.hash}`);
})().catch(e => {
  const codes = e?.response?.data?.extras?.result_codes;
  console.error('FAILED:', codes ? JSON.stringify(codes) : e.message);
  process.exit(1);
});
