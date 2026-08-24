import { NETWORKS, DEFAULT_NETWORK_ID, type NetworkId } from '@/lib/networks';

/** Header the browser sends so server route handlers proxy to the right backend. */
export const NETWORK_HEADER = 'x-hyperdex-network';

/**
 * Resolve the backend origin for a proxied request.
 *
 * Route handlers run on the server, where the visitor's localStorage choice is
 * invisible — so the client tags each request with NETWORK_HEADER and we map
 * that to the matching backend. An absent or unrecognised header falls back to
 * the default network rather than guessing.
 */
export function backendUrlFromRequest(req: Request): string {
  const raw = req.headers.get(NETWORK_HEADER);
  const id: NetworkId = raw === 'testnet' || raw === 'mainnet' ? raw : DEFAULT_NETWORK_ID;
  return NETWORKS[id].backendUrl;
}
