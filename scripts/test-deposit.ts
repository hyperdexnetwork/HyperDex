#!/usr/bin/env node
/**
 * test-deposit.ts
 * Tests approve + deposit of USDC and EURC directly to the maker's pool contract.
 * Run: cd /home/asus/Project/HyperDex && npx ts-node --project backend/tsconfig.json scripts/test-deposit.ts
 */
import * as StellarSdk from '@stellar/stellar-sdk';

const RPC_URL = 'https://soroban-testnet.stellar.org';
const NETWORK = StellarSdk.Networks.TESTNET;

// Current addresses from .env.local
const POOL_REGISTRY = 'CAFWHWLA2XJKWVDYYHTXHVWHHEHGLPSSX3IGVJLD5LZ5YCUMOPWONQR2';
const USDC = 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';
const EURC = 'CCUUDM434BMZMYWYDITHFXHDMIVTGGD6T2I5UKNX5BSLXLW7HVR4MCGZ';

// mm1 maker
const MAKER_ADDRESS = 'GALNCMRJ2GCQ34RH7L55HZLUCZ3EHDIKPWTNTWDGVJ4FJWCP5GDVA726';
// Never hardcode a seed here. This file previously carried a live testnet
// secret in git history — rotate any key that was committed.
const MAKER_SECRET  = process.env.MAKER_SECRET ?? '';
if (!MAKER_SECRET) {
  console.error('Set MAKER_SECRET=S... in the environment before running this script.');
  process.exit(1);
}

const DEPOSIT_AMOUNT = 100n * 10_000_000n; // 100 tokens in stroops

const server = new StellarSdk.rpc.Server(RPC_URL);

