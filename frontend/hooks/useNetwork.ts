'use client';

import { ACTIVE_NETWORK, ACTIVE_NETWORK_ID, type NetworkId } from '@/lib/networks';

/**
 * The active network. HyperDex is testnet-only, so this is constant; the hook
 * keeps its shape so call sites stay unchanged.
 */
export function useNetwork() {
  const networkId: NetworkId = ACTIVE_NETWORK_ID;
  return {
    mounted: true,
    networkId,
    network: ACTIVE_NETWORK,
    isTestnet: true,
  };
}
