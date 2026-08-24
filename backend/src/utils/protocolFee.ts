// Protocol fee rate — read from the CONTRACT, not from the environment.
//
// quote_verifier carves the fee out of amount_out at settlement using its own
// stored fee_bps. PROTOCOL_FEE_BPS in the environment is a separate copy, and an
// admin calling set_fee_bps without redeploying the backend silently desynced
// every quote shown to a trader from what the chain actually charges. The
// contract is the source of truth; the env var is only a cold-start fallback.

import * as StellarSdk from '@stellar/stellar-sdk';
import { config, NETWORK_PASSPHRASE } from '../config';
import { getRpcServer } from './stellarUtils';
import { logger } from './logger';

const REFRESH_MS = 5 * 60_000;

let cachedBps: number = config.PROTOCOL_FEE_BPS;
let lastFetchedAt = 0;
let warnedMismatch = false;

/**
 * Last known on-chain fee in basis points. Synchronous, for hot paths that
 * cannot await — falls back to PROTOCOL_FEE_BPS until the first fetch lands.
 */
export function getCachedProtocolFeeBps(): number {
  return cachedBps;
}

/** Force a read of quote_verifier.get_protocol_fee(). Returns the cached value on failure. */
export async function refreshProtocolFeeBps(): Promise<number> {
  const verifier = config.QUOTE_VERIFIER_CONTRACT_ADDRESS;
  const source = config.ADMIN_ADDRESS;
  if (!verifier || !source) return cachedBps;

  try {
    const server = getRpcServer();
    const account = await server.getAccount(source).catch(() => null);
    if (!account) return cachedBps;

    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(new StellarSdk.Contract(verifier).call('get_protocol_fee'))
      .setTimeout(30)
      .build();

    const result = await server.simulateTransaction(tx);
    if (!StellarSdk.rpc.Api.isSimulationSuccess(result) || !result.result) return cachedBps;

    const bps = Number(StellarSdk.scValToNative(result.result.retval));
    if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) return cachedBps;

    if (bps !== config.PROTOCOL_FEE_BPS && !warnedMismatch) {
      warnedMismatch = true;
      logger.error('PROTOCOL_FEE_BPS does not match the on-chain fee — using on-chain value', {
        event: 'fee_config_mismatch',
        envBps: config.PROTOCOL_FEE_BPS,
        onChainBps: bps,
      });
    }
    if (bps !== cachedBps) {
      logger.info('Protocol fee updated from chain', { previousBps: cachedBps, bps });
    }
    cachedBps = bps;
    lastFetchedAt = Date.now();
    return bps;
  } catch (err) {
    logger.warn('Failed to read protocol fee from chain — keeping cached value', {
      err: err instanceof Error ? err.message : String(err),
      cachedBps,
    });
    return cachedBps;
  }
}

/** True once the fee has been confirmed against the contract at least once. */
export function isProtocolFeeVerified(): boolean {
  return lastFetchedAt > 0;
}

export function startProtocolFeeRefresher(intervalMs = REFRESH_MS): NodeJS.Timeout {
  void refreshProtocolFeeBps();
  const timer = setInterval(() => void refreshProtocolFeeBps(), intervalMs);
  timer.unref?.();
  return timer;
}