async function log(label: string, fn: () => Promise<void>) {
  process.stdout.write(`\n[${label}]\n`);
  try {
    await fn();
  } catch (e: unknown) {
    console.error(`  FAILED: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function getLatestLedger(): Promise<number> {
  const r = await server.getLatestLedger();
  return r.sequence;
}

async function getPoolAddress(): Promise<string | null> {
  const account = await server.getAccount(MAKER_ADDRESS).catch(() => null);
  if (!account) { console.error('  Maker account not found on testnet'); return null; }

  const registry = new StellarSdk.Contract(POOL_REGISTRY);
  const tx = new StellarSdk.TransactionBuilder(account, { fee: '100', networkPassphrase: NETWORK })
    .addOperation(registry.call('get_pool_address', new StellarSdk.Address(MAKER_ADDRESS).toScVal()))
    .setTimeout(30)
    .build();

  const result = await server.simulateTransaction(tx);
  if (!StellarSdk.rpc.Api.isSimulationSuccess(result) || !result.result) {
    console.error('  get_pool_address failed:', JSON.stringify(result));
    return null;
  }
  return StellarSdk.scValToNative(result.result.retval) as string;
}

async function simulateDeposit(poolAddress: string, token: string, tokenName: string) {
  const account = await server.getAccount(MAKER_ADDRESS);
  const pool = new StellarSdk.Contract(poolAddress);

  const tx = new StellarSdk.TransactionBuilder(account, { fee: '1000000', networkPassphrase: NETWORK })
    .addOperation(pool.call(
      'deposit',
      new StellarSdk.Address(token).toScVal(),
      StellarSdk.nativeToScVal(DEPOSIT_AMOUNT, { type: 'i128' })
    ))
    .setTimeout(30)
    .build();

  console.log(`  Simulating deposit(${tokenName}, ${DEPOSIT_AMOUNT}n stroops = ${Number(DEPOSIT_AMOUNT)/1e7} ${tokenName})...`);
  const result = await server.simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationSuccess(result)) {
    console.log(`  ✓ Simulation SUCCESS (deposit would work)`);
    return true;
  } else {
    console.error(`  ✗ Simulation FAILED: ${JSON.stringify(result)}`);
    return false;
  }
}

async function doApproveAndDeposit(poolAddress: string, token: string, tokenName: string) {
  const keypair = StellarSdk.Keypair.fromSecret(MAKER_SECRET);
  const ledger = await getLatestLedger();
  const expiryLedger = ledger + 2000;

  // --- Step 1: Approve ---
  console.log(`\n  Step 1/2: Approve ${tokenName} → pool (${DEPOSIT_AMOUNT} stroops, expiry ledger ${expiryLedger})`);
  {
    const account = await server.getAccount(MAKER_ADDRESS);
    const tokenContract = new StellarSdk.Contract(token);
    const tx = new StellarSdk.TransactionBuilder(account, { fee: '1000000', networkPassphrase: NETWORK })
      .addOperation(tokenContract.call(
        'approve',
        new StellarSdk.Address(MAKER_ADDRESS).toScVal(),
        new StellarSdk.Address(poolAddress).toScVal(),
        StellarSdk.nativeToScVal(DEPOSIT_AMOUNT, { type: 'i128' }),
        StellarSdk.nativeToScVal(expiryLedger, { type: 'u32' })
      ))
      .setTimeout(30)
      .build();

    const prepared = await server.prepareTransaction(tx);
    prepared.sign(keypair);
    const response = await server.sendTransaction(prepared);
    if (response.status === 'ERROR') throw new Error(`Approve TX error: ${JSON.stringify(response.errorResult)}`);
    console.log(`  Approve TX submitted: ${response.hash}`);

    // Wait for confirmation
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const s = await server.getTransaction(response.hash);
      if (s.status === StellarSdk.rpc.Api.GetTransactionStatus.SUCCESS) {
        console.log(`  ✓ Approve confirmed`);
        break;
      }
      if (s.status === StellarSdk.rpc.Api.GetTransactionStatus.FAILED) {
        throw new Error(`Approve TX FAILED on-chain`);
      }
      process.stdout.write('.');
    }
  }

  // --- Step 2: Deposit ---
  console.log(`\n  Step 2/2: Deposit ${tokenName} to pool`);
  {
    const account = await server.getAccount(MAKER_ADDRESS);
    const pool = new StellarSdk.Contract(poolAddress);
    const tx = new StellarSdk.TransactionBuilder(account, { fee: '1000000', networkPassphrase: NETWORK })
      .addOperation(pool.call(
        'deposit',
        new StellarSdk.Address(token).toScVal(),
        StellarSdk.nativeToScVal(DEPOSIT_AMOUNT, { type: 'i128' })
      ))
      .setTimeout(30)
      .build();

    const prepared = await server.prepareTransaction(tx);
    prepared.sign(keypair);
    const response = await server.sendTransaction(prepared);
    if (response.status === 'ERROR') throw new Error(`Deposit TX error: ${JSON.stringify(response.errorResult)}`);
    console.log(`  Deposit TX submitted: ${response.hash}`);

    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const s = await server.getTransaction(response.hash);
      if (s.status === StellarSdk.rpc.Api.GetTransactionStatus.SUCCESS) {
        console.log(`  ✓ Deposit CONFIRMED`);
        return;
      }
      if (s.status === StellarSdk.rpc.Api.GetTransactionStatus.FAILED) {
        throw new Error(`Deposit TX FAILED on-chain`);
      }
      process.stdout.write('.');
    }
    throw new Error('Deposit TX timeout');
  }
}

async function checkPoolBalance(poolAddress: string) {
  const account = await server.getAccount(MAKER_ADDRESS);
  const pool = new StellarSdk.Contract(poolAddress);

  for (const [name, addr] of [['USDC', USDC], ['EURC', EURC]]) {
    const tx = new StellarSdk.TransactionBuilder(account, { fee: '100', networkPassphrase: NETWORK })
      .addOperation(pool.call('get_balance', new StellarSdk.Address(addr).toScVal()))
      .setTimeout(30)
      .build();
    const result = await server.simulateTransaction(tx);
    if (StellarSdk.rpc.Api.isSimulationSuccess(result) && result.result) {
      const bal = StellarSdk.scValToNative(result.result.retval) as bigint;
      console.log(`  Pool ${name} balance: ${Number(bal)/1e7} ${name} (${bal} stroops)`);
    } else {
      console.error(`  get_balance(${name}) failed:`, JSON.stringify(result));
    }
  }
}

async function checkWalletBalance(tokenAddr: string, tokenName: string) {
  const account = await server.getAccount(MAKER_ADDRESS);
  const token = new StellarSdk.Contract(tokenAddr);
  const tx = new StellarSdk.TransactionBuilder(account, { fee: '100', networkPassphrase: NETWORK })
    .addOperation(token.call('balance', new StellarSdk.Address(MAKER_ADDRESS).toScVal()))
    .setTimeout(30)
    .build();
  const result = await server.simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationSuccess(result) && result.result) {
    const bal = StellarSdk.scValToNative(result.result.retval) as bigint;
    console.log(`  Wallet ${tokenName}: ${Number(bal)/1e7} ${tokenName} (${bal} stroops)`);
  } else {
    console.error(`  balance(${tokenName}) failed`);
  }
}

// Main
(async () => {
  console.log('=== HyperDEX Deposit Test ===');
  console.log(`Maker: ${MAKER_ADDRESS}`);

  let poolAddress: string | null = null;

  await log('1. Get pool address from registry', async () => {
    poolAddress = await getPoolAddress();
    if (poolAddress) {
      console.log(`  ✓ Pool address: ${poolAddress}`);
    } else {
      console.error('  ✗ Pool not found in registry');
    }
  });

  if (!poolAddress) {
    console.error('\nNo pool found — cannot continue deposit test');
    process.exit(1);
  }

  await log('2. Check wallet balances (before)', async () => {
    await checkWalletBalance(USDC, 'USDC');
    await checkWalletBalance(EURC, 'EURC');
  });

  await log('3. Check pool balances (before)', async () => {
    await checkPoolBalance(poolAddress!);
  });

  await log('4. Simulate USDC deposit (dry-run — detect if storage expired)', async () => {
    await simulateDeposit(poolAddress!, USDC, 'USDC');
  });

  await log('5. Simulate EURC deposit (dry-run)', async () => {
    await simulateDeposit(poolAddress!, EURC, 'EURC');
  });

  await log('6. Execute USDC approve + deposit', async () => {
    await doApproveAndDeposit(poolAddress!, USDC, 'USDC');
  });

  await log('7. Check pool balances (after USDC deposit)', async () => {
    await checkPoolBalance(poolAddress!);
  });

  console.log('\n=== Test complete ===');
})();
