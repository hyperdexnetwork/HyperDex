import * as StellarSdk from '@stellar/stellar-sdk';
import { config, NETWORK_PASSPHRASE } from '../config';

let _server: StellarSdk.rpc.Server | null = null;

// In-memory cache to avoid hammering slow Soroban RPC on every inventory request.
//
// Bounded: the cache key embeds a caller-supplied address, and the endpoints
// that populate it accept any well-formed G-address, so an unbounded Map grew
// for the life of the process under attacker control. Insertion order gives a
// cheap FIFO eviction once MAX_CACHE_ENTRIES is reached.
const balanceCache = new Map<string, { value: string; fetchedAt: number }>();
const CACHE_TTL_MS = 60_000; // 60s cache for pool/wallet balances
const MAX_CACHE_ENTRIES = 5_000;

function getCached(key: string): string | null {
  const entry = balanceCache.get(key);
  if (entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS) return entry.value;
  if (entry) balanceCache.delete(key);
  return null;
}

function setCached(key: string, value: string): void {
  if (!balanceCache.has(key) && balanceCache.size >= MAX_CACHE_ENTRIES) {
    // Drop the oldest entries in bulk so eviction isn't run on every insert.
    let toEvict = Math.ceil(MAX_CACHE_ENTRIES * 0.1);
    for (const k of balanceCache.keys()) {
      balanceCache.delete(k);
      if (--toEvict <= 0) break;
    }
  }
  balanceCache.set(key, { value, fetchedAt: Date.now() });
}

/** Drop one maker's cached signer key — call after any signer rotation. */
export function invalidateSignerKeyCache(makerAddress: string): void {
  balanceCache.delete(`signerkey:${makerAddress}`);
}

export function getRpcServer(): StellarSdk.rpc.Server {
  if (!_server) {
    _server = new StellarSdk.rpc.Server(config.STELLAR_RPC_URL, { allowHttp: true });
  }
  return _server;
}

export async function getWalletTokenBalance(
  walletAddress: string,
  tokenContractAddress: string,
  skipCache = false
): Promise<string> {
  const cacheKey = `wallet:${walletAddress}:${tokenContractAddress}`;
  if (!skipCache) {
    const cached = getCached(cacheKey);
    if (cached !== null) return cached;
  }

  const server = getRpcServer();
  const contract = new StellarSdk.Contract(tokenContractAddress);
  const walletScVal = new StellarSdk.Address(walletAddress).toScVal();

  // Cache the miss too — an unfunded address re-hit RPC on every single request,
  // which is exactly what an amplification attacker supplies.
  const account = await server.getAccount(walletAddress).catch(() => null);
  if (!account) {
    setCached(cacheKey, '0');
    return '0';
  }

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call('balance', walletScVal))
    .setTimeout(30)
    .build();

  const result = await server.simulateTransaction(tx);
  if (!StellarSdk.rpc.Api.isSimulationSuccess(result) || !result.result) {
    setCached(cacheKey, '0');
    return '0';
  }

  const n = StellarSdk.scValToNative(result.result.retval) as bigint;
  const strVal = n.toString();
  setCached(cacheKey, strVal);
  return strVal;
}

export function invalidateBalanceCache(makerAddress: string, poolAddress?: string): void {
  for (const key of balanceCache.keys()) {
    if (key.includes(makerAddress)) balanceCache.delete(key);
    if (poolAddress && key.includes(poolAddress)) balanceCache.delete(key);
  }
}

// Read maker's pool address from pool_registry contract
export async function getPoolAddressFromRegistry(
  makerAddress: string,
  skipCache = false
): Promise<string | null> {
  const registryAddress = config.POOL_REGISTRY_CONTRACT_ADDRESS;
  if (!registryAddress) return null;

  const cacheKey = `pooladdr:${makerAddress}`;
  if (!skipCache) {
    const cached = getCached(cacheKey);
    if (cached !== null) return cached === 'null' ? null : cached;
  }

  const server = getRpcServer();
  const contract = new StellarSdk.Contract(registryAddress);
  const makerScVal = StellarSdk.nativeToScVal(makerAddress, { type: 'address' });

  const account = await server.getAccount(makerAddress).catch(() => null);
  if (!account) {
    setCached(cacheKey, 'null');
    return null;
  }

  try {
    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(contract.call('get_pool_address', makerScVal))
      .setTimeout(30)
      .build();

    const result = await server.simulateTransaction(tx);
    if (!StellarSdk.rpc.Api.isSimulationSuccess(result) || !result.result) {
      setCached(cacheKey, 'null');
      return null;
    }

    const addr = StellarSdk.scValToNative(result.result.retval) as string;
    setCached(cacheKey, addr);
    return addr;
  } catch {
    setCached(cacheKey, 'null');
    return null;
  }
}

