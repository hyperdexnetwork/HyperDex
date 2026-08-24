'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWalletStore } from '@/store/walletStore';
import { listWallets, type WalletOption } from '@/lib/wallet/kit';

const HELP_URL = 'https://developers.stellar.org/docs/build/apps/wallet-guide';

/**
 * Wallet picker. Layout follows the Stellar Wallets Kit's own modal — centred
 * white card, help icon / title / close header, one flat row per wallet with a
 * circular logo and an "Install" pill for wallets that aren't present — so it
 * reads the way users expect a Stellar connect sheet to read.
 */
export default function WalletSelectModal() {
  const { showWalletModal, closeWalletModal, connectWith, isConnecting, error } = useWalletStore();
  const router = useRouter();

  const [wallets, setWallets] = useState<WalletOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  // Detection runs in the browser and re-runs whenever the sheet opens — a
  // wallet may have been installed since the last look.
  useEffect(() => {
    if (!showWalletModal) return;
    let cancelled = false;

    setWallets(null);
    setLoadError(null);

    listWallets()
      .then(list => { if (!cancelled) setWallets(list); })
      .catch(() => { if (!cancelled) setLoadError('Could not load wallets. Reload and try again.'); });

    return () => { cancelled = true; };
  }, [showWalletModal]);

  useEffect(() => {
    if (!showWalletModal) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeWalletModal(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [showWalletModal, closeWalletModal]);

  if (!showWalletModal) return null;

  async function choose(wallet: WalletOption) {
    if (!wallet.isAvailable) {
      window.open(wallet.url, '_blank', 'noopener,noreferrer');
      return;
    }
    setPendingId(wallet.id);
    try {
      const { isAdmin } = await connectWith(wallet.id, wallet.name);
      if (isAdmin) router.push('/admin');
    } catch {
      // Store holds the message; the sheet stays open so the user can retry.
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div
      onClick={closeWalletModal}
      role="dialog"
      aria-modal="true"
      aria-label="Connect Wallet"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 p-4"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-[400px] bg-white rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header — help left, title centred, close right */}
        <div className="relative flex items-center justify-center px-4 h-[58px] border-b border-black/10">
          <a
            href={HELP_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="What is a wallet?"
            className="absolute left-4 w-6 h-6 rounded-full border border-black/20 text-black/45 hover:text-black hover:border-black/40 transition-colors flex items-center justify-center text-[12px] font-semibold"
          >
            ?
          </a>

          <h2 className="text-[16px] font-bold text-[#111118] tracking-tight">Connect Wallet</h2>

          <button
            onClick={closeWalletModal}
            aria-label="Close"
            className="absolute right-4 w-6 h-6 flex items-center justify-center text-black/45 hover:text-black transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[min(60vh,420px)] overflow-y-auto">
          {error && (
            <p className="mx-4 mt-3 text-[13px] text-red-600 bg-red-500/8 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          {loadError && <p className="px-5 py-4 text-[13px] text-red-600">{loadError}</p>}

          {!wallets && !loadError && (
            <div className="py-2">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="w-9 h-9 rounded-full bg-black/[0.06] animate-pulse" />
                  <div className="h-3.5 w-28 rounded bg-black/[0.06] animate-pulse" />
                </div>
              ))}
            </div>
          )}

          {wallets && (
            <ul className="py-1">
              {wallets.map(w => (
                <li key={w.id}>
                  <button
                    onClick={() => choose(w)}
                    disabled={isConnecting && pendingId !== w.id}
                    className="w-full flex items-center gap-4 px-5 py-3 hover:bg-black/[0.035] transition-colors text-left disabled:opacity-45 disabled:cursor-not-allowed"
                  >
                    <span className="shrink-0 w-9 h-9 rounded-full overflow-hidden bg-black/[0.04] flex items-center justify-center">
                      {w.icon
                        ? <img src={w.icon} alt="" className="w-full h-full object-cover" />
                        : <span className="text-[13px] font-bold text-black/40">{w.name.charAt(0)}</span>}
                    </span>

                    <span className="flex-1 min-w-0 text-[15px] font-bold text-[#111118] truncate">
                      {w.name}
                    </span>

                    {pendingId === w.id && isConnecting ? (
                      <span className="shrink-0 w-4 h-4 border-2 border-black/25 border-t-black/70 rounded-full animate-spin" />
                    ) : !w.isAvailable ? (
                      <span className="shrink-0 inline-flex items-center gap-1 text-[12.5px] font-medium text-[#111118] border border-black/15 rounded-lg px-2.5 py-1">
                        Install
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" />
                        </svg>
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
