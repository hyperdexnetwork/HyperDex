#!/usr/bin/env npx ts-node
/**
 * HyperDex Smoke Test — full E2E flow (no browser required)
 *
 * Tests:
 *  1. Backend health
 *  2. Maker application → admin approval → API key generation
 *  3. Signer key registration
 *  4. Maker status & pool endpoint
 *  5. WebSocket connect + price levels
 *  6. RFQ quote request
 *  7. Trade record created
 *
 * Run from repo root: npx ts-node scripts/smoke-test.ts
 */

import axios from 'axios';
import WebSocket from 'ws';
import crypto from 'crypto';
import nacl from 'tweetnacl';
import mongoose from 'mongoose';

const BASE = process.env.BACKEND_URL ?? 'http://localhost:4000';
const WS_URL = BASE.replace('http', 'ws') + '/ws/maker';
const MONGO_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/hyperdex';
const MONGO_DB = 'hyperdex';

const USDC = 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';
const EURC = 'CCUUDM434BMZMYWYDITHFXHDMIVTGGD6T2I5UKNX5BSLXLW7HVR4MCGZ';

// Use mm1 address as test maker, user1 as taker
const TEST_MAKER_ADDRESS = 'GALNCMRJ2GCQ34RH7L55HZLUCZ3EHDIKPWTNTWDGVJ4FJWCP5GDVA726';
const TEST_TAKER_ADDRESS = 'GBZKYPAK56QGFGSP6NKDLNUNC5CQ3R2HKRXLGHJFSIH236NZ6XRCWB6A';

// Connect Mongoose for DB assertions
await mongoose.connect(MONGO_URI, { dbName: MONGO_DB });

let pass = 0;
let fail = 0;

function ok(label: string, detail?: string) {
  console.log(`  ✓ ${label}${detail ? '  · ' + detail : ''}`);
  pass++;
}

function err(label: string, detail?: string) {
  console.error(`  ✗ ${label}${detail ? '  · ' + detail : ''}`);
  fail++;
}

async function step(name: string, fn: () => Promise<void>) {
  process.stdout.write(`\n[${name}]\n`);
  try {
    await fn();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    err('Unexpected error', msg);
  }
}

// ── 1. Backend health ─────────────────────────────────────────────────────────
await step('1. Health check', async () => {
  const r = await axios.get(`${BASE}/health`);
  if (r.data.status === 'ok') ok('Backend is healthy');
  else err('Health check failed', JSON.stringify(r.data));
});

// ── 2. Maker application flow ─────────────────────────────────────────────────
let apiKey = '';
let makerId = '';

await step('2. Application → approve → API key', async () => {
  // Apply
  const applyRes = await axios.post(`${BASE}/api/makers/apply`, {
    stellarAddress: TEST_MAKER_ADDRESS,
    name: 'SmokeTest Maker',
    contactEmail: 'smoke@test.local',
    requestedPairs: [{ tokenIn: USDC, tokenOut: EURC }],
  }).catch(e => e.response);

  if ([200, 201, 409].includes(applyRes?.status)) {
    ok('Apply submitted (or already exists)', `status=${applyRes.status}`);
  } else {
    err('Apply failed', JSON.stringify(applyRes?.data));
    return;
  }

  // Admin approve via admin route
  const db = mongoose.connection.db!;
  const pending = await db.collection('pendingmakers').findOne({ stellarAddress: TEST_MAKER_ADDRESS });
  if (!pending) { err('No pending application found'); return; }

  await db.collection('pendingmakers').updateOne(
    { stellarAddress: TEST_MAKER_ADDRESS },
    { $set: { status: 'approved' } }
  );

  // Register via POST /api/makers/register (admin internal — creates Maker + ApiKey)
  const seed = crypto.randomBytes(32);
  const kp = nacl.sign.keyPair.fromSeed(seed);
  const signerPublicKey = Buffer.from(kp.publicKey).toString('hex');

  const regRes = await axios.post(`${BASE}/api/makers/register`, {
    stellarAddress: TEST_MAKER_ADDRESS,
    name: 'SmokeTest Maker',
    signerPublicKey,
    supportedPairs: [{ tokenIn: USDC, tokenOut: EURC }],
  }).catch(e => e.response);

  if (regRes?.status === 201) {
    apiKey = regRes.data.apiKey;
    makerId = regRes.data.makerId;
    ok('Registered + API key issued', `key=${apiKey.slice(0, 16)}…`);
  } else if (regRes?.status === 409) {
    // Already registered — fetch the key from DB
    const makerDoc = await db.collection('makers').findOne({ stellarAddress: TEST_MAKER_ADDRESS });
    if (!makerDoc) { err('Maker not in DB'); return; }
    makerId = makerDoc._id.toString();
    const keyDoc = await db.collection('apikeys').findOne({ makerId: makerDoc._id });
    if (!keyDoc) { err('API key not in DB'); return; }
    // Can't recover plaintext key from hash — re-register will fail; use a fresh one
    ok('Already registered (re-using existing maker)', `makerId=${makerId}`);

    // Re-insert fresh API key for this test run
    const rawKey = `sk_live_${crypto.randomBytes(32).toString('hex')}`;
    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.hash(rawKey, 10);
    await db.collection('apikeys').updateOne(
      { makerId: makerDoc._id },
      { $set: { keyHash: hash, lastUsedAt: null } }
    );
    apiKey = rawKey;
    ok('Fresh API key injected for test', `key=${rawKey.slice(0, 16)}…`);

    // Ensure signerPublicKey is set
    await db.collection('makers').updateOne(
      { _id: makerDoc._id },
      { $set: { signerPublicKey, active: true } }
    );
    ok('Signer key set for test');
  } else {
    err('Register failed', JSON.stringify(regRes?.data));
  }
});

