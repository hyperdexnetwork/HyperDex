'use client';

import { useCallback, useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import { useWalletStore } from '@/store/walletStore';
import Toast from '@/components/Toast';
import {
  USDC_CONTRACT,
  EURC_CONTRACT,
  EXPLORER_BASE,
  FEE_DISTRIBUTOR_CONTRACT,
  ADMIN_ADDRESS,
  POOL_REGISTRY_CONTRACT,
  QUOTE_VERIFIER_CONTRACT,
} from '@/lib/constants';
import {
  fetchAdminMakers,
  fetchHealth,
  registerMakerInSystem,
  activateMaker,
  deactivateMaker,
} from '@/lib/api';
import {
  buildRegisterMakerTx,
  buildWithdrawFeesTx,
  getProtocolFeeBalances,
  submitTransaction,
  submitAndWait,
  getWalletAddress,
  isWalletConnected,
  signWithWallet,
  stroopsToHuman,
} from '@/lib/stellar';
import type { ToastState, AdminMakerRecord, HealthStatus } from '@/lib/types';
import AdminKeyGate from '@/components/admin/AdminKeyGate';

type Tab = 'makers' | 'register' | 'fees' | 'system';

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('makers');
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = (message: string, type: ToastState['type']) =>
    setToast({ message, type });

  return (
    <AdminKeyGate>
      <Navbar />
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      <main className="min-h-screen bg-cream pb-16" style={{ paddingTop: '80px' }}>
        <div className="max-w-5xl mx-auto px-6 md:px-10">

          {/* Page header */}
          <div className="pt-10 pb-7 flex items-end justify-between border-b border-black/8">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-ink-muted mb-1">
                Admin
              </p>
              <h1 className="font-display text-3xl font-bold text-ink leading-none">
                Dashboard
              </h1>
            </div>
            <span className="text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1 rounded-full">
              Internal use only
            </span>
          </div>

          {/* Tab nav */}
          <div className="flex border-b border-black/8 mt-0">
            {(['makers', 'register', 'fees', 'system'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`py-4 px-6 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors ${
                  tab === t
                    ? 'border-ink text-ink'
                    : 'border-transparent text-ink-muted hover:text-ink'
                }`}
              >
                {t === 'register' ? 'Register Maker' : t === 'makers' ? 'All Makers' : t === 'fees' ? 'Protocol Fees' : 'System'}
              </button>
            ))}
          </div>

          <div className="pt-8">
            {tab === 'makers'   && <MakersTab showToast={showToast} />}
            {tab === 'register' && <RegisterTab showToast={showToast} />}
            {tab === 'fees'     && <FeesTab showToast={showToast} />}
            {tab === 'system'   && <SystemTab />}
          </div>
        </div>
      </main>
    </AdminKeyGate>
  );
}

/* ── Makers Tab ─────────────────────────────────────────────────── */

