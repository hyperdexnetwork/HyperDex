/**
 * Network configuration — HyperDex runs on Stellar Testnet only.
 *
 * The mainnet deployment (July 2026) is deprecated and unsupported; the app no
 * longer ships a mainnet configuration or a network switcher. Any future
 * mainnet launch happens only after an independent security audit.
 *
 * Next.js only inlines statically-analysable `process.env.NEXT_PUBLIC_X`
 * expressions, so every variable below is spelled out literally — do not
 * refactor these into a dynamic `process.env[key]` lookup, it resolves to
 * undefined in the browser.
 */

export type NetworkId = 'testnet';

export interface NetworkConfig {
  id: NetworkId;
  label: string;
  shortLabel: string;
  passphrase: string;
  freighterNetwork: 'TESTNET';
  rpcUrl: string;
  horizonUrl: string;
  backendUrl: string;
  explorerBase: string;
  usdc: string;
  eurc: string;
  poolRegistry: string;
  quoteVerifier: string;
  makerPoolFactory: string;
  feeDistributor: string;
  adminAddress: string;
}

/** Explicit NEXT_PUBLIC_TESTNET_* var first, then the un-suffixed var, then a default. */
function pick(explicit: string | undefined, plain: string | undefined, fallback: string): string {
  return explicit || plain || fallback;
}

const TESTNET: NetworkConfig = {
  id: 'testnet',
  label: 'Stellar Testnet',
  shortLabel: 'Testnet',
  passphrase: 'Test SDF Network ; September 2015',
  freighterNetwork: 'TESTNET',
  explorerBase: 'https://stellar.expert/explorer/testnet',
  rpcUrl: pick(process.env.NEXT_PUBLIC_TESTNET_STELLAR_RPC_URL, process.env.NEXT_PUBLIC_STELLAR_RPC_URL, 'https://soroban-testnet.stellar.org'),
  horizonUrl: pick(process.env.NEXT_PUBLIC_TESTNET_HORIZON_URL, process.env.NEXT_PUBLIC_HORIZON_URL, 'https://horizon-testnet.stellar.org'),
  backendUrl: pick(process.env.NEXT_PUBLIC_TESTNET_BACKEND_URL, process.env.NEXT_PUBLIC_BACKEND_URL, 'http://localhost:4000'),
  usdc: pick(process.env.NEXT_PUBLIC_TESTNET_USDC_CONTRACT, process.env.NEXT_PUBLIC_USDC_CONTRACT, ''),
  eurc: pick(process.env.NEXT_PUBLIC_TESTNET_EURC_CONTRACT, process.env.NEXT_PUBLIC_EURC_CONTRACT, ''),
  poolRegistry: pick(process.env.NEXT_PUBLIC_TESTNET_POOL_REGISTRY_CONTRACT, process.env.NEXT_PUBLIC_POOL_REGISTRY_CONTRACT, ''),
  quoteVerifier: pick(process.env.NEXT_PUBLIC_TESTNET_QUOTE_VERIFIER_CONTRACT, process.env.NEXT_PUBLIC_QUOTE_VERIFIER_CONTRACT, ''),
  makerPoolFactory: pick(process.env.NEXT_PUBLIC_TESTNET_MAKER_POOL_FACTORY_ADDRESS, process.env.NEXT_PUBLIC_MAKER_POOL_FACTORY_ADDRESS, ''),
  feeDistributor: pick(process.env.NEXT_PUBLIC_TESTNET_FEE_DISTRIBUTOR_CONTRACT, process.env.NEXT_PUBLIC_FEE_DISTRIBUTOR_CONTRACT, ''),
  adminAddress: pick(process.env.NEXT_PUBLIC_TESTNET_ADMIN_ADDRESS, process.env.NEXT_PUBLIC_ADMIN_ADDRESS, ''),
};

export const NETWORK_IDS: NetworkId[] = ['testnet'];
export const NETWORKS: Record<NetworkId, NetworkConfig> = { testnet: TESTNET };

export const DEFAULT_NETWORK_ID: NetworkId = 'testnet';
export const ACTIVE_NETWORK_ID: NetworkId = 'testnet';
export const ACTIVE_NETWORK: NetworkConfig = TESTNET;
