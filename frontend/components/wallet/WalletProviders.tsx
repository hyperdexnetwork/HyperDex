'use client';

import { useEffect } from 'react';
import { useWalletStore } from '@/store/walletStore';
import { warmupBackend } from '@/lib/api';
import WrongNetworkBanner from '@/components/wallet/WrongNetworkBanner';
import WalletSelectModal from '@/components/wallet/WalletSelectModal';

export default function WalletProviders() {
  const restoreSession = useWalletStore(s => s.restoreSession);

  // Restore the previously selected wallet's session on every page load
  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  // Wake the backend on load (Render free tier sleeps when idle), so it's warm
  // by the time the user requests a quote. Fire-and-forget — never blocks the UI.
  useEffect(() => {
    void warmupBackend();
  }, []);

  // Re-run restore when the wallet reports an account switch. Freighter emits
  // its own event; other modules are picked up on the next page load.
  useEffect(() => {
    const handler = () => restoreSession();
    window.addEventListener('freighterAccountChanged', handler);
    return () => window.removeEventListener('freighterAccountChanged', handler);
  }, [restoreSession]);

  return (
    <>
      <WrongNetworkBanner />
      <WalletSelectModal />
    </>
  );
}
