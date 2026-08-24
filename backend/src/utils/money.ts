// Shared money helpers.
//
// amountInUsd and feeAmount are read by four aggregations (/api/stats,
// /api/makers/:address/status, topPairs) but were never written by any code
// path, so every published volume and fee figure was structurally zero. These
// helpers are the single place those two values get derived.

import { config } from '../config';
import { getCachedProtocolFeeBps } from './protocolFee';

/** Stellar contract amounts are integers scaled by 1e7. */
export const STROOPS_PER_UNIT = 10_000_000n;

/**
 * EUR→USD used to normalize EURC volume.
 *
 * TODO: replace with the price oracle the maker SDK already ships
 * (maker-sdk/src/oracle.ts). A static rate misstates EURC volume by however far
 * the market has moved; it is carried here — as one constant instead of the two
 * hardcoded copies it replaces — so the reporting path has a single knob.
 */
const EUR_USD_RATE = Number(process.env.EUR_USD_RATE ?? '1.08');

/** Convert a raw stroop amount of `token` to a USD float, for reporting only. */
export function toUsd(rawAmount: string, token: string): number | null {
  let units: number;
  try {
    units = Number(BigInt(rawAmount)) / Number(STROOPS_PER_UNIT);
  } catch {
    return null;
  }
  if (!Number.isFinite(units)) return null;
  return token === config.USDC_CONTRACT_ADDRESS ? units : units * EUR_USD_RATE;
}

/**
 * Protocol fee carved out of a gross amount_out, mirroring quote_verifier:
 *   fee = floor(amount_out * fee_bps / 10_000)
 * Returned as a raw stroop string, matching Trade.feeAmount's type.
 */
export function protocolFeeOn(grossAmountOut: string): string {
  try {
    const gross = BigInt(grossAmountOut);
    if (gross <= 0n) return '0';
    return ((gross * BigInt(getCachedProtocolFeeBps())) / 10_000n).toString();
  } catch {
    return '0';
  }
}

/** Taker's net receipt after the protocol fee — what "You receive" should show. */
export function netAmountOut(grossAmountOut: string): string {
  try {
    const gross = BigInt(grossAmountOut);
    return (gross - BigInt(protocolFeeOn(grossAmountOut))).toString();
  } catch {
    return grossAmountOut;
  }
}
