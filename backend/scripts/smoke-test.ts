/**
 * HyperDex Smoke Test
 * Run: npx ts-node --project tsconfig.smoke.json scripts/smoke-test.ts
 */

import axios from 'axios';
import WebSocket from 'ws';
import crypto from 'crypto';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nacl = require('tweetnacl') as typeof import('tweetnacl');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { sha256 } = require('js-sha256') as { sha256: { arrayBuffer: (data: Uint8Array) => ArrayBuffer } };
import mongoose from 'mongoose';

const BASE = process.env.BACKEND_URL ?? 'http://localhost:4000';
const WS_URL = BASE.replace('http', 'ws') + '/ws/maker';
const MONGO_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/hyperdex';
const MONGO_DB = 'hyperdex';

const USDC = 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';
const EURC = 'CCUUDM434BMZMYWYDITHFXHDMIVTGGD6T2I5UKNX5BSLXLW7HVR4MCGZ';
const TEST_MAKER_ADDRESS = 'GALNCMRJ2GCQ34RH7L55HZLUCZ3EHDIKPWTNTWDGVJ4FJWCP5GDVA726';
const TEST_TAKER_ADDRESS = 'GBZKYPAK56QGFGSP6NKDLNUNC5CQ3R2HKRXLGHJFSIH236NZ6XRCWB6A';

let pass = 0;
let fail = 0;
let apiKey = '';

function ok(label: string, detail?: string): void {
  console.log(`  ✓ ${label}${detail ? '  · ' + detail : ''}`);
  pass++;
}

function ko(label: string, detail?: string): void {
  console.error(`  ✗ ${label}${detail ? '  · ' + detail : ''}`);
  fail++;
}

async function step(name: string, fn: () => Promise<void>): Promise<void> {
  process.stdout.write(`\n[${name}]\n`);
  try { await fn(); }
  catch (e: unknown) { ko('Unexpected error', e instanceof Error ? e.message : String(e)); }
}

