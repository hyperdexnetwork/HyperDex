'use client';

/**
 * Stellar Wallets Kit integration.
 *
 * Replaces the previous Freighter-only path with a multi-wallet layer. The kit
 * is initialised lazily and only in the browser — its modules touch `window`
 * and injected extension globals at construction, so importing it during SSR
 * throws.
 *
 * We deliberately do NOT use the kit's own `authModal()`. The wallet list is
 * rendered by WalletSelectModal so it can carry the HyperDex theme; this module
 * just exposes the data and the actions that modal needs.
 */
import { ACTIVE_NETWORK } from '@/lib/networks';

export const SELECTED_WALLET_KEY = 'hyperdex.wallet';
/** Display name of the selected wallet, so UI copy can name it after a reload. */
export const SELECTED_WALLET_NAME_KEY = 'hyperdex.walletName';

export interface WalletOption {
  id: string;
  name: string;
  type: string;
  isAvailable: boolean;
  icon: string;
  url: string;
}

type Kit = typeof import('@creit.tech/stellar-wallets-kit').StellarWalletsKit;

let kitPromise: Promise<Kit> | null = null;

/** Remembered so a reload can reconnect without prompting for a wallet again. */
export function readStoredWalletId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(SELECTED_WALLET_KEY);
  } catch {
    return null;
  }
}

export function storeWalletId(id: string | null, name?: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (id) {
      window.localStorage.setItem(SELECTED_WALLET_KEY, id);
      if (name) window.localStorage.setItem(SELECTED_WALLET_NAME_KEY, name);
    } else {
      window.localStorage.removeItem(SELECTED_WALLET_KEY);
      window.localStorage.removeItem(SELECTED_WALLET_NAME_KEY);
    }
  } catch {
    // Storage disabled — the session still works, it just won't survive reload.
  }
}

/** Name of the connected wallet, for user-facing copy. */
export function readStoredWalletName(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(SELECTED_WALLET_NAME_KEY);
  } catch {
    return null;
  }
}

/**
 * The kit rejects with a plain `{ code, message }` object, not an Error, so
 * `instanceof Error` checks upstream silently collapsed every failure into a
 * generic "Failed to connect". Normalise here so real reasons survive.
 */
function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  if (err && typeof err === 'object') {
    const e = err as { code?: number; message?: string };
    // -3 / -4 are the kit's user-rejection codes; treat any explicit rejection
    // as a cancel so the UI stays quiet instead of showing a scary error.
    const msg = e.message ?? 'Wallet request failed';
    if (/reject|denied|cancel|declin/i.test(msg)) return new Error('user_cancelled');
    return new Error(msg);
  }
  return new Error('Wallet request failed');
}

