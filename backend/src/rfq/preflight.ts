// Taker pre-flight checks.
//
// /api/quote/start validated the SHAPE of a request — tokens whitelisted, amount
// a positive integer, address well-formed — but never whether the taker could
// actually complete the trade. A taker with no trustline for token_out passed
// every check, ran a 30-second auction, had a maker sign a quote, and only then
// failed inside the SAC with a raw `Error(Contract, #13)`.
//
// These checks cost two parallel simulated reads and turn that into an
// actionable message before any maker is disturbed.
//
// Design rule: FAIL OPEN. If Soroban RPC is unreachable we return `ok` and let
// the trade proceed. Blocking quoting whenever RPC hiccups would be a worse
// failure than the one this prevents.

import { checkTokenAccess, getTokenAssetName } from '../utils/stellarUtils';
import { logger } from '../utils/logger';

export type PreflightFailure = {
  code: 'MISSING_TRUSTLINE' | 'INSUFFICIENT_BALANCE';
  message: string;
  /** Contract address of the token the taker needs to act on. */
  token: string;
  /** Human asset name, e.g. "EURC:GB3Q6QDZ…", when it could be resolved. */
  asset?: string;
  /** Present for INSUFFICIENT_BALANCE, raw stroops. */
  required?: string;
  available?: string;
};

export type PreflightResult = { ok: true } | { ok: false } & PreflightFailure;

/** "EURC:GB3Q…" → "EURC". Falls back to a truncated contract id. */
function shortAsset(assetName: string | null, token: string): string {
  if (assetName) return assetName.split(':')[0];
  return `${token.slice(0, 6)}…`;
}

/**
 * Verify the taker can pay `amountIn` of `tokenIn` and can receive `tokenOut`.
 * Both reads run in parallel; neither is cached, so a taker who has just added a
 * trustline is not told for another minute that they still lack one.
 */
export async function preflightTaker(params: {
  takerAddress: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
}): Promise<PreflightResult> {
  const { takerAddress, tokenIn, tokenOut, amountIn } = params;

  const [inAccess, outAccess] = await Promise.all([
    checkTokenAccess(takerAddress, tokenIn),
    checkTokenAccess(takerAddress, tokenOut),
  ]);

  // Receiving side first: it is the failure takers actually hit, and the one
  // they can fix without acquiring funds.
  if (outAccess.status === 'no_trustline') {
    const assetName = await getTokenAssetName(tokenOut);
    return {
      ok: false,
      code: 'MISSING_TRUSTLINE',
      token: tokenOut,
      asset: assetName ?? undefined,
      message:
        `Your wallet cannot receive ${shortAsset(assetName, tokenOut)} yet. ` +
        `Add a ${shortAsset(assetName, tokenOut)} trustline, then try again.`,
    };
  }

  if (inAccess.status === 'no_trustline') {
    const assetName = await getTokenAssetName(tokenIn);
    return {
      ok: false,
      code: 'MISSING_TRUSTLINE',
      token: tokenIn,
      asset: assetName ?? undefined,
      message:
        `Your wallet does not hold ${shortAsset(assetName, tokenIn)}. ` +
        `Add a ${shortAsset(assetName, tokenIn)} trustline and fund it, then try again.`,
    };
  }

  if (inAccess.status === 'ok') {
    let required: bigint;
    try {
      required = BigInt(amountIn);
    } catch {
      return { ok: true }; // Amount is validated upstream; nothing to compare.
    }
    if (inAccess.balance < required) {
      const assetName = await getTokenAssetName(tokenIn);
      const sym = shortAsset(assetName, tokenIn);
      const human = (v: bigint) => (Number(v) / 1e7).toFixed(7).replace(/\.?0+$/, '');
      return {
        ok: false,
        code: 'INSUFFICIENT_BALANCE',
        token: tokenIn,
        asset: assetName ?? undefined,
        required: required.toString(),
        available: inAccess.balance.toString(),
        message:
          `Not enough ${sym}. This trade needs ${human(required)} ${sym}, ` +
          `and your wallet holds ${human(inAccess.balance)}.`,
      };
    }
  }

  // status 'unknown' on either side — RPC problem, not a taker problem.
  if (inAccess.status === 'unknown' || outAccess.status === 'unknown') {
    logger.warn('Taker pre-flight inconclusive — allowing trade', {
      takerAddress: takerAddress.slice(0, 8),
      tokenIn: inAccess.status,
      tokenOut: outAccess.status,
    });
  }

  return { ok: true };
}
