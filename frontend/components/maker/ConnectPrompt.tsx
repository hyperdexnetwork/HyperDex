'use client';

import { useWallet } from '@/hooks/useWallet';

export default function ConnectPrompt() {
  const { connect, isConnecting } = useWallet();

  return (
    <div className="min-h-[calc(100vh-72px)] flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md bg-white rounded-2xl border border-black/8 shadow-sm p-10 text-center">

        {/* Icon */}
        <div className="w-14 h-14 rounded-full bg-lavender border border-lavender-mid flex items-center justify-center mx-auto mb-6">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1C1B2E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 12V22H4V12" />
            <path d="M22 7H2v5h20V7z" />
            <path d="M12 22V7" />
            <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
            <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
          </svg>
        </div>

        <h1 className="font-display text-2xl font-bold text-ink mb-2">
          Connect Your Wallet
        </h1>

        <p className="text-sm text-ink-muted leading-relaxed mb-8">
          Connect a Stellar wallet to apply as a market maker or access your maker dashboard.
        </p>

        <button
          onClick={() => connect()}
          disabled={isConnecting}
          className="w-full py-3.5 font-display text-sm font-bold bg-navy text-white rounded-xl hover:bg-navy-light transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isConnecting && (
            <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          )}
          {isConnecting ? 'Connecting…' : 'Connect Wallet'}
        </button>

        <p className="text-xs text-ink-muted mt-5">
          Requires the{' '}
          <a
            href="https://www.freighter.app"
            target="_blank"
            rel="noopener noreferrer"
            className="text-navy font-semibold hover:underline"
          >
            Freighter
          </a>
          {' '}browser extension on Stellar mainnet.
        </p>
      </div>
    </div>
  );
}