function MakersTab({ showToast }: { showToast: (m: string, t: ToastState['type']) => void }) {
  const [makers, setMakers] = useState<AdminMakerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchAdminMakers();
      setMakers(data);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed to load makers', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (maker: AdminMakerRecord) => {
    setToggling(maker._id);
    try {
      if (maker.active) {
        await deactivateMaker(maker._id);
        showToast(`Deactivated ${maker.name}`, 'info');
      } else {
        await activateMaker(maker._id);
        showToast(`Activated ${maker.name}`, 'success');
      }
      await load();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Action failed', 'error');
    } finally {
      setToggling(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-ink-muted text-sm">
        <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
        Loading makers…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-muted">
          {makers.length} maker{makers.length !== 1 ? 's' : ''} registered
        </p>
        <button
          onClick={load}
          className="text-xs font-semibold text-ink-muted hover:text-ink transition-colors"
        >
          ↺ Refresh
        </button>
      </div>

      {makers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-black/8 p-12 text-center shadow-sm">
          <p className="text-sm font-semibold text-ink mb-1">No makers registered yet</p>
          <p className="text-xs text-ink-muted">Use the Register Maker tab to onboard a new maker</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-black/8 overflow-hidden shadow-sm">
          {/* Table header */}
          <div className="grid grid-cols-[2fr_3fr_2fr_1fr_1fr_auto] gap-4 px-5 py-3 border-b border-black/8 bg-cream/60">
            {['Name', 'Address', 'Status', 'Trades', 'Active', ''].map(h => (
              <span key={h} className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">
                {h}
              </span>
            ))}
          </div>

          {makers.map((maker, i) => (
            <div
              key={maker._id}
              className={`grid grid-cols-[2fr_3fr_2fr_1fr_1fr_auto] gap-4 px-5 py-4 items-center transition-colors hover:bg-cream/40 ${
                i < makers.length - 1 ? 'border-b border-black/5' : ''
              }`}
            >
              <span className="font-display text-sm font-bold text-ink truncate">{maker.name}</span>

              <a
                href={`${EXPLORER_BASE}/account/${maker.stellarAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-ink-muted hover:text-navy transition-colors"
                title={maker.stellarAddress}
              >
                {maker.stellarAddress.slice(0, 6)}…{maker.stellarAddress.slice(-6)}
              </a>

              <span className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full border w-fit ${
                maker.connectionStatus === 'connected'
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : 'bg-cream text-ink-muted border-black/10'
              }`}>
                {maker.connectionStatus}
              </span>

              <span className="text-sm text-ink font-semibold">{maker.totalTrades}</span>

              <span className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full border w-fit ${
                maker.active
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : 'bg-red-50 text-red-600 border-red-200'
              }`}>
                {maker.active ? 'yes' : 'no'}
              </span>

              <button
                onClick={() => handleToggle(maker)}
                disabled={toggling === maker._id}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                  toggling === maker._id
                    ? 'border-black/10 text-ink-muted/40 cursor-not-allowed'
                    : maker.active
                    ? 'border-red-200 text-red-600 hover:bg-red-50'
                    : 'border-green-200 text-green-700 hover:bg-green-50'
                }`}
              >
                {toggling === maker._id ? '…' : maker.active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          ))}
        </div>
      )}

      {makers.length > 0 && (
        <div className="space-y-3">
          {makers.map(maker => (
            <MakerDetailCard key={maker._id} maker={maker} />
          ))}
        </div>
      )}
    </div>
  );
}

