'use client';

import { useEffect, useState } from 'react';
import {
  ACTIVE_NETWORK_ID,
  DEFAULT_NETWORK_ID,
  NETWORKS,
  switchNetwork,
  type NetworkId,
} from '@/lib/networks';

/**
 * The active network, hydration-safe.
 *
 * The prerendered HTML is always built against DEFAULT_NETWORK_ID, while the
 * browser resolves the visitor's stored choice at module load. Rendering the
 * stored value on the first client pass would therefore mismatch the server
 * markup, so `networkId` reports the default until after mount and `mounted`
 * lets callers hold back network-dependent text until it is settled.
 */
export function useNetwork() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const networkId: NetworkId = mounted ? ACTIVE_NETWORK_ID : DEFAULT_NETWORK_ID;

  return {
    mounted,
    networkId,
    network: NETWORKS[networkId],
    isTestnet: networkId === 'testnet',
    switchNetwork,
  };
}
