/**
 * Drive a full taker swap against the local stack, exactly as the frontend does:
 * request an RFQ quote, build execute_quote, simulate, sign as the taker,
 * submit, then report the trade back to the backend.
 *
 * Usage (from repo root):
 *   node scripts/execute-swap.js <tokenIn> <tokenOut> <amountInStroops> <takerSecret>
 */
const path = require('path');
const sdkPath = path.join(__dirname, '../backend/node_modules/@stellar/stellar-sdk');
const {
  Contract, TransactionBuilder, xdr, Address, nativeToScVal, rpc, Networks, Keypair,
} = require(sdkPath);

const RPC = process.env.STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org';
const BACKEND = process.env.BACKEND_URL || 'http://localhost:4000';
const VERIFIER = process.env.QUOTE_VERIFIER;

const [tokenIn, tokenOut, amountIn, takerSecret] = process.argv.slice(2);
if (!tokenIn || !tokenOut || !amountIn || !takerSecret) {
  console.error('Usage: node scripts/execute-swap.js <tokenIn> <tokenOut> <amountInStroops> <takerSecret>');
  process.exit(1);
}
if (!VERIFIER) { console.error('QUOTE_VERIFIER env var is required'); process.exit(1); }

const kp = Keypair.fromSecret(takerSecret);
const taker = kp.publicKey();

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

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // ── 1. RFQ ────────────────────────────────────────────────────────────────
  console.log('[1] Requesting quote…');
  const res = await fetch(`${BACKEND}/api/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tokenIn, tokenOut, amountIn, takerAddress: taker }),
  });
  const body = await res.json();
  if (!body.success) throw new Error('quote failed: ' + JSON.stringify(body));
  const q = body.quote;
  console.log(`    maker=${q.makerName}  in=${q.amountIn}  out=${q.amountOut}  rate=${q.rate}`);

  // ── 2. Build + simulate ───────────────────────────────────────────────────
  console.log('[2] Building execute_quote…');
  const server = new rpc.Server(RPC);
  const account = await server.getAccount(taker);
  const op = new Contract(VERIFIER).call(
    'execute_quote', quoteScVal(q), xdr.ScVal.scvBytes(Buffer.from(q.signature, 'hex')),
  );
  const tx = new TransactionBuilder(account, { fee: '2000000', networkPassphrase: Networks.TESTNET })
    .addOperation(op).setTimeout(120).build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error('simulation failed: ' + sim.error);
  console.log(`    simulated OK  minResourceFee=${sim.minResourceFee}`);

  // ── 3. Sign as taker + submit ─────────────────────────────────────────────
  console.log('[3] Signing as taker and submitting…');
  const prepared = rpc.assembleTransaction(tx, sim).build();
  prepared.sign(kp);
  const sent = await server.sendTransaction(prepared);
  if (sent.status === 'ERROR') throw new Error('submit rejected: ' + JSON.stringify(sent.errorResult));
  console.log(`    tx hash: ${sent.hash}`);

  // ── 4. Await inclusion ────────────────────────────────────────────────────
  let got;
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    got = await server.getTransaction(sent.hash);
    if (got.status !== 'NOT_FOUND') break;
  }
  console.log(`[4] Ledger status: ${got.status}`);
  if (got.status !== 'SUCCESS') {
    console.log(JSON.stringify(got.resultXdr ?? got, null, 1).slice(0, 1500));
    process.exit(1);
  }

  // ── 5. Report back to the backend ─────────────────────────────────────────
  const conf = await fetch(`${BACKEND}/api/quote/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quoteId: q.quoteId, txHash: sent.hash, takerAddress: taker }),
  });
  console.log(`[5] Backend confirm: HTTP ${conf.status}`);

  // Persist the settled quote so replay protection can be probed against a
  // quote that genuinely has been used.
  if (process.env.QUOTE_OUT) {
    require('fs').writeFileSync(process.env.QUOTE_OUT, JSON.stringify(q));
    console.log(`    settled quote saved to ${process.env.QUOTE_OUT}`);
  }
  console.log(`\nSWAP SETTLED  ${sent.hash}`);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
