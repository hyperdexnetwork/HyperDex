/**
 * Build and SIMULATE execute_quote against the deployed quote_verifier.
 *
 * Simulation runs the real contract in the real ledger state, so it exercises
 * token whitelist, expiry, replay, taker auth, the registry lookup and the
 * ed25519 check — everything settlement does — without submitting. Whatever
 * error comes back tells you exactly which step a real swap would stop at.
 *
 * Usage (from repo root):
 *   node scripts/simulate-settlement.js '<quote-json>'
 */
const path = require('path');
const sdkPath = path.join(__dirname, '../backend/node_modules/@stellar/stellar-sdk');
const { Contract, TransactionBuilder, xdr, Address, nativeToScVal, rpc, Networks } = require(sdkPath);

const RPC = process.env.STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org';
const VERIFIER = process.env.QUOTE_VERIFIER;
const q = JSON.parse(process.argv[2]);

function quoteScVal(q) {
  const e = (k, v) => new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(k), val: v });
  return xdr.ScVal.scvMap([
    e('amount_in',  nativeToScVal(BigInt(q.amountIn),  { type: 'i128' })),
    e('amount_out', nativeToScVal(BigInt(q.amountOut), { type: 'i128' })),
    e('expiry',     nativeToScVal(BigInt(q.expiryTimestamp), { type: 'u64' })),
    e('maker',      new Address(q.makerAddress).toScVal()),
    e('quote_id',   xdr.ScVal.scvBytes(Buffer.from(q.quoteId, 'hex'))),
    e('salt',       xdr.ScVal.scvBytes(Buffer.from(q.salt, 'hex'))),
    e('taker',      new Address(q.takerAddress).toScVal()),
    e('token_in',   new Address(q.tokenIn).toScVal()),
    e('token_out',  new Address(q.tokenOut).toScVal()),
  ]);
}

(async () => {
  const server = new rpc.Server(RPC);
  const account = await server.getAccount(q.takerAddress);
  const op = new Contract(VERIFIER).call(
    'execute_quote',
    quoteScVal(q),
    xdr.ScVal.scvBytes(Buffer.from(q.signature, 'hex')),
  );
  const tx = new TransactionBuilder(account, { fee: '1000000', networkPassphrase: Networks.TESTNET })
    .addOperation(op).setTimeout(60).build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    console.log('SIMULATION FAILED');
    console.log(sim.error);
  } else {
    console.log('SIMULATION OK — settlement would succeed.');
    console.log('  min resource fee:', sim.minResourceFee);
    console.log('  auth entries required:', (sim.result?.auth ?? []).length);
  }
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
