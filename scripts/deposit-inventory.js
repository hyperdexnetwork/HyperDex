#!/usr/bin/env node
/**
 * Deposit USDC / EURC from the maker's wallet into their maker_pool.
 *
 * `maker_pool.deposit()` requires the maker's own signature, and it does two
 * things that a plain token transfer does not: it moves the tokens AND credits
 * the pool's internal accounting. `get_balance()` — the number the RFQ backing
 * check reads when deciding whether a bid can be honoured — reports only that
 * internal figure. Sending tokens straight to the pool contract address raises
 * its token balance and credits nothing, leaving the funds unusable and
 * unwithdrawable. Always deposit through here (or the /maker Inventory tab).
 *
 * The secret is read from the environment and never written anywhere.
 *
 *   MAKER_SECRET=S... node scripts/deposit-inventory.js --usdc=50 --eurc=20
 *   MAKER_SECRET=S... node scripts/deposit-inventory.js --eurc=20 --dry-run
 *
 * Env overrides (all default to the deployed testnet values):
 *   STELLAR_RPC_URL · NETWORK_PASSPHRASE · POOL_REGISTRY · USDC · EURC
 */

'use strict';

const path = require('path');

// The SDK lives in a workspace package, not at the repo root.
function loadSdk() {
  const candidates = [
    path.join(__dirname, '..', 'backend', 'node_modules', '@stellar', 'stellar-sdk'),
    path.join(__dirname, '..', 'maker-sdk', 'node_modules', '@stellar', 'stellar-sdk'),
    '@stellar/stellar-sdk',
  ];
  for (const c of candidates) {
    try { return require(c); } catch { /* try next */ }
  }
  throw new Error('Could not resolve @stellar/stellar-sdk — run npm install in backend/ or maker-sdk/');
}

const { Contract, TransactionBuilder, Networks, Address, nativeToScVal, scValToNative, Keypair, rpc } = loadSdk();

const RPC_URL       = process.env.STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org';
const PASSPHRASE    = process.env.NETWORK_PASSPHRASE || Networks.TESTNET;
const POOL_REGISTRY = process.env.POOL_REGISTRY || 'CA4VDATAXPCSAJSDSTEZSCLVLIWMT6PYS5WJYITBQZWZ6JAFNP3Q5HNW';
const TOKENS = {
  USDC: process.env.USDC || 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
  EURC: process.env.EURC || 'CCUUDM434BMZMYWYDITHFXHDMIVTGGD6T2I5UKNX5BSLXLW7HVR4MCGZ',
};

const STROOPS = 10_000_000n;
const argOf = name => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : null;
};
const DRY_RUN = process.argv.includes('--dry-run');

/** "12.5" -> 125000000n. Parsed as a decimal string so no float rounding creeps in. */
function toStroops(human) {
  if (!/^\d+(\.\d{1,7})?$/.test(human)) {
    throw new Error(`Invalid amount "${human}" — use up to 7 decimal places, e.g. 12.5`);
  }
  const [whole, frac = ''] = human.split('.');
  return BigInt(whole) * STROOPS + BigInt(frac.padEnd(7, '0'));
}

const server = new rpc.Server(RPC_URL);

async function simulate(source, contractId, method, ...args) {
  const account = await server.getAccount(source);
  const tx = new TransactionBuilder(account, { fee: '100', networkPassphrase: PASSPHRASE })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) {
    throw new Error(`${method} simulation failed: ${JSON.stringify(sim.error ?? sim)}`);
  }
  return scValToNative(sim.result.retval);
}

async function deposit(keypair, poolId, tokenId, amount, label) {
  const source = await server.getAccount(keypair.publicKey());
  const tx = new TransactionBuilder(source, { fee: '1000000', networkPassphrase: PASSPHRASE })
    .addOperation(
      new Contract(poolId).call(
        'deposit',
        new Address(keypair.publicKey()).toScVal(),
        new Address(tokenId).toScVal(),
        nativeToScVal(amount, { type: 'i128' }),
      ),
    )
    .setTimeout(60)
    .build();

  // prepareTransaction runs the simulation and folds the resulting auth entries
  // and footprint back into the transaction; signing before this would sign a
  // transaction that the network then rejects as incomplete.
  const prepared = await server.prepareTransaction(tx);
  prepared.sign(keypair);

  const sent = await server.sendTransaction(prepared);
  if (sent.status === 'ERROR') {
    throw new Error(`submit rejected: ${JSON.stringify(sent.errorResult ?? sent)}`);
  }
  process.stdout.write(`  ${label}: submitted ${sent.hash} `);

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const got = await server.getTransaction(sent.hash);
    if (got.status === 'SUCCESS') { console.log('-> SUCCESS'); return sent.hash; }
    if (got.status === 'FAILED') { console.log('-> FAILED'); throw new Error(JSON.stringify(got)); }
    process.stdout.write('.');
  }
  throw new Error('timed out waiting for confirmation');
}

async function main() {
  const secret = process.env.MAKER_SECRET;
  if (!secret) {
    console.error('Set MAKER_SECRET=S... in the environment. It is never written to disk or logged.');
    process.exit(1);
  }

  let keypair;
  try { keypair = Keypair.fromSecret(secret.trim()); }
  catch { console.error('MAKER_SECRET is not a valid Stellar secret seed (should start with S).'); process.exit(1); }

  const wants = [];
  for (const sym of ['usdc', 'eurc']) {
    const v = argOf(sym);
    if (v) wants.push([sym.toUpperCase(), toStroops(v)]);
  }
  if (!wants.length) {
    console.error('Nothing to do. Pass --usdc=<amount> and/or --eurc=<amount>.');
    process.exit(1);
  }

  const maker = keypair.publicKey();
  console.log(`Maker:   ${maker}`);
  console.log(`RPC:     ${RPC_URL}`);

  const pool = await simulate(maker, POOL_REGISTRY, 'get_pool_address', new Address(maker).toScVal());
  if (!pool) throw new Error('No pool registered for this maker on this network.');
  console.log(`Pool:    ${pool}\n`);

  console.log('Pool balances before (internal accounting):');
  for (const [sym] of wants) {
    const bal = await simulate(maker, pool, 'get_balance', new Address(TOKENS[sym]).toScVal());
    console.log(`  ${sym}: ${Number(bal) / 1e7}`);
  }

  if (DRY_RUN) {
    console.log('\n--dry-run: stopping before submission. Would deposit:');
    for (const [sym, amt] of wants) console.log(`  ${sym}: ${Number(amt) / 1e7}`);
    return;
  }

  console.log('\nDepositing:');
  for (const [sym, amt] of wants) {
    await deposit(keypair, pool, TOKENS[sym], amt, `${sym} ${Number(amt) / 1e7}`);
  }

  console.log('\nPool balances after:');
  for (const [sym] of wants) {
    const bal = await simulate(maker, pool, 'get_balance', new Address(TOKENS[sym]).toScVal());
    console.log(`  ${sym}: ${Number(bal) / 1e7}`);
  }
}

main().catch(err => {
  console.error('\nFailed:', err.message);
  process.exit(1);
});
