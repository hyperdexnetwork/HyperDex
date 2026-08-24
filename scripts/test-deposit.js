#!/usr/bin/env node
/**
 * test-deposit.js — Tests approve + deposit of USDC/EURC to the maker's pool.
 * Run: node scripts/test-deposit.js
 */
const { Contract, TransactionBuilder, Networks, Address, nativeToScVal, scValToNative, Keypair, rpc } =
  require('/home/asus/Project/HyperDex/backend/node_modules/@stellar/stellar-sdk');

const RPC_URL = 'https://soroban-testnet.stellar.org';
const NETWORK = Networks.TESTNET;

const POOL_REGISTRY = 'CAFWHWLA2XJKWVDYYHTXHVWHHEHGLPSSX3IGVJLD5LZ5YCUMOPWONQR2';
const USDC = 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';
const EURC = 'CCUUDM434BMZMYWYDITHFXHDMIVTGGD6T2I5UKNX5BSLXLW7HVR4MCGZ';
const MAKER_ADDRESS = 'GALNCMRJ2GCQ34RH7L55HZLUCZ3EHDIKPWTNTWDGVJ4FJWCP5GDVA726';
// Never hardcode a seed here. This file previously carried a live testnet
// secret in git history — rotate any key that was committed.
const MAKER_SECRET  = process.env.MAKER_SECRET ?? '';
if (!MAKER_SECRET) {
  console.error('Set MAKER_SECRET=S... in the environment before running this script.');
  process.exit(1);
}
const DEPOSIT_AMOUNT = 100n * 10_000_000n; // 100 tokens

const server = new rpc.Server(RPC_URL);

async function step(name, fn) {
  console.log(`\n[${name}]`);
  try { await fn(); } catch(e) { console.error(`  FAILED: ${e.message}`); }
}

async function getPoolAddress() {
  const account = await server.getAccount(MAKER_ADDRESS);
  const registry = new Contract(POOL_REGISTRY);
  const tx = new TransactionBuilder(account, { fee: '100', networkPassphrase: NETWORK })
    .addOperation(registry.call('get_pool_address', new Address(MAKER_ADDRESS).toScVal()))
    .setTimeout(30).build();
  const result = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(result) || !result.result) {
    throw new Error('get_pool_address failed: ' + JSON.stringify(result));
  }
  return scValToNative(result.result.retval);
}

async function checkBalance(contractAddr, ownerAddr, label) {
  const account = await server.getAccount(MAKER_ADDRESS);
  const contract = new Contract(contractAddr);
  const tx = new TransactionBuilder(account, { fee: '100', networkPassphrase: NETWORK })
    .addOperation(contract.call('balance', new Address(ownerAddr).toScVal()))
    .setTimeout(30).build();
  const result = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationSuccess(result) && result.result) {
    const bal = scValToNative(result.result.retval);
    console.log(`  ${label}: ${Number(bal)/1e7} tokens (${bal} stroops)`);
    return bal;
  } else {
    console.error(`  ${label}: balance() simulation failed ->`, JSON.stringify(result).slice(0, 200));
    return 0n;
  }
}

async function checkPoolBalance(poolAddr, tokenAddr, tokenName) {
  const account = await server.getAccount(MAKER_ADDRESS);
  const pool = new Contract(poolAddr);
  const tx = new TransactionBuilder(account, { fee: '100', networkPassphrase: NETWORK })
    .addOperation(pool.call('get_balance', new Address(tokenAddr).toScVal()))
    .setTimeout(30).build();
  const result = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationSuccess(result) && result.result) {
    const bal = scValToNative(result.result.retval);
    console.log(`  Pool ${tokenName}: ${Number(bal)/1e7} (${bal} stroops)`);
    return bal;
  } else {
    console.error(`  Pool get_balance(${tokenName}) FAILED:`, JSON.stringify(result).slice(0, 300));
    return null;
  }
}

async function simulateDeposit(poolAddr, tokenAddr, tokenName) {
  const account = await server.getAccount(MAKER_ADDRESS);
  const pool = new Contract(poolAddr);
  const tx = new TransactionBuilder(account, { fee: '1000000', networkPassphrase: NETWORK })
    .addOperation(pool.call(
      'deposit',
      new Address(tokenAddr).toScVal(),
      nativeToScVal(DEPOSIT_AMOUNT, { type: 'i128' })
    ))
    .setTimeout(30).build();
  console.log(`  Simulating deposit(${tokenName}, 100)...`);
  const result = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationSuccess(result)) {
    console.log(`  ✓ Simulation OK — deposit would succeed`);
    return true;
  } else {
    const errStr = JSON.stringify(result);
    console.error(`  ✗ Simulation FAILED: ${errStr.slice(0, 500)}`);
    return false;
  }
}