/** Reject if a wallet never answers, so the UI can't hang on "Connecting…". */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out — is the wallet open?`)), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

async function initKit(): Promise<Kit> {
  const [
    { StellarWalletsKit, Networks },
    { FreighterModule },
    { xBullModule },
    { LobstrModule },
    { RabetModule },
    { AlbedoModule },
    { HanaModule },
    { HotWalletModule },
    { LedgerModule },
  ] = await Promise.all([
    import('@creit.tech/stellar-wallets-kit'),
    import('@creit.tech/stellar-wallets-kit/modules/freighter'),
    import('@creit.tech/stellar-wallets-kit/modules/xbull'),
    import('@creit.tech/stellar-wallets-kit/modules/lobstr'),
    import('@creit.tech/stellar-wallets-kit/modules/rabet'),
    import('@creit.tech/stellar-wallets-kit/modules/albedo'),
    import('@creit.tech/stellar-wallets-kit/modules/hana'),
    import('@creit.tech/stellar-wallets-kit/modules/hotwallet'),
    import('@creit.tech/stellar-wallets-kit/modules/ledger'),
  ]);

  StellarWalletsKit.init({
    modules: [
      new FreighterModule(),
      new xBullModule(),
      new LobstrModule(),
      new RabetModule(),
      new AlbedoModule(),
      new HanaModule(),
      new HotWalletModule(),
      new LedgerModule(),
    ],
    // Follows the navbar network switcher: the kit signs against whichever
    // network the rest of the app is configured for.
    network:
      ACTIVE_NETWORK.id === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET,
    selectedWalletId: readStoredWalletId() ?? undefined,
  });

  return StellarWalletsKit;
}

export function getKit(): Promise<Kit> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Wallet kit is browser-only'));
  }
  if (!kitPromise) {
    kitPromise = initKit().catch(err => {
      // Let a later attempt retry instead of caching a permanently failed kit.
      kitPromise = null;
      throw err;
    });
  }
  return kitPromise;
}

/** Wallet list for the picker, installed ones first. */
export async function listWallets(): Promise<WalletOption[]> {
  const kit = await getKit();
  const wallets = await kit.refreshSupportedWallets();
  return [...wallets]
    .map(w => ({
      id: w.id,
      name: w.name,
      type: w.type,
      isAvailable: w.isAvailable,
      icon: w.icon,
      url: w.url,
    }))
    .sort((a, b) => Number(b.isAvailable) - Number(a.isAvailable));
}

/** Select a wallet and read its address. Throws if the user cancels. */
export async function connectWallet(walletId: string, walletName?: string): Promise<string> {
  const kit = await getKit();
  kit.setWallet(walletId);

  // fetchAddress() asks the WALLET; getAddress() only reads the kit's in-memory
  // value and throws "No wallet has been connected" when it is empty — which is
  // always the case on a fresh connect, so it can never establish a session.
  try {
    const { address } = await withTimeout(kit.fetchAddress(), 90_000, 'Wallet connection');
    if (!address) throw new Error('user_cancelled');
    storeWalletId(walletId, walletName);
    return address;
  } catch (err) {
    throw toError(err);
  }
}

/** Address for an already-selected wallet, or '' when none is connected. */
export async function getWalletAddress(): Promise<string> {
  const walletId = readStoredWalletId();
  if (!walletId) return '';
  try {
    const kit = await getKit();
    kit.setWallet(walletId);
    try {
      // Cheap path: already in kit memory this page-load.
      const { address } = await kit.getAddress();
      if (address) return address;
    } catch {
      // Empty memory after a reload — fall through and ask the wallet.
    }
    const { address } = await withTimeout(kit.fetchAddress(), 20_000, 'Session restore');
    return address ?? '';
  } catch {
    return '';
  }
}

export async function signWithWallet(xdr: string): Promise<string> {
  const kit = await getKit();
  const walletId = readStoredWalletId();
  if (walletId) kit.setWallet(walletId);

  // Pin the signing account. Albedo (and other multi-account wallets) use this
  // to choose WHICH key signs — without it the user can sign with an account
  // that isn't the taker the quote was bound to, and settlement fails with
  // txBadAuth after they have already approved.
  let address: string | undefined;
  try {
    address = (await kit.getAddress()).address;
  } catch {
    // Not in memory this page-load; the wallet will fall back to its default.
  }

  try {
    const { signedTxXdr } = await kit.signTransaction(xdr, {
      networkPassphrase: ACTIVE_NETWORK.passphrase,
      address,
    });
    if (!signedTxXdr) throw new Error('Wallet did not return a signed transaction');
    return signedTxXdr;
  } catch (err) {
    throw toError(err);
  }
}

/**
 * The wallet's own network, when it exposes one. Used to warn before signing —
 * a signature produced on the wrong network is rejected as txBadAuth.
 */
export async function getWalletNetworkPassphrase(): Promise<string | null> {
  try {
    const kit = await getKit();
    const { networkPassphrase } = await kit.getNetwork();
    return networkPassphrase ?? null;
  } catch {
    return null;
  }
}

export async function disconnectWallet(): Promise<void> {
  storeWalletId(null);
  try {
    const kit = await getKit();
    await kit.disconnect();
  } catch {
    // Module may not support disconnect — clearing our own state is enough.
  }
}
