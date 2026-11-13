import { ACTIVE_NETWORK } from '@/lib/networks';

/** Header the browser sends with proxied requests (kept for compatibility). */
export const NETWORK_HEADER = 'x-hyperdex-network';

/**
 * Resolve the backend origin for a proxied request. HyperDex is testnet-only,
 * so every request goes to the testnet backend regardless of the header.
 */
export function backendUrlFromRequest(_req: Request): string {
  return ACTIVE_NETWORK.backendUrl;
}