async function waitTx(hash) {
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const s = await server.getTransaction(hash);
    if (s.status === rpc.Api.GetTransactionStatus.SUCCESS) return true;
    if (s.status === rpc.Api.GetTransactionStatus.FAILED) {
      const errStr = JSON.stringify(s);
      throw new Error('TX failed on-chain: ' + errStr.slice(0, 400));
    }
    process.stdout.write('.');
  }
  throw new Error('TX timeout');
}

async function doApprove(poolAddr, tokenAddr, tokenName) {
  const keypair = Keypair.fromSecret(MAKER_SECRET);
  const ledger = (await server.getLatestLedger()).sequence;
  const expiry = ledger + 2000;
  const account = await server.getAccount(MAKER_ADDRESS);
  const tokenContract = new Contract(tokenAddr);

  const tx = new TransactionBuilder(account, { fee: '1000000', networkPassphrase: NETWORK })
    .addOperation(tokenContract.call(
      'approve',
      new Address(MAKER_ADDRESS).toScVal(),
      new Address(poolAddr).toScVal(),
      nativeToScVal(DEPOSIT_AMOUNT, { type: 'i128' }),
      nativeToScVal(expiry, { type: 'u32' })
    ))
    .setTimeout(30).build();

  const prepared = await server.prepareTransaction(tx);
  prepared.sign(keypair);
  const resp = await server.sendTransaction(prepared);
  if (resp.status === 'ERROR') throw new Error('Approve send error: ' + JSON.stringify(resp.errorResult));
  console.log(`  Approve TX: ${resp.hash}`);
  await waitTx(resp.hash);
  console.log(`  ✓ Approve confirmed`);
}

async function doDeposit(poolAddr, tokenAddr, tokenName) {
  const keypair = Keypair.fromSecret(MAKER_SECRET);
  const account = await server.getAccount(MAKER_ADDRESS);
  const pool = new Contract(poolAddr);

  const tx = new TransactionBuilder(account, { fee: '1000000', networkPassphrase: NETWORK })
    .addOperation(pool.call(
      'deposit',
      new Address(tokenAddr).toScVal(),
      nativeToScVal(DEPOSIT_AMOUNT, { type: 'i128' })
    ))
    .setTimeout(30).build();

  const prepared = await server.prepareTransaction(tx);
  prepared.sign(keypair);
  const resp = await server.sendTransaction(prepared);
  if (resp.status === 'ERROR') throw new Error('Deposit send error: ' + JSON.stringify(resp.errorResult));
  console.log(`  Deposit TX: ${resp.hash}`);
  await waitTx(resp.hash);
  console.log(`\n  ✓ Deposit CONFIRMED`);
}

(async () => {
  console.log('=== HyperDEX Deposit Test ===');
  console.log(`Maker: ${MAKER_ADDRESS}`);

  let poolAddress = null;

  await step('1. Resolve pool address from registry', async () => {
    poolAddress = await getPoolAddress();
    console.log(`  Pool: ${poolAddress}`);
  });

  if (!poolAddress) { console.error('No pool — abort'); process.exit(1); }

  await step('2. Wallet balances (before)', async () => {
    await checkBalance(USDC, MAKER_ADDRESS, 'Wallet USDC');
    await checkBalance(EURC, MAKER_ADDRESS, 'Wallet EURC');
  });

  await step('3. Pool balances (before)', async () => {
    await checkPoolBalance(poolAddress, USDC, 'USDC');
    await checkPoolBalance(poolAddress, EURC, 'EURC');
  });

  await step('4. Simulate USDC deposit (detect expired storage)', async () => {
    await simulateDeposit(poolAddress, USDC, 'USDC');
  });

  await step('5. Simulate EURC deposit', async () => {
    await simulateDeposit(poolAddress, EURC, 'EURC');
  });

  await step('6. USDC: approve + deposit 100 USDC', async () => {
    await doApprove(poolAddress, USDC, 'USDC');
    await doDeposit(poolAddress, USDC, 'USDC');
  });

  await step('7. Pool balances (after USDC deposit)', async () => {
    await checkPoolBalance(poolAddress, USDC, 'USDC');
    await checkPoolBalance(poolAddress, EURC, 'EURC');
  });

  console.log('\n=== Done ===');
})();