// Read a maker's ed25519 signer key from pool_registry — the SAME key
// quote_verifier uses on-chain to verify quotes. This is the source of truth for
// off-chain bid verification; the MongoDB signerPublicKey can drift from it.
// Returns lowercase hex (64 chars) or null. Cached for CACHE_TTL_MS so a 30s
// auction with many bids doesn't issue one RPC per bid.
/**
 * Keep connected makers' on-chain signer keys hot in the cache.
 *
 * getOnChainSignerKey costs TWO sequential RPC round-trips on a miss
 * (getAccount + simulateTransaction). onRfqQuote calls it while verifying each
 * bid, so a cold cache put ~0.5-1s of RPC inside the RFQ_TIMEOUT_MS window and
 * the maker's bid was discarded as late — the trader saw "no quotes" even
 * though the maker had answered in single-digit milliseconds. Refreshing on a
 * timer shorter than CACHE_TTL_MS keeps that lookup off the auction hot path
 * without weakening the check itself.
 */
export function startSignerKeyWarmer(
  getMakerAddresses: () => string[],
  intervalMs = 45_000,
): NodeJS.Timeout {
  const warm = () => {
    for (const address of getMakerAddresses()) {
      // skipCache=true so the entry is rewritten before it can expire.
      void getOnChainSignerKey(address, true).catch(() => {});
    }
  };
  warm();
  const timer = setInterval(warm, intervalMs);
  // Never hold the process open just for cache warming.
  timer.unref?.();
  return timer;
}

export async function getOnChainSignerKey(
  makerAddress: string,
  skipCache = false
): Promise<string | null> {
  const registryAddress = config.POOL_REGISTRY_CONTRACT_ADDRESS;
  if (!registryAddress) return null;

  const cacheKey = `signerkey:${makerAddress}`;
  if (!skipCache) {
    const cached = getCached(cacheKey);
    if (cached !== null) return cached === 'null' ? null : cached;
  }

  const server = getRpcServer();
  const contract = new StellarSdk.Contract(registryAddress);
  const makerScVal = StellarSdk.nativeToScVal(makerAddress, { type: 'address' });

  const account = await server.getAccount(makerAddress).catch(() => null);
  if (!account) {
    setCached(cacheKey, 'null');
    return null;
  }

  try {
    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(contract.call('get_signer_key', makerScVal))
      .setTimeout(30)
      .build();

    const result = await server.simulateTransaction(tx);
    if (!StellarSdk.rpc.Api.isSimulationSuccess(result) || !result.result) {
      setCached(cacheKey, 'null');
      return null;
    }

    // get_signer_key returns BytesN<32>; scValToNative yields a Buffer.
    const raw = StellarSdk.scValToNative(result.result.retval) as Buffer | Uint8Array;
    const hex = Buffer.from(raw).toString('hex');
    if (!/^[0-9a-f]{64}$/.test(hex)) {
      setCached(cacheKey, 'null');
      return null;
    }
    setCached(cacheKey, hex);
    return hex;
  } catch {
    setCached(cacheKey, 'null');
    return null;
  }
}

// Read balance from maker's own pool contract
export async function getMakerPoolBalance(
  poolAddress: string,
  tokenAddress: string,
  skipCache = false
): Promise<bigint> {
  const cacheKey = `pool:${poolAddress}:${tokenAddress}`;
  if (!skipCache) {
    const cached = getCached(cacheKey);
    if (cached !== null) return BigInt(cached);
  }

  const server = getRpcServer();
  const contract = new StellarSdk.Contract(poolAddress);
  const tokenScVal = StellarSdk.nativeToScVal(tokenAddress, { type: 'address' });

  // Use a dummy account for simulation — just needs any funded account
  const dummyAccount = await server
    .getAccount(config.ADMIN_ADDRESS ?? '')
    .catch(() => null);
  if (!dummyAccount) return 0n;

  try {
    const tx = new StellarSdk.TransactionBuilder(dummyAccount, {
      fee: '100',
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(contract.call('get_balance', tokenScVal))
      .setTimeout(30)
      .build();

    const result = await server.simulateTransaction(tx);
    if (!StellarSdk.rpc.Api.isSimulationSuccess(result) || !result.result) {
      setCached(cacheKey, '0');
      return 0n;
    }

    const n = StellarSdk.scValToNative(result.result.retval) as bigint;
    setCached(cacheKey, n.toString());
    return n;
  } catch {
    setCached(cacheKey, '0');
    return 0n;
  }
}
