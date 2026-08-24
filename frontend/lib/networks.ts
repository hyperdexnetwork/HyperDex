/**
 * Runtime network selection (mainnet <-> testnet).
 *
 * The app used to be single-network: every contract address came from one set
 * of NEXT_PUBLIC_* vars fixed at build time. To let a user try the full flow on
 * testnet without a separate deployment, both networks are now compiled into
 * the bundle and one is selected at runtime from localStorage.
 *
 * Next.js only inlines statically-analysable `process.env.NEXT_PUBLIC_X`
 * expressions, so every variable below is spelled out literally — do not
 * refactor these into a dynamic `process.env[key]` lookup, it resolves to
 * undefined in the browser.
 */

export type NetworkId = 'mainnet' | 'testnet';

export interface NetworkConfig {
  id: NetworkId;
  label: string;
  shortLabel: string;
  passphrase: string;
  freighterNetwork: 'PUBLIC' | 'TESTNET';
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

export const NETWORK_IDS: NetworkId[] = ['mainnet', 'testnet'];

/**
 * Which network the legacy un-suffixed NEXT_PUBLIC_* vars describe. Production
 * (Vercel) only sets those, so they keep working untouched: they are used as
 * the fallback for whichever network NEXT_PUBLIC_STELLAR_NETWORK names.
 */
const LEGACY_NETWORK: NetworkId =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';

/** Network selected when the visitor has never chosen one. */
export const DEFAULT_NETWORK_ID: NetworkId =
  process.env.NEXT_PUBLIC_DEFAULT_NETWORK === 'testnet'
    ? 'testnet'
    : process.env.NEXT_PUBLIC_DEFAULT_NETWORK === 'mainnet'
      ? 'mainnet'
      : LEGACY_NETWORK;

/** Pick per-network value: explicit var, else legacy var, else built-in default. */
function pick(net: NetworkId, explicit: string | undefined, legacy: string | undefined, fallback: string): string {
  if (explicit) return explicit;
  if (net === LEGACY_NETWORK && legacy) return legacy;
  return fallback;
}

const MAINNET: NetworkConfig = {
  id: 'mainnet',
  label: 'Stellar Mainnet',
  shortLabel: 'Mainnet',
  passphrase: 'Public Global Stellar Network ; September 2015',
  freighterNetwork: 'PUBLIC',
  explorerBase: 'https://stellar.expert/explorer/public',
  rpcUrl: pick('mainnet', process.env.NEXT_PUBLIC_MAINNET_STELLAR_RPC_URL, process.env.NEXT_PUBLIC_STELLAR_RPC_URL, 'https://mainnet.sorobanrpc.com'),
  horizonUrl: pick('mainnet', process.env.NEXT_PUBLIC_MAINNET_HORIZON_URL, process.env.NEXT_PUBLIC_HORIZON_URL, 'https://horizon.stellar.org'),
  backendUrl: pick('mainnet', process.env.NEXT_PUBLIC_MAINNET_BACKEND_URL, process.env.NEXT_PUBLIC_BACKEND_URL, 'https://hyperdex.onrender.com'),
  usdc: pick('mainnet', process.env.NEXT_PUBLIC_MAINNET_USDC_CONTRACT, process.env.NEXT_PUBLIC_USDC_CONTRACT, ''),
  eurc: pick('mainnet', process.env.NEXT_PUBLIC_MAINNET_EURC_CONTRACT, process.env.NEXT_PUBLIC_EURC_CONTRACT, ''),
  poolRegistry: pick('mainnet', process.env.NEXT_PUBLIC_MAINNET_POOL_REGISTRY_CONTRACT, process.env.NEXT_PUBLIC_POOL_REGISTRY_CONTRACT, ''),
  quoteVerifier: pick('mainnet', process.env.NEXT_PUBLIC_MAINNET_QUOTE_VERIFIER_CONTRACT, process.env.NEXT_PUBLIC_QUOTE_VERIFIER_CONTRACT, ''),
  makerPoolFactory: pick('mainnet', process.env.NEXT_PUBLIC_MAINNET_MAKER_POOL_FACTORY_ADDRESS, process.env.NEXT_PUBLIC_MAKER_POOL_FACTORY_ADDRESS, ''),
  feeDistributor: pick('mainnet', process.env.NEXT_PUBLIC_MAINNET_FEE_DISTRIBUTOR_CONTRACT, process.env.NEXT_PUBLIC_FEE_DISTRIBUTOR_CONTRACT, ''),
  adminAddress: pick('mainnet', process.env.NEXT_PUBLIC_MAINNET_ADMIN_ADDRESS, process.env.NEXT_PUBLIC_ADMIN_ADDRESS, ''),
};

const TESTNET: NetworkConfig = {
  id: 'testnet',
  label: 'Stellar Testnet',
  shortLabel: 'Testnet',
  passphrase: 'Test SDF Network ; September 2015',
  freighterNetwork: 'TESTNET',
  explorerBase: 'https://stellar.expert/explorer/testnet',
  rpcUrl: pick('testnet', process.env.NEXT_PUBLIC_TESTNET_STELLAR_RPC_URL, process.env.NEXT_PUBLIC_STELLAR_RPC_URL, 'https://soroban-testnet.stellar.org'),
  horizonUrl: pick('testnet', process.env.NEXT_PUBLIC_TESTNET_HORIZON_URL, process.env.NEXT_PUBLIC_HORIZON_URL, 'https://horizon-testnet.stellar.org'),
  backendUrl: pick('testnet', process.env.NEXT_PUBLIC_TESTNET_BACKEND_URL, process.env.NEXT_PUBLIC_BACKEND_URL, 'http://localhost:4000'),
  usdc: pick('testnet', process.env.NEXT_PUBLIC_TESTNET_USDC_CONTRACT, process.env.NEXT_PUBLIC_USDC_CONTRACT, ''),
  eurc: pick('testnet', process.env.NEXT_PUBLIC_TESTNET_EURC_CONTRACT, process.env.NEXT_PUBLIC_EURC_CONTRACT, ''),
  poolRegistry: pick('testnet', process.env.NEXT_PUBLIC_TESTNET_POOL_REGISTRY_CONTRACT, process.env.NEXT_PUBLIC_POOL_REGISTRY_CONTRACT, ''),
  quoteVerifier: pick('testnet', process.env.NEXT_PUBLIC_TESTNET_QUOTE_VERIFIER_CONTRACT, process.env.NEXT_PUBLIC_QUOTE_VERIFIER_CONTRACT, ''),
  makerPoolFactory: pick('testnet', process.env.NEXT_PUBLIC_TESTNET_MAKER_POOL_FACTORY_ADDRESS, process.env.NEXT_PUBLIC_MAKER_POOL_FACTORY_ADDRESS, ''),
  feeDistributor: pick('testnet', process.env.NEXT_PUBLIC_TESTNET_FEE_DISTRIBUTOR_CONTRACT, process.env.NEXT_PUBLIC_FEE_DISTRIBUTOR_CONTRACT, ''),
  adminAddress: pick('testnet', process.env.NEXT_PUBLIC_TESTNET_ADMIN_ADDRESS, process.env.NEXT_PUBLIC_ADMIN_ADDRESS, ''),
};

export const NETWORKS: Record<NetworkId, NetworkConfig> = { mainnet: MAINNET, testnet: TESTNET };

export const NETWORK_STORAGE_KEY = 'hyperdex.network';

function isNetworkId(v: unknown): v is NetworkId {
  return v === 'mainnet' || v === 'testnet';
}

/** The stored choice, or null on the server / when nothing valid is stored. */
export function readStoredNetworkId(): NetworkId | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(NETWORK_STORAGE_KEY);
    return isNetworkId(stored) ? stored : null;
  } catch {
    return null;
  }
}

/**
 * Resolved once at module load. On the server (and during hydration of the
 * prerendered HTML) this is the default network; in the browser it is the
 * visitor's stored choice. Switching writes localStorage and reloads, so every
 * module re-initialises against the new network — see `switchNetwork`.
 */
export const ACTIVE_NETWORK_ID: NetworkId = readStoredNetworkId() ?? DEFAULT_NETWORK_ID;
export const ACTIVE_NETWORK: NetworkConfig = NETWORKS[ACTIVE_NETWORK_ID];

/**
 * Persist the choice and hard-reload. A reload is deliberate: contract
 * addresses, RPC endpoints and the backend origin are read at module scope all
 * over the app, and reloading is the only way to guarantee no component keeps
 * a half-swapped mix of two networks.
 */
export function switchNetwork(next: NetworkId): void {
  if (typeof window === 'undefined' || next === ACTIVE_NETWORK_ID) return;
  try {
    window.localStorage.setItem(NETWORK_STORAGE_KEY, next);
  } catch {
    // Private mode / storage disabled — the reload below still applies the
    // default, so fail loudly rather than pretending the switch worked.
    return;
  }
  window.location.reload();
}
