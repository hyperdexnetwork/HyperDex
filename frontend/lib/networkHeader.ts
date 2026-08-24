import { ACTIVE_NETWORK_ID } from './networks';

/** Header name shared with lib/server/backendTarget.ts. */
export const NETWORK_HEADER = 'x-hyperdex-network';

/**
 * Tag a request to one of our own /api/* route handlers with the active
 * network. Those handlers run on the server and cannot see the visitor's
 * stored choice, so without this they would always proxy to the default
 * network's backend.
 */
export function networkHeaders(extra?: Record<string, string>): Record<string, string> {
  return { ...extra, [NETWORK_HEADER]: ACTIVE_NETWORK_ID };
}