async function main(): Promise<void> {
  await mongoose.connect(MONGO_URI, { dbName: MONGO_DB });
  const db = mongoose.connection.db!;

  // 1. Health
  await step('1. Health check', async () => {
    const r = await axios.get(`${BASE}/health`);
    if (r.data.status === 'ok') ok('Backend healthy', `uptime=${Math.floor(r.data.uptime)}s`);
    else ko('Health failed', JSON.stringify(r.data));
  });

  // 2. Apply + register
  await step('2. Apply + register + API key', async () => {
    const applyRes = await axios.post(`${BASE}/api/makers/apply`, {
      stellarAddress: TEST_MAKER_ADDRESS,
      name: 'SmokeTest Maker',
      contactEmail: 'smoke@test.local',
      requestedPairs: [{ tokenIn: USDC, tokenOut: EURC }],
    }).catch((e: unknown) => (axios.isAxiosError(e) ? e.response : null));

    if (!applyRes || ![200, 201, 409].includes(applyRes.status)) {
      ko('Apply failed', JSON.stringify(applyRes?.data)); return;
    }
    ok('Apply submitted', `status=${applyRes.status}`);

    await db.collection('pendingmakers').updateOne(
      { stellarAddress: TEST_MAKER_ADDRESS },
      { $set: { status: 'approved' } }
    );

    const seed = crypto.randomBytes(32);
    const kp = nacl.sign.keyPair.fromSeed(seed);
    const signerPublicKey = Buffer.from(kp.publicKey).toString('hex');

    const regRes = await axios.post(`${BASE}/api/makers/register`, {
      stellarAddress: TEST_MAKER_ADDRESS,
      name: 'SmokeTest Maker',
      signerPublicKey,
      supportedPairs: [{ tokenIn: USDC, tokenOut: EURC }],
    }).catch((e: unknown) => (axios.isAxiosError(e) ? e.response : null));

    if (regRes?.status === 201) {
      apiKey = regRes.data.apiKey as string;
      ok('Registered + key issued', `key=${apiKey.slice(0, 16)}...`);
    } else if (regRes?.status === 409) {
      const makerDoc = await db.collection('makers').findOne({ stellarAddress: TEST_MAKER_ADDRESS });
      if (!makerDoc) { ko('Maker not in DB'); return; }
      const rawKey = `sk_live_${crypto.randomBytes(32).toString('hex')}`;
      const bcrypt = await import('bcrypt');
      const hash = await bcrypt.hash(rawKey, 10);
      await db.collection('apikeys').updateOne(
        { makerId: makerDoc._id },
        { $set: { keyHash: hash, keyPrefix: rawKey.slice(0, 15), lastUsedAt: null } },
        { upsert: true }
      );
      await db.collection('makers').updateOne(
        { _id: makerDoc._id },
        { $set: { signerPublicKey, active: true } }
      );
      apiKey = rawKey;
      ok('Already registered — fresh key injected', `key=${rawKey.slice(0, 16)}...`);
    } else {
      ko('Register failed', JSON.stringify(regRes?.data));
    }
  });

  // 3. Verify key
  await step('3. Verify API key', async () => {
    if (!apiKey) { ko('No API key'); return; }
    const r = await axios.post(`${BASE}/api/makers/verify-key`, { apiKey });
    if (r.data.success) ok('Key verified', `maker=${r.data.maker?.name as string}`);
    else ko('Key verification failed', JSON.stringify(r.data));
  });

  // 4. Signer key registration
  await step('4. Register signer key via API', async () => {
    if (!apiKey) { ko('No API key'); return; }
    const seed2 = crypto.randomBytes(32);
    const kp2 = nacl.sign.keyPair.fromSeed(seed2);
    const sk2 = Buffer.from(kp2.publicKey).toString('hex');
    const r = await axios.post(
      `${BASE}/api/makers/register-signer-key`,
      { signerPublicKey: sk2 },
      { headers: { Authorization: `Bearer ${apiKey}` } }
    ).catch((e: unknown) => (axios.isAxiosError(e) ? e.response : null));
    if (r?.status === 200) ok('Signer key registered', `${sk2.slice(0, 16)}...`);
    else ko('Registration failed', JSON.stringify(r?.data));
  });

  // 5. Status
  await step('5. Maker status endpoint', async () => {
    const r = await axios.get(`${BASE}/api/makers/${TEST_MAKER_ADDRESS}/status`)
      .catch((e: unknown) => (axios.isAxiosError(e) ? e.response : null));
    if (r?.status === 200) ok('Status OK', `connected=${r.data.isConnected as boolean}`);
    else ko('Status failed', JSON.stringify(r?.data));
  });

  // 6. Pool
  await step('6. Pool endpoint', async () => {
    const r = await axios.get(`${BASE}/api/makers/${TEST_MAKER_ADDRESS}/pool`)
      .catch((e: unknown) => (axios.isAxiosError(e) ? e.response : null));
    if (r?.status === 200) ok('Pool OK', `deployed=${r.data.poolDeployed as boolean}`);
    else ko('Pool failed', JSON.stringify(r?.data));
  });

  // 7. Inventory
  await step('7. Inventory endpoint', async () => {
    const r = await axios.get(`${BASE}/api/makers/${TEST_MAKER_ADDRESS}/inventory`)
      .catch((e: unknown) => (axios.isAxiosError(e) ? e.response : null));
    if (r?.status === 200) ok('Inventory OK', `usdc=${r.data.vault?.usdc as string}`);
    else ko('Inventory failed', JSON.stringify(r?.data));
  });

  // 8. WebSocket + RFQ
  await step('8. WebSocket + price levels + RFQ round-trip', async () => {
    if (!apiKey) { ko('No API key'); return; }

    const seed = crypto.randomBytes(32);
    const kp = nacl.sign.keyPair.fromSeed(seed);
    const signerPublicKey = Buffer.from(kp.publicKey).toString('hex');
    await db.collection('makers').updateOne(
      { stellarAddress: TEST_MAKER_ADDRESS },
      { $set: { signerPublicKey, active: true } }
    );

    await new Promise<void>((resolve) => {
      const ws = new WebSocket(WS_URL, { headers: { 'Authorization': `Bearer ${apiKey}` } });
      let rfqSent = false;
      let done = false;

      const finish = (success: boolean, msg?: string): void => {
        if (done) return;
        done = true;
        if (success) ok('RFQ round-trip OK', msg);
        else ko('RFQ failed', msg);
        try { ws.close(); } catch { /* ignore */ }
        resolve();
      };

      const timer = setTimeout(() => finish(false, 'timeout after 15s'), 15000);

      ws.on('open', () => {
        ok('WS connected');
        // Price levels are sent after receiving the server's 'connected' ack,
        // which guarantees the server's message handler is registered (auth complete).
      });

      ws.on('message', (raw: Buffer) => {
        try {
          const msg = JSON.parse(raw.toString()) as {
            type: string;
            message: {
              rfqId: string; takerAddress: string; tokenIn: string;
              tokenOut: string; amountIn: string; feesBps?: number;
            };
          };

          // Server signals auth complete — now safe to send price levels
          if (msg.type === 'connected') {
            ws.send(JSON.stringify({
              type: 'priceLevels',
              message: {
                tokenIn: USDC, tokenOut: EURC,
                buyLevels: [{ quantity: '1000000000', price: '0.9240' }],
                sellLevels: [{ quantity: '1000000000', price: '0.9240' }],
              },
            }));
            ok('Price levels sent');

            setTimeout(async () => {
              if (rfqSent || done) return;
              rfqSent = true;
              try {
                const rfqRes = await axios.post(`${BASE}/api/quote`, {
                  takerAddress: TEST_TAKER_ADDRESS,
                  tokenIn: USDC, tokenOut: EURC,
                  amountIn: '100000000',
                });
                clearTimeout(timer);
                const q = rfqRes.data.quote as { amountOut: string; rate: string };
                finish(true, `amountOut=${q.amountOut} rate=${q.rate}`);
              } catch (e: unknown) {
                clearTimeout(timer);
                finish(false, axios.isAxiosError(e) ? JSON.stringify(e.response?.data) : String(e));
              }
            }, 1000);
            return;
          }

          if (msg.type !== 'rfq') return;

          const { rfqId, takerAddress, tokenIn, tokenOut, amountIn, feesBps } = msg.message;
          const feeBps = feesBps ?? 10;
          const amountOut = Math.floor(Number(amountIn) * 0.924 * (1 - feeBps * 0.0001));
          const expiry = Math.floor(Date.now() / 1000) + 60;
          const quoteId = crypto.randomBytes(32).toString('hex');
          const salt = crypto.randomBytes(32).toString('hex');

          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { xdr, nativeToScVal } = require('@stellar/stellar-sdk') as typeof import('@stellar/stellar-sdk');
          type ScMapEntry = import('@stellar/stellar-sdk').xdr.ScMapEntry;
          type ScVal = import('@stellar/stellar-sdk').xdr.ScVal;
          const entryFn = (k: string, v: ScVal): ScMapEntry =>
            new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(k), val: v });

          const quoteScVal = xdr.ScVal.scvMap([
            entryFn('amount_in',  nativeToScVal(BigInt(amountIn),  { type: 'i128' })),
            entryFn('amount_out', nativeToScVal(BigInt(amountOut), { type: 'i128' })),
            entryFn('expiry',     nativeToScVal(BigInt(expiry),    { type: 'u64' })),
            entryFn('maker',      nativeToScVal(TEST_MAKER_ADDRESS, { type: 'address' })),
            entryFn('quote_id',   xdr.ScVal.scvBytes(Buffer.from(quoteId, 'hex'))),
            entryFn('salt',       xdr.ScVal.scvBytes(Buffer.from(salt, 'hex'))),
            entryFn('taker',      nativeToScVal(takerAddress, { type: 'address' })),
            entryFn('token_in',   nativeToScVal(tokenIn, { type: 'address' })),
            entryFn('token_out',  nativeToScVal(tokenOut, { type: 'address' })),
          ]);

          const xdrBuf = quoteScVal.toXDR() as Buffer;
          const hashBuf = Buffer.from(sha256.arrayBuffer(xdrBuf));
          const sig = Buffer.from(nacl.sign.detached(hashBuf, kp.secretKey));

          ws.send(JSON.stringify({
            type: 'rfqQuote',
            message: {
              rfqId, quoteId,
              makerAddress: TEST_MAKER_ADDRESS,
              takerAddress, tokenIn, tokenOut,
              amountIn: String(amountIn),
              amountOut: String(amountOut),
              expiryTimestamp: expiry,
              salt,
              signature: sig.toString('hex'),
            },
          }));
          ok('Signed quote sent');
        } catch { /* ignore */ }
      });

      ws.on('error', (e: Error) => { clearTimeout(timer); finish(false, e.message); });
    });
  });

  // 9. Trade in DB
  await step('9. Trade in MongoDB', async () => {
    const trade = await db.collection('trades').findOne(
      { makerAddress: TEST_MAKER_ADDRESS },
      { sort: { quotedAt: -1 } }
    );
    if (trade) ok('Trade found', `id=${String(trade.quoteId).slice(0, 10)}... status=${trade.status as string}`);
    else ko('No trade in DB');
  });

  // 10. Rate limits
  await step('10. Rate limits endpoint', async () => {
    const r = await axios.get(`${BASE}/api/makers/${TEST_MAKER_ADDRESS}/rate-limits`)
      .catch((e: unknown) => (axios.isAxiosError(e) ? e.response : null));
    if (r?.status === 200) ok('Rate limits OK', `active=${r.data.limits?.length ?? 0}`);
    else ko('Rate limits failed', JSON.stringify(r?.data));
  });

  await mongoose.disconnect();

  const ln = '═'.repeat(52);
  console.log(`\n${ln}`);
  console.log(`  SMOKE TEST RESULTS`);
  console.log(ln);
  console.log(`  Passed : ${pass}`);
  console.log(`  Failed : ${fail}`);
  console.log(`${ln}\n`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
