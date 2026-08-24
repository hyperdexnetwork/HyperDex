'use client';

import { create } from 'zustand';
import { ADMIN_WALLET_ADDRESS } from '@/lib/constants/wallet';
import { NETWORK_PASSPHRASE, HORIZON_URL, BACKEND_URL } from '@/lib/constants';
import {
  connectWallet,
  disconnectWallet,
  getWalletAddress,
  getWalletNetworkPassphrase,
  readStoredWalletId,
  readStoredWalletName,
} from '@/lib/wallet/kit';

interface WalletState {
  address: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  isAdmin: boolean;
  isMaker: boolean;
  isWrongNetwork: boolean;
  /** Wallet picker visibility — replaces the old Freighter-only prompt. */
  showWalletModal: boolean;
  /** Kit module id of the connected wallet, so the UI can name it. */
  walletId: string | null;
  /** Display name of the connected wallet, e.g. "Albedo" — used in copy. */
  walletName: string | null;
  xlmBalance: string | null;
  error: string | null;

  /** Opens the wallet picker; the actual connect happens in connectWith(). */
  connect: () => void;
  closeWalletModal: () => void;
  connectWith: (walletId: string, walletName?: string) => Promise<{ address: string; isAdmin: boolean }>;
  disconnect: () => void;
  checkIfMaker: (address: string) => Promise<boolean>;
  fetchXlmBalance: (address: string) => Promise<void>;
  restoreSession: () => Promise<void>;
}

export const useWalletStore = create<WalletState>((set, get) => ({
  address: null,
  isConnected: false,
  isConnecting: false,
  isAdmin: false,
  isMaker: false,
  isWrongNetwork: false,
  showWalletModal: false,
  walletId: null,
  walletName: null,
  xlmBalance: null,
  error: null,

  connect: () => {
    set({ showWalletModal: true, error: null, isWrongNetwork: false });
  },

  closeWalletModal: () => set({ showWalletModal: false }),

  connectWith: async (walletId: string, walletName?: string) => {
    set({ isConnecting: true, error: null, isWrongNetwork: false });

    try {
      const address = await connectWallet(walletId, walletName);

      // Wallets that don't expose a network (hardware, some bridges) return
      // null and are let through — signWithWallet guards again at signing time.
      const walletNetwork = await getWalletNetworkPassphrase();
      if (walletNetwork && walletNetwork !== NETWORK_PASSPHRASE) {
        set({ isConnecting: false, isWrongNetwork: true, showWalletModal: false });
        throw new Error('wrong_network');
      }

      const isAdmin = address === ADMIN_WALLET_ADDRESS;
      const isMaker = isAdmin ? false : await get().checkIfMaker(address);

      // Non-blocking.
      get().fetchXlmBalance(address);

      set({
        address,
        walletId,
        walletName: walletName ?? null,
        isConnected: true,
        isConnecting: false,
        showWalletModal: false,
        isAdmin,
        isMaker,
        error: null,
      });

      return { address, isAdmin };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to connect';
      const silent = ['user_cancelled', 'wrong_network'].includes(msg);
      set({ isConnecting: false, error: silent ? null : msg });
      throw error;
    }
  },

  disconnect: () => {
    void disconnectWallet();
    set({
      address: null,
      walletId: null,
      walletName: null,
      isConnected: false,
      isAdmin: false,
      isMaker: false,
      isWrongNetwork: false,
      showWalletModal: false,
      xlmBalance: null,
      error: null,
    });
  },

  checkIfMaker: async (address: string): Promise<boolean> => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/makers/${address}/status`);
      if (res.status === 404) return false;
      const data = await res.json();
      return data.success === true;
    } catch {
      return false;
    }
  },

  fetchXlmBalance: async (address: string) => {
    try {
      const res = await fetch(`${HORIZON_URL}/accounts/${address}`);
      if (!res.ok) { set({ xlmBalance: '0.00' }); return; }
      const data = await res.json();
      const xlmEntry = data.balances?.find((b: { asset_type: string; balance: string }) => b.asset_type === 'native');
      set({ xlmBalance: xlmEntry ? parseFloat(xlmEntry.balance).toFixed(2) : '0.00' });
    } catch {
      set({ xlmBalance: '0.00' });
    }
  },

  restoreSession: async () => {
    if (typeof window === 'undefined') return;

    // Only a wallet the user previously picked is restored. Without a stored
    // id there is nothing to reconnect to, and probing every module on load
    // would trigger permission prompts the user never asked for.
    const walletId = readStoredWalletId();
    if (!walletId) return;

    try {
      const address = await getWalletAddress();
      if (!address) return;

      const walletNetwork = await getWalletNetworkPassphrase();
      if (walletNetwork && walletNetwork !== NETWORK_PASSPHRASE) {
        set({ isWrongNetwork: true });
        return;
      }

      const isAdmin = address === ADMIN_WALLET_ADDRESS;
      const isMaker = !isAdmin ? await get().checkIfMaker(address) : false;
      get().fetchXlmBalance(address);

      set({ address, walletId, walletName: readStoredWalletName(), isConnected: true, isAdmin, isMaker, isWrongNetwork: false });
    } catch {
      // Not connected, or the wallet declined — leave the UI disconnected.
    }
  },
}));

// Convenience selectors — drop-in replacements for old hooks
export const useWallet = () => useWalletStore();
export const useIsAdmin = () => useWalletStore(s => s.isAdmin);
export const useIsMaker = () => useWalletStore(s => s.isMaker);
