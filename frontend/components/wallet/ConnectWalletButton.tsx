'use client';

import { useRouter } from 'next/navigation';
import { useWalletStore } from '@/store/walletStore';

function Spinner() {
  return (
    <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
  );
}

export default function ConnectWalletButton() {
  const router = useRouter();
  const { isConnected, isConnecting, connect, disconnect } = useWalletStore();

  // Opens the wallet picker; WalletSelectModal performs the actual connect and
  // handles the admin redirect, since it knows which wallet was chosen.
  function handleConnect() {
    if (isConnecting) return;
    connect();
  }

  function handleDisconnect() {
    disconnect();
    const p = window.location.pathname;
    if (p.startsWith('/admin') || p.startsWith('/maker')) router.push('/');
  }

  const baseClass =
    'flex items-center gap-2 px-5 py-2.5 bg-navy text-white text-sm font-semibold rounded-full hover:bg-navy-light transition-colors disabled:opacity-50 disabled:cursor-wait';

  if (!isConnected) {
    return (
      <button onClick={handleConnect} disabled={isConnecting} className={baseClass}>
        {isConnecting && <Spinner />}
        {isConnecting ? 'Connecting…' : 'Connect Wallet'}
      </button>
    );
  }

  return (
    <button onClick={handleDisconnect} className={baseClass}>
      Disconnect Wallet
    </button>
  );
}