// ── 3. Verify API key endpoint ────────────────────────────────────────────────
await step('3. Verify API key', async () => {
  if (!apiKey) { err('No API key to test'); return; }
  const r = await axios.post(`${BASE}/api/makers/verify-key`, { apiKey });
  if (r.data.success) ok('Key verified', `maker=${r.data.maker?.name}`);
  else err('Key verification failed', JSON.stringify(r.data));
});

// ── 4. Signer key registration ────────────────────────────────────────────────
await step('4. Register signer key via API', async () => {
  if (!apiKey) { err('No API key'); return; }
  const seed2 = crypto.randomBytes(32);
  const kp2 = nacl.sign.keyPair.fromSeed(seed2);
  const signerKey2 = Buffer.from(kp2.publicKey).toString('hex');

  const r = await axios.post(
    `${BASE}/api/makers/register-signer-key`,
    { signerPublicKey: signerKey2 },
    { headers: { Authorization: `Bearer ${apiKey}` } }
  ).catch(e => e.response);

  if (r?.status === 200) ok('Signer key registered', signerKey2.slice(0, 16) + '…');
  else err('Signer key registration failed', JSON.stringify(r?.data));
});

// ── 5. Maker status endpoint ──────────────────────────────────────────────────
await step('5. Maker status endpoint', async () => {
  const r = await axios.get(`${BASE}/api/makers/${TEST_MAKER_ADDRESS}/status`).catch(e => e.response);
  if (r?.status === 200) ok('Status OK', `connected=${r.data.isConnected}`);
  else err('Status failed', JSON.stringify(r?.data));
});

// ── 6. Pool endpoint ──────────────────────────────────────────────────────────
await step('6. Pool endpoint', async () => {
  const r = await axios.get(`${BASE}/api/makers/${TEST_MAKER_ADDRESS}/pool`).catch(e => e.response);
  if (r?.status === 200) {
    ok('Pool endpoint OK', `deployed=${r.data.poolDeployed}, addr=${r.data.poolAddress ?? 'none'}`);
  } else {
    err('Pool endpoint failed', JSON.stringify(r?.data));
  }
});

