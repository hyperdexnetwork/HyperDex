/**
 * Send a classic asset between two testnet accounts.
 * Usage: node scripts/send-asset.js <fromSecret> <toAddress> <CODE> <issuer> <amount>
 */
const path = require('path');
const sdkPath = path.join(__dirname, '../backend/node_modules/@stellar/stellar-sdk');
const { Keypair, TransactionBuilder, Operation, Asset, Networks, Horizon } = require(sdkPath);

const [secret, to, code, issuer, amount] = process.argv.slice(2);
const server = new Horizon.Server('https://horizon-testnet.stellar.org');

(async () => {
  const kp = Keypair.fromSecret(secret);
  const acct = await server.loadAccount(kp.publicKey());
  const tx = new TransactionBuilder(acct, { fee: '100000', networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.payment({ destination: to, asset: new Asset(code, issuer), amount }))
    .setTimeout(60).build();
  tx.sign(kp);
  const res = await server.submitTransaction(tx);
  console.log(`  sent ${amount} ${code} -> ${to.slice(0,8)}…  tx=${res.hash.slice(0,16)}…`);
})().catch(e => {
  console.error('FAILED:', JSON.stringify(e?.response?.data?.extras?.result_codes ?? e.message));
  process.exit(1);
});