function MakerDetailCard({ maker }: { maker: AdminMakerRecord }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-white rounded-2xl border border-black/8 overflow-hidden shadow-sm">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-cream/40 transition-colors"
      >
        <span className="text-xs font-semibold text-ink-muted">{maker.name} — details</span>
        <span className="text-xs text-ink-muted/60">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-5 py-4 border-t border-black/5 space-y-3">
          <InfoRow label="ID"           value={maker._id}               mono />
          <InfoRow label="Full Address" value={maker.stellarAddress}    mono />
          <InfoRow label="Signer Key"   value={`${maker.signerPublicKey.slice(0, 16)}…`} mono />
          <InfoRow label="Created"      value={new Date(maker.createdAt).toLocaleString()} />
          <InfoRow label="Last Seen"    value={maker.lastSeenAt ? new Date(maker.lastSeenAt).toLocaleString() : 'Never'} />
          <InfoRow label="Total Volume" value={String(maker.totalVolume)} />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted mb-2">
              Supported Pairs
            </p>
            <div className="flex flex-wrap gap-2">
              {maker.supportedPairs.map((p, i) => (
                <span
                  key={i}
                  className="font-mono text-xs text-navy bg-lavender/50 border border-lavender-mid px-3 py-0.5 rounded-full"
                >
                  {p.tokenIn.slice(0, 4)}…→{p.tokenOut.slice(0, 4)}…
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Register Tab ───────────────────────────────────────────────── */

type RegistrationPhase = 'form' | 'system_done' | 'onchain_done';

function RegisterTab({ showToast }: { showToast: (m: string, t: ToastState['type']) => void }) {
  const [name, setName]         = useState('');
  const [address, setAddress]   = useState('');
  const [signerKey, setSignerKey] = useState('');
  const [phase, setPhase]       = useState<RegistrationPhase>('form');
  const [apiKey, setApiKey]     = useState('');
  const [txHash, setTxHash]     = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  const [walletAddress, setWalletAddress]         = useState<string | null>(null);
  const [freighterInstalled, setFreighterInstalled] = useState<boolean | null>(null);
  const [signing, setSigning]                     = useState(false);

  useEffect(() => {
    isWalletConnected().then(setFreighterInstalled);
    getWalletAddress().then(a => { if (a) setWalletAddress(a); }).catch(() => {});
  }, []);

  const handleSystemRegister = async () => {
    if (!name.trim())                                    { showToast('Name is required', 'error'); return; }
    if (!/^G[A-Z2-7]{55}$/.test(address.trim()))        { showToast('Invalid Stellar address', 'error'); return; }
    if (!/^[0-9a-fA-F]{64}$/.test(signerKey.trim()))    { showToast('Signer key must be 64 hex chars', 'error'); return; }

    setLoading(true);
    try {
      const result = await registerMakerInSystem({
        stellarAddress: address.trim(),
        name: name.trim(),
        signerPublicKey: signerKey.trim(),
        supportedPairs: [
          { tokenIn: USDC_CONTRACT, tokenOut: EURC_CONTRACT },
          { tokenIn: EURC_CONTRACT, tokenOut: USDC_CONTRACT },
        ],
      });
      setApiKey(result.apiKey);
      setPhase('system_done');
      showToast('Maker registered in system — copy the API key!', 'success');
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Registration failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Delegates to the shared wallet picker — the admin page must not pin a
  // single wallet now that any supported one can sign.
  const handleConnect = () => {
    useWalletStore.getState().connect();
  };

  const handleOnchainRegister = async () => {
    if (!walletAddress) { showToast('Connect maker wallet first', 'error'); return; }
    if (walletAddress !== address.trim()) {
      showToast(`Connected wallet (${walletAddress.slice(0, 6)}…) must match the maker address`, 'error');
      return;
    }
    setSigning(true);
    try {
      const xdr    = await buildRegisterMakerTx(walletAddress, signerKey.trim());
      const signed = await signWithWallet(xdr);
      const hash   = await submitTransaction(signed);
      setTxHash(hash);
      setPhase('onchain_done');
      showToast('On-chain registration submitted!', 'success');
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'On-chain registration failed', 'error');
    } finally {
      setSigning(false);
    }
  };

  const handleReset = () => {
    setName(''); setAddress(''); setSignerKey('');
    setPhase('form'); setApiKey(''); setTxHash(null); setWalletAddress(null);
  };

  return (
    <div className="space-y-5 max-w-2xl">

      {/* Step indicators */}
      <div className="flex gap-5">
        {[
          { step: 1, label: 'System Registration', done: phase !== 'form' },
          { step: 2, label: 'On-Chain Registration', done: phase === 'onchain_done' },
        ].map(({ step, label, done }) => (
          <div key={step} className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all ${
              done
                ? 'border-navy bg-navy text-white'
                : 'border-black/20 text-ink-muted'
            }`}>
              {done ? '✓' : step}
            </div>
            <span className={`text-xs font-semibold ${done ? 'text-navy' : 'text-ink-muted'}`}>{label}</span>
          </div>
        ))}
      </div>

      {/* Step 1 */}
      <div className={`bg-white rounded-2xl border shadow-sm p-6 transition-all ${
        phase !== 'form' ? 'border-navy/20 bg-lavender/10' : 'border-black/8'
      }`}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-display text-xl font-bold text-ink">Step 1 — Register in System</h2>
          {phase !== 'form' && (
            <span className="text-[10px] font-bold uppercase tracking-widest text-navy bg-lavender/60 border border-lavender-mid px-2.5 py-0.5 rounded-full">
              Done
            </span>
          )}
        </div>
        <p className="text-sm text-ink-muted mb-5">
          Creates the maker record in MongoDB and generates an API key for the maker SDK.
        </p>

        <div className="space-y-4">
          <Field label="Maker Name">
            <input
              type="text"
              placeholder="e.g. Acme Market Maker"
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={phase !== 'form'}
              className="w-full bg-cream border border-black/10 px-4 py-3 text-sm text-ink placeholder-ink-muted/40 outline-none focus:border-black/20 disabled:opacity-40 rounded-xl transition-colors"
            />
          </Field>

          <Field label="Maker Stellar Address">
            <input
              type="text"
              placeholder="G…"
              value={address}
              onChange={e => setAddress(e.target.value)}
              disabled={phase !== 'form'}
              className="w-full bg-cream border border-black/10 px-4 py-3 font-mono text-sm text-ink placeholder-ink-muted/40 outline-none focus:border-black/20 disabled:opacity-40 rounded-xl transition-colors"
            />
          </Field>

          <Field label="Signer Public Key (ed25519 hex, 64 chars)">
            <input
              type="text"
              placeholder="f89265fbd7803601…"
              value={signerKey}
              onChange={e => setSignerKey(e.target.value)}
              disabled={phase !== 'form'}
              className="w-full bg-cream border border-black/10 px-4 py-3 font-mono text-sm text-ink placeholder-ink-muted/40 outline-none focus:border-black/20 disabled:opacity-40 rounded-xl transition-colors"
            />
          </Field>

          {phase === 'form' && (
            <button
              onClick={handleSystemRegister}
              disabled={loading}
              className="w-full py-3.5 font-display text-sm font-bold bg-navy text-white rounded-xl hover:bg-navy-light transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
              {loading ? 'Registering…' : 'Register in System'}
            </button>
          )}
        </div>

        {apiKey && (
          <div className="mt-5 p-4 border border-amber-200 bg-amber-50 rounded-xl space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700">
              API Key — copy now, shown once
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-xs text-ink bg-white border border-amber-200 px-3 py-2 rounded-lg break-all">
                {apiKey}
              </code>
              <button
                onClick={() => { navigator.clipboard.writeText(apiKey); showToast('API key copied!', 'success'); }}
                className="shrink-0 px-3 py-2 border border-black/12 bg-white font-semibold text-xs text-ink-muted hover:text-ink rounded-lg transition-colors"
              >
                Copy
              </button>
            </div>
            <p className="text-xs text-ink-muted">
              Add to <code className="font-mono text-ink">maker-sdk/.env</code> as{' '}
              <code className="font-mono text-ink">MAKER_API_KEY</code>
            </p>
          </div>
        )}
      </div>

      {/* Step 2 */}
      {phase !== 'form' && (
        <div className={`bg-white rounded-2xl border shadow-sm p-6 transition-all ${
          phase === 'onchain_done' ? 'border-navy/20 bg-lavender/10' : 'border-black/8'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-display text-xl font-bold text-ink">Step 2 — Register On-Chain</h2>
            {phase === 'onchain_done' && (
              <span className="text-[10px] font-bold uppercase tracking-widest text-navy bg-lavender/60 border border-lavender-mid px-2.5 py-0.5 rounded-full">
                Done
              </span>
            )}
          </div>
          <p className="text-sm text-ink-muted mb-5">
            Writes the maker and signer key to the{' '}
            <code className="font-mono text-xs text-ink">pool_registry</code> contract.
            The <strong className="text-ink">maker&apos;s Freighter wallet</strong> must be connected.
          </p>

          {phase !== 'onchain_done' && (
            <>
              {walletAddress ? (
                <div className="mb-4 flex items-center justify-between bg-cream border border-black/10 px-4 py-3 rounded-xl">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted mb-0.5">
                      Connected Wallet
                    </p>
                    <p className="font-mono text-sm text-ink">{walletAddress}</p>
                    {walletAddress !== address.trim() && (
                      <p className="text-xs text-red-600 mt-1">
                        ⚠ Must match maker address: {address.trim().slice(0, 8)}…
                      </p>
                    )}
                  </div>
                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                    walletAddress === address.trim() ? 'bg-green-500' : 'bg-red-500'
                  }`} />
                </div>
              ) : (
                <div className="mb-4">
                  {freighterInstalled === false ? (
                    <a
                      href="https://www.freighter.app"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full py-3 text-center font-display text-sm font-bold text-navy border border-navy/20 rounded-xl hover:bg-lavender/30 transition-colors"
                    >
                      Install Freighter Wallet
                    </a>
                  ) : (
                    <button
                      onClick={handleConnect}
                      className="w-full py-3 font-display text-sm font-bold border border-black/12 text-ink-muted rounded-xl hover:text-ink hover:border-black/20 transition-colors"
                    >
                      Connect Maker&apos;s Wallet
                    </button>
                  )}
                </div>
              )}

              <button
                onClick={handleOnchainRegister}
                disabled={signing || !walletAddress || walletAddress !== address.trim()}
                className="w-full py-3.5 font-display text-sm font-bold bg-navy text-white rounded-xl hover:bg-navy-light transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {signing && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                {signing ? 'Submitting…' : 'Register On-Chain'}
              </button>
            </>
          )}

          {txHash && (
            <div className="mt-4 flex items-center gap-3 bg-lavender/30 border border-lavender-mid rounded-xl px-4 py-3">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1C1B2E" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <div>
                <p className="text-xs font-semibold text-navy mb-0.5">On-chain registration confirmed</p>
                <a
                  href={`${EXPLORER_BASE}/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-ink-muted hover:text-ink transition-colors"
                >
                  View on Explorer →
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Completion */}
      {phase === 'onchain_done' && (
        <div className="bg-white rounded-2xl border border-navy/20 bg-lavender/10 shadow-sm p-6 space-y-3">
          <h3 className="font-display text-lg font-bold text-navy">Maker Onboarding Complete</h3>
          <ul className="space-y-1.5 text-sm text-ink-muted">
            <li className="flex items-center gap-2"><span className="text-green-600 font-bold">✓</span> Registered in MongoDB</li>
            <li className="flex items-center gap-2"><span className="text-green-600 font-bold">✓</span> API key generated</li>
            <li className="flex items-center gap-2"><span className="text-green-600 font-bold">✓</span> Registered on-chain in pool_registry</li>
          </ul>
          <p className="text-xs text-ink-muted pt-1">
            Next: maker adds API key to{' '}
            <code className="font-mono text-ink">maker-sdk/.env</code> and runs{' '}
            <code className="font-mono text-ink">npm run dev</code>
          </p>
          <button
            onClick={handleReset}
            className="text-xs font-semibold text-ink-muted hover:text-ink transition-colors underline underline-offset-4 mt-1"
          >
            Register another maker
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Protocol Fees Tab ──────────────────────────────────────────── */

function FeesTab({ showToast }: { showToast: (m: string, t: ToastState['type']) => void }) {
  const [balances, setBalances]   = useState<{ usdc: bigint; eurc: bigint } | null>(null);
  const [loading, setLoading]     = useState(true);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [txHash, setTxHash]       = useState<string | null>(null);

  const [walletAddress, setWalletAddress]           = useState<string | null>(null);
  const [freighterInstalled, setFreighterInstalled] = useState<boolean | null>(null);

  const isAdminWallet = !ADMIN_ADDRESS || walletAddress === ADMIN_ADDRESS;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBalances(await getProtocolFeeBalances());
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed to load fee balances', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
    isWalletConnected().then(setFreighterInstalled);
    getWalletAddress().then(a => { if (a) setWalletAddress(a); }).catch(() => {});
  }, [load]);

  // Delegates to the shared wallet picker — the admin page must not pin a
  // single wallet now that any supported one can sign.
  const handleConnect = () => {
    useWalletStore.getState().connect();
  };

  const handleWithdraw = async (tokenContract: string, symbol: string) => {
    if (!walletAddress) { showToast('Connect the admin wallet first', 'error'); return; }
    setWithdrawing(symbol);
    setTxHash(null);
    try {
      const xdr    = await buildWithdrawFeesTx(walletAddress, tokenContract);
      const signed = await signWithWallet(xdr);
      const hash   = await submitAndWait(signed);
      setTxHash(hash);
      showToast(`${symbol} fees withdrawn to treasury!`, 'success');
      await load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Withdrawal failed';
      // Old (pre-fix) fee_distributor: internal counter is 0, so it panics
      // NoFeesToWithdraw even when tokens are present.
      if (/Error\(Contract, #[34]\)/.test(msg)) {
        showToast(
          'Contract reports no withdrawable fees. If balances above are non-zero, this deployment has the fee-accounting bug — redeploy the fixed fee_distributor.',
          'error',
        );
      } else {
        showToast(msg, 'error');
      }
    } finally {
      setWithdrawing(null);
    }
  };

  const tokens = [
    { symbol: 'USDC', contract: USDC_CONTRACT, amount: balances?.usdc ?? 0n },
    { symbol: 'EURC', contract: EURC_CONTRACT, amount: balances?.eurc ?? 0n },
  ];

  return (
    <div className="space-y-5 max-w-2xl">

      {/* Accumulated balances */}
      <div className="bg-white rounded-2xl border border-black/8 shadow-sm p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-display text-xl font-bold text-ink">Accumulated Protocol Fees</h2>
          <button
            onClick={load}
            className="text-xs font-semibold text-ink-muted hover:text-ink transition-colors"
          >
            ↺ Refresh
          </button>
        </div>
        <p className="text-sm text-ink-muted mb-6">
          Swap fees collect in the{' '}
          <code className="font-mono text-xs text-ink">fee_distributor</code> contract until
          withdrawn to the treasury wallet by the admin.
        </p>

        {!FEE_DISTRIBUTOR_CONTRACT ? (
          <p className="text-sm text-red-600">
            NEXT_PUBLIC_FEE_DISTRIBUTOR_CONTRACT is not set — add it to frontend/.env.local
          </p>
        ) : loading ? (
          <div className="flex items-center gap-2 text-ink-muted text-sm">
            <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
            Loading balances…
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {tokens.map(({ symbol, contract, amount }) => (
              <div key={symbol} className="bg-cream border border-black/8 rounded-xl p-5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted mb-1">
                  {symbol}
                </p>
                <p className="font-display text-2xl font-bold text-ink mb-4 break-all">
                  {stroopsToHuman(amount)}
                </p>
                <button
                  onClick={() => handleWithdraw(contract, symbol)}
                  disabled={withdrawing !== null || amount === 0n || !walletAddress || !isAdminWallet}
                  className="w-full py-2.5 font-display text-xs font-bold bg-navy text-white rounded-lg hover:bg-navy-light transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {withdrawing === symbol && (
                    <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  )}
                  {withdrawing === symbol ? 'Withdrawing…' : `Withdraw ${symbol}`}
                </button>
              </div>
            ))}
          </div>
        )}

        {txHash && (
          <div className="mt-4 flex items-center gap-3 bg-lavender/30 border border-lavender-mid rounded-xl px-4 py-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1C1B2E" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <div>
              <p className="text-xs font-semibold text-navy mb-0.5">Withdrawal confirmed</p>
              <a
                href={`${EXPLORER_BASE}/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-ink-muted hover:text-ink transition-colors"
              >
                View on Explorer →
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Admin wallet */}
      <div className="bg-white rounded-2xl border border-black/8 shadow-sm p-6">
        <h3 className="font-display text-lg font-bold text-ink mb-1">Admin Wallet</h3>
        <p className="text-sm text-ink-muted mb-4">
          Withdrawals must be signed by the fee_distributor admin
          {ADMIN_ADDRESS && (
            <> (<code className="font-mono text-xs text-ink">{ADMIN_ADDRESS.slice(0, 6)}…{ADMIN_ADDRESS.slice(-6)}</code>)</>
          )}.
        </p>

        {walletAddress ? (
          <div className="flex items-center justify-between bg-cream border border-black/10 px-4 py-3 rounded-xl">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted mb-0.5">
                Connected Wallet
              </p>
              <p className="font-mono text-sm text-ink">{walletAddress}</p>
              {!isAdminWallet && (
                <p className="text-xs text-red-600 mt-1">
                  ⚠ This is not the admin wallet — withdrawals will be rejected on-chain
                </p>
              )}
            </div>
            <div className={`w-2 h-2 rounded-full shrink-0 ${isAdminWallet ? 'bg-green-500' : 'bg-red-500'}`} />
          </div>
        ) : freighterInstalled === false ? (
          <a
            href="https://www.freighter.app"
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full py-3 text-center font-display text-sm font-bold text-navy border border-navy/20 rounded-xl hover:bg-lavender/30 transition-colors"
          >
            Install Freighter Wallet
          </a>
        ) : (
          <button
            onClick={handleConnect}
            className="w-full py-3 font-display text-sm font-bold border border-black/12 text-ink-muted rounded-xl hover:text-ink hover:border-black/20 transition-colors"
          >
            Connect Admin Wallet
          </button>
        )}
      </div>

      {/* Contract info */}
      <div className="bg-white rounded-2xl border border-black/8 shadow-sm p-5 space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">
          Fee Flow
        </p>
        <InfoRow label="Fee Distributor" value={FEE_DISTRIBUTOR_CONTRACT || '—'} mono />
        <InfoRow label="Treasury"        value={ADMIN_ADDRESS || 'set at deploy (initialize)'} mono />
        <p className="text-xs text-ink-muted pt-1">
          <code className="font-mono text-ink">withdraw_fees</code> sweeps the contract&apos;s full
          balance of a token to the treasury — there are no partial withdrawals.
        </p>
      </div>
    </div>
  );
}

/* ── System Tab ─────────────────────────────────────────────────── */

function SystemTab() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try { setHealth(await fetchHealth()); } catch {}
      finally { setLoading(false); }
    };
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-5 max-w-xl">

      {/* Health card */}
      <div className="bg-white rounded-2xl border border-black/8 shadow-sm p-6">
        <h2 className="font-display text-xl font-bold text-ink mb-5">System Health</h2>
        {loading ? (
          <div className="flex items-center gap-2 text-ink-muted text-sm">
            <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
            Loading…
          </div>
        ) : health ? (
          <div className="space-y-3">
            <InfoRow label="Status"              value={health.status.toUpperCase()} highlight={health.status === 'ok'} />
            <InfoRow label="Active Makers"       value={String(health.activeMakers)} />
            <InfoRow label="Price Book Entries"  value={String(health.priceBookEntries)} />
            <InfoRow label="Database"            value={health.dbStatus} />
          </div>
        ) : (
          <p className="text-sm text-red-600">Backend unreachable — is it running on :4000?</p>
        )}
      </div>

      {/* Endpoints card */}
      <div className="bg-white rounded-2xl border border-black/8 shadow-sm p-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted mb-4">
          Service Endpoints
        </p>
        <div className="space-y-2.5">
          {[
            { label: 'Frontend',   url: 'http://localhost:3000' },
            { label: 'Backend API', url: 'http://localhost:4000' },
            { label: 'Maker SDK',  url: 'http://localhost:3001' },
          ].map(({ label, url }) => (
            <div key={label} className="flex justify-between items-center">
              <span className="text-xs text-ink-muted">{label}</span>
              <span className="font-mono text-xs text-ink">{url}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Contracts card */}
      <div className="bg-white rounded-2xl border border-black/8 shadow-sm p-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted mb-4">
          Deployed Contracts
        </p>
        <div className="space-y-2.5">
          {[
            { label: 'Pool Registry',   env: POOL_REGISTRY_CONTRACT },
            { label: 'Quote Verifier',  env: QUOTE_VERIFIER_CONTRACT },
            { label: 'USDC SAC',        env: USDC_CONTRACT },
            { label: 'EURC SAC',        env: EURC_CONTRACT },
          ].map(({ label, env }) => (
            <div key={label} className="flex justify-between items-center gap-4">
              <span className="text-xs text-ink-muted shrink-0">{label}</span>
              <span className="font-mono text-xs text-ink truncate">{env ?? '—'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Shared helpers ─────────────────────────────────────────────── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted mb-2">{label}</p>
      {children}
    </div>
  );
}

function InfoRow({ label, value, highlight, mono }: {
  label: string;
  value: string;
  highlight?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between items-center gap-4">
      <span className="text-xs text-ink-muted shrink-0">{label}</span>
      <span className={`text-xs font-bold truncate ${highlight ? 'text-green-600' : 'text-ink'} ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  );
}