// ── 7. WebSocket + price levels → RFQ ────────────────────────────────────────
await step('7. WebSocket connect + price levels + RFQ', async () => {
  if (!apiKey) { err('No API key for WS test'); return; }

  // Build a fresh keypair for signing
  const seed = crypto.randomBytes(32);
  const kp = nacl.sign.keyPair.fromSeed(seed);
  const signerPublicKey = Buffer.from(kp.publicKey).toString('hex');

  // Update maker's signer key in DB to match this keypair
  const db = mongoose.connection.db!;
  await db.collection('makers').updateOne(
    { stellarAddress: TEST_MAKER_ADDRESS },
    { $set: { signerPublicKey, active: true } }
  );

  await new Promise<void>((resolve) => {
    const ws = new WebSocket(WS_URL, { headers: { 'x-api-key': apiKey } });
    let quoteRequested = false;
    let quoteReceived = false;

    const timeout = setTimeout(() => {
      if (!quoteReceived) err('WS/RFQ timeout after 12s');
      ws.close();
      resolve();
    }, 12000);

    ws.on('open', () => {
      ok('WebSocket connected');

      // Send price levels
      const msg = JSON.stringify({
        type: 'priceLevels',
        message: {
          tokenIn: USDC,
          tokenOut: EURC,
          buyLevels: [
            { quantity: '1000000000', price: '0.9250' },
            { quantity: '5000000000', price: '0.9200' },
          ],
          sellLevels: [
            { quantity: '1000000000', price: '0.9240' },
            { quantity: '5000000000', price: '0.9190' },
          ],
        },
      });
      ws.send(msg);
      ok('Price levels sent');

      // Give backend time to register levels, then request RFQ
      setTimeout(async () => {
        if (quoteRequested) return;
        quoteRequested = true;
        try {
          const rfqRes = await axios.post(`${BASE}/api/quote`, {
            takerAddress: TEST_TAKER_ADDRESS,
            tokenIn: USDC,
            tokenOut: EURC,
            amountIn: '100000000', // 10 USDC in stroops
          });
          ok('RFQ quote returned', `amountOut=${rfqRes.data.amountOut}, rate=${rfqRes.data.rate}`);
          quoteReceived = true;
          clearTimeout(timeout);
          ws.close();
          resolve();
        } catch (e: unknown) {
          const msg = axios.isAxiosError(e) ? JSON.stringify(e.response?.data) : String(e);
          err('RFQ failed', msg);
          clearTimeout(timeout);
          ws.close();
          resolve();
        }
      }, 2000);
    });

    ws.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'rfq') {
          // Respond with a signed quote
          const { rfqId, takerAddress, tokenIn, tokenOut, amountIn, feesBps } = msg.message;
          const amountOut = Math.floor(Number(amountIn) * 0.924 * (1 - (feesBps ?? 10) * 0.0001));
          const expiry = Math.floor(Date.now() / 1000) + 60;
          const quoteId = crypto.randomBytes(32).toString('hex');
          const salt = crypto.randomBytes(32).toString('hex');

          // Build quote hash matching Rust's XDR encoding
          const { xdr, nativeToScVal } = require('@stellar/stellar-sdk');
          const { sha256 } = require('js-sha256');

          const entry = (key: string, val: unknown) =>
            new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(key), val });

          const quoteScVal = xdr.ScVal.scvMap([
            entry('amount_in', nativeToScVal(BigInt(amountIn), { type: 'i128' })),
            entry('amount_out', nativeToScVal(BigInt(amountOut), { type: 'i128' })),
            entry('expiry', nativeToScVal(BigInt(expiry), { type: 'u64' })),
            entry('maker', nativeToScVal(TEST_MAKER_ADDRESS, { type: 'address' })),
            entry('quote_id', xdr.ScVal.scvBytes(Buffer.from(quoteId, 'hex'))),
            entry('salt', xdr.ScVal.scvBytes(Buffer.from(salt, 'hex'))),
            entry('taker', nativeToScVal(takerAddress, { type: 'address' })),
            entry('token_in', nativeToScVal(tokenIn, { type: 'address' })),
            entry('token_out', nativeToScVal(tokenOut, { type: 'address' })),
          ]);

          const xdrBytes = quoteScVal.toXDR();
          const hash = Buffer.from(sha256.arrayBuffer(xdrBytes));
          const sig = Buffer.from(nacl.sign.detached(hash, kp.secretKey));

          ws.send(JSON.stringify({
            type: 'rfqQuote',
            message: {
              rfqId,
              quoteId,
              makerAddress: TEST_MAKER_ADDRESS,
              takerAddress,
              tokenIn,
              tokenOut,
              amountIn: String(amountIn),
              amountOut: String(amountOut),
              expiryTimestamp: expiry,
              salt,
              signature: sig.toString('hex'),
            },
          }));
          ok('Signed quote sent to backend');
        }
      } catch {}
    });

    ws.on('error', (e: Error) => {
      err('WebSocket error', e.message);
      clearTimeout(timeout);
      resolve();
    });

    ws.on('close', () => {
      if (!quoteReceived && quoteRequested) {
        // Already handled
      }
    });
  });
});

// ── 8. Trade record in DB ─────────────────────────────────────────────────────
await step('8. Trade record created in MongoDB', async () => {
  const db = mongoose.connection.db!;
  const trade = await db.collection('trades').findOne(
    { makerAddress: TEST_MAKER_ADDRESS },
    { sort: { quotedAt: -1 } }
  );
  if (trade) {
    ok('Trade found in DB', `quoteId=${trade.quoteId?.slice(0, 8)}… status=${trade.status}`);
  } else {
    err('No trade found in DB');
  }
});

// ── 9. Rate limits endpoint ───────────────────────────────────────────────────
await step('9. Rate limits endpoint', async () => {
  const r = await axios.get(`${BASE}/api/makers/${TEST_MAKER_ADDRESS}/rate-limits`).catch(e => e.response);
  if (r?.status === 200) ok('Rate limits OK', `count=${r.data.limits?.length ?? 0}`);
  else err('Rate limits endpoint failed', JSON.stringify(r?.data));
});

// ── Summary ───────────────────────────────────────────────────────────────────
await mongoose.disconnect();

console.log(`\n${'═'.repeat(50)}`);
console.log(`  SMOKE TEST RESULTS`);
console.log(`${'═'.repeat(50)}`);
console.log(`  Passed: ${pass}`);
console.log(`  Failed: ${fail}`);
console.log(`${'═'.repeat(50)}\n`);

if (fail > 0) process.exit(1);
