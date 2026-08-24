#!/usr/bin/env node
/**
 * Keep free-tier Render instances from sleeping.
 *
 * A Render free web service spins down after ~15 minutes without an INBOUND
 * HTTP request. The testnet backend's only steady traffic is the maker's
 * outbound WebSocket, which does not count — so it sleeps, the socket drops,
 * and the first quote after the lull dies against RFQ_TIMEOUT_MS (750ms) while
 * the instance takes 30-60s to wake.
 *
 * This pings /health often enough that the idle timer never expires. It is
 * meant to run inside a service that is itself always on (the maker, on a paid
 * instance) — a pinger hosted on a free instance would sleep alongside its
 * targets and do nothing.
 *
 * When the host service is ITSELF on a free instance, it has the same problem:
 * nothing reaches it either. Render publishes the service's own public address
 * as RENDER_EXTERNAL_URL, so the pinger adds itself to the target list — the
 * request leaves the container and comes back through Render's router, which
 * is an inbound request and resets the idle timer. Set KEEP_AWAKE_SELF=off on a
 * paid instance, where it is unnecessary.
 *
 * Usage:
 *   node scripts/keep-awake.js
 *   KEEP_AWAKE_URLS="https://a/health,https://b/health" node scripts/keep-awake.js
 *
 * Env:
 *   KEEP_AWAKE_URLS         comma-separated URLs   (default: testnet backend /health)
 *   KEEP_AWAKE_INTERVAL_MS  ping period            (default: 600000 — 10 min)
 *   KEEP_AWAKE_TIMEOUT_MS   per-request timeout    (default: 90000)
 *   KEEP_AWAKE_SELF         "off" to skip the self-ping (default: on)
 *   RENDER_EXTERNAL_URL     set by Render; the service's own public address
 */

'use strict';

const https = require('https');
const http = require('http');

const DEFAULT_URLS = ['https://hyperdex-testnet.onrender.com/health'];

const urls = (process.env.KEEP_AWAKE_URLS || DEFAULT_URLS.join(','))
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// Add our own public URL, so a free instance keeps ITSELF awake too. Guarded
// against duplicates in case it was already listed explicitly.
if (process.env.KEEP_AWAKE_SELF !== 'off' && process.env.RENDER_EXTERNAL_URL) {
  const self = `${process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, '')}/health`;
  if (!urls.includes(self)) urls.push(self);
}

// Comfortably under Render's ~15 minute idle window, with room for one failed
// ping before the timer would actually expire.
const INTERVAL_MS = Number(process.env.KEEP_AWAKE_INTERVAL_MS || 600_000);

// A sleeping instance answers only after a cold start, which can take a minute.
// A short timeout would abort exactly the request that does the waking.
const TIMEOUT_MS = Number(process.env.KEEP_AWAKE_TIMEOUT_MS || 90_000);

function stamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

/** Resolves to a result object — never rejects, so one bad host can't stop the loop. */
function ping(url) {
  return new Promise(resolve => {
    const started = Date.now();
    let settled = false;
    const done = result => {
      if (settled) return;
      settled = true;
      resolve({ url, ms: Date.now() - started, ...result });
    };

    let req;
    try {
      const client = url.startsWith('http://') ? http : https;
      req = client.get(url, { headers: { 'user-agent': 'hyperdex-keep-awake' } }, res => {
        // Drain the body: an unconsumed response holds the socket open and
        // leaks a connection per ping over a long-running process.
        res.resume();
        res.on('end', () => done({ ok: res.statusCode >= 200 && res.statusCode < 400, status: res.statusCode }));
      });
    } catch (err) {
      done({ ok: false, error: err.message });
      return;
    }

    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy();
      done({ ok: false, error: `timeout after ${TIMEOUT_MS}ms` });
    });
    req.on('error', err => done({ ok: false, error: err.message }));
  });
}

async function round() {
  const results = await Promise.all(urls.map(ping));
  for (const r of results) {
    const detail = r.ok ? `${r.status}` : `FAILED ${r.error || r.status}`;
    console.log(`[keep-awake ${stamp()}] ${detail} in ${r.ms}ms — ${r.url}`);
  }
}

// A rejection escaping the interval callback would kill the host process, and
// this is a best-effort side task — it must never take the maker down with it.
process.on('unhandledRejection', err => {
  console.error(`[keep-awake ${stamp()}] unhandled rejection:`, err && err.message);
});

console.log(
  `[keep-awake ${stamp()}] pinging every ${Math.round(INTERVAL_MS / 1000)}s:\n  ${urls.join('\n  ')}`
);

round().catch(() => {});
setInterval(() => {
  round().catch(() => {});
}, INTERVAL_MS);
