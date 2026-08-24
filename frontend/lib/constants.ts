/**
 * Every value here is derived from the *runtime-selected* network (see
 * ./networks.ts) rather than read straight off process.env. The export names
 * and shapes are unchanged, so existing call sites keep working; the values
 * now follow whichever network the visitor picked in the navbar switcher.
 */
import { ACTIVE_NETWORK, ACTIVE_NETWORK_ID } from './networks';

export { ACTIVE_NETWORK, ACTIVE_NETWORK_ID, NETWORKS, DEFAULT_NETWORK_ID, switchNetwork } from './networks';
export type { NetworkId, NetworkConfig } from './networks';

export const BACKEND_URL = ACTIVE_NETWORK.backendUrl;
export const STELLAR_RPC_URL = ACTIVE_NETWORK.rpcUrl;
export const STELLAR_NETWORK = ACTIVE_NETWORK_ID;

export const NETWORK_PASSPHRASE = ACTIVE_NETWORK.passphrase;
export const HORIZON_URL = ACTIVE_NETWORK.horizonUrl;

export const QUOTE_VERIFIER_CONTRACT = ACTIVE_NETWORK.quoteVerifier;
export const POOL_REGISTRY_CONTRACT = ACTIVE_NETWORK.poolRegistry;
export const MAKER_POOL_FACTORY_CONTRACT = ACTIVE_NETWORK.makerPoolFactory;
export const FEE_DISTRIBUTOR_CONTRACT = ACTIVE_NETWORK.feeDistributor;
export const ADMIN_ADDRESS = ACTIVE_NETWORK.adminAddress;
export const USDC_CONTRACT = ACTIVE_NETWORK.usdc;
export const EURC_CONTRACT = ACTIVE_NETWORK.eurc;

export const STROOPS_PER_UNIT = 10_000_000n;

export const TOKENS: Record<string, { symbol: string; name: string; decimals: number }> = {
  [USDC_CONTRACT]: { symbol: 'USDC', name: 'USD Coin', decimals: 7 },
  [EURC_CONTRACT]: { symbol: 'EURC', name: 'Euro Coin', decimals: 7 },
};

export const EXPLORER_BASE = ACTIVE_NETWORK.explorerBase;

export const FREIGHTER_NETWORK = ACTIVE_NETWORK.freighterNetwork;

export const IS_TESTNET = ACTIVE_NETWORK_ID === 'testnet';
