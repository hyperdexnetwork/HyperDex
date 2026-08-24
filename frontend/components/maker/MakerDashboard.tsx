'use client';

import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '@/hooks/useWallet';
import {
  signWithWallet,
  submitAndWait,
  submitTransaction,
  stroopsToHuman,
  humanToStroops,
  getOnChainSignerKey,
  buildUpdateSignerTx,
} from '@/lib/stellar';
import { buildDepositTx, buildWithdrawTx } from '@/lib/stellar/maker-pool';
import { USDC_CONTRACT, EURC_CONTRACT, BACKEND_URL, EXPLORER_BASE } from '@/lib/constants';
import type { InventoryData } from '@/hooks/useMakerState';
import type { TradeRecord } from '@/lib/types';

interface Props {
  inventoryData: InventoryData | null;
  onRefresh: (forceRefresh?: boolean) => void;
}

type Tab = 'overview' | 'inventory' | 'rate_limits' | 'history';

interface MakerStatusData {
  success: boolean;
  maker: {
    name: string;
    stellarAddress: string;
    active: boolean;
    connectionStatus: string;
    lastSeenAt: string | null;
    supportedPairs: { tokenIn: string; tokenOut: string }[];
    totalTrades: number;
    totalVolume: number;
    totalFeesEarned: number;
  };
  stats24h: { trades: number; volume: number; fees: number };
  priceLevels: { pair: string; sellLevels: { quantity: string; price: string }[]; buyLevels: { quantity: string; price: string }[]; updatedAt: number; stale: boolean }[] | null;
  isConnected: boolean;
}

const TAB_LABELS: Record<Tab, string> = {
  overview:    'Overview',
  inventory:   'Inventory',
  rate_limits: 'Rate Limits',
  history:     'History',
};

export default function MakerDashboard({ inventoryData, onRefresh }: Props) {
  const { address } = useWallet();
  const [tab, setTab] = useState<Tab>('overview');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  if (!address) return null;

  return (
    <div className="pb-16">
      <div className="max-w-4xl mx-auto px-6 md:px-10">

        {/* Page header */}
        <div className="pt-10 pb-6 flex items-end justify-between border-b border-black/8">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-ink-muted mb-1">Maker Programme</p>
            <h1 className="font-display text-3xl font-bold text-ink leading-none">Dashboard</h1>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-full">
            Active
          </span>
        </div>

        {/* Toast */}
        {toast && (
          <div className={`mt-4 px-4 py-3 rounded-xl text-sm border ${
            toast.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' :
            toast.type === 'error'   ? 'bg-red-50 border-red-200 text-red-600' :
                                       'bg-blue-50 border-blue-200 text-blue-700'
          }`}>
            {toast.message}
          </div>
        )}

        {/* Tab nav */}
        <div className="flex border-b border-black/8">
          {(Object.keys(TAB_LABELS) as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`py-4 px-5 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors ${
                tab === t
                  ? 'border-ink text-ink'
                  : 'border-transparent text-ink-muted hover:text-ink'
              }`}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        <div className="pt-7">
          {tab === 'overview'    && <OverviewTab    address={address} inventoryData={inventoryData} onGoToInventory={() => setTab('inventory')} refetch={onRefresh} />}
          {tab === 'inventory'   && <InventoryTab   makerAddress={address} inventoryData={inventoryData} showToast={showToast} refetch={onRefresh} />}
          {tab === 'rate_limits' && <RateLimitsTab  makerAddress={address} />}
          {tab === 'history'     && <HistoryTab     makerAddress={address} />}
        </div>
      </div>
    </div>
  );
}

/* ── Overview Tab ─────────────────────────────────────────────────── */

function OverviewTab({ address, inventoryData, onGoToInventory, refetch }: {
  address: string;
  inventoryData: InventoryData | null;
  onGoToInventory: () => void;
  refetch: () => void;
}) {
  const [makerData, setMakerData] = useState<MakerStatusData | null>(null);
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [copied, setCopied] = useState(false);

  const fetchMakerData = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/makers/${address}/status`);
      if (res.ok) setMakerData(await res.json());
    } catch {}
  }, [address]);

  useEffect(() => {
    fetchMakerData();
    fetch(`${BACKEND_URL}/api/trades?makerAddress=${address}&limit=5`)
      .then(r => r.json())
      .then(d => setTrades(d.trades ?? []))
      .catch(() => {});
  }, [address, fetchMakerData]);

  useEffect(() => {
    const t = setInterval(() => { fetchMakerData(); refetch(); }, 30_000);
    return () => clearInterval(t);
  }, [fetchMakerData, refetch]);

  const isConn = makerData?.isConnected ?? false;
  const stats  = makerData?.stats24h;
  const pl     = makerData?.priceLevels;

  return (
    <div className="space-y-5">

      {/* SDK status banner */}
      <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm font-semibold ${
        isConn
          ? 'bg-green-50 border-green-200 text-green-700'
          : 'bg-amber-50 border-amber-200 text-amber-700'
      }`}>
        <span className={`w-2 h-2 rounded-full shrink-0 ${isConn ? 'bg-green-500' : 'bg-amber-500'}`} />
        {isConn ? 'SDK Online — streaming price levels' : 'SDK Offline — run npm run dev to start'}
      </div>

      {/* Stat cards */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="24h Trades"   value={String(stats.trades)} />
          <StatCard label="24h Volume"   value={`$${stats.volume.toFixed(2)}`} />
          <StatCard label="24h Fees"     value={`$${stats.fees.toFixed(4)}`} />
          <StatCard label="Total Volume" value={`$${(makerData?.maker.totalVolume ?? 0).toFixed(2)}`} />
        </div>
      )}

      {/* Pool balances + Price levels */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="bg-white rounded-2xl border border-black/8 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-bold text-ink">Pool Balances</h3>
            <button onClick={onGoToInventory} className="text-xs font-semibold text-navy hover:underline">Manage →</button>
          </div>
          {inventoryData ? (
            <div className="space-y-3">
              <BalanceRow label="USDC" vault={inventoryData.vault.usdc} wallet={inventoryData.wallet.usdc} />
              <BalanceRow label="EURC" vault={inventoryData.vault.eurc} wallet={inventoryData.wallet.eurc} />
            </div>
          ) : (
            <p className="text-xs text-ink-muted">Loading…</p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-black/8 shadow-sm p-5">
          <h3 className="font-display font-bold text-ink mb-4">Price Levels</h3>
          {pl && pl.length > 0 ? (
            <div className="space-y-3">
              {pl.map(entry => (
                <div key={entry.pair}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted mb-1">
                    {entry.pair.split(':').map((s: string) => s.slice(0, 6)).join('→')}
                    {entry.stale && <span className="ml-2 text-amber-600">(stale)</span>}
                  </p>
                  {(entry.sellLevels ?? []).slice(0, 2).map((l, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-ink-muted">{stroopsToHuman(l.quantity, 7)}</span>
                      <span className="font-semibold text-ink">{l.price}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-ink-muted">
              No price levels yet. Start the SDK with{' '}
              <code className="font-mono text-navy">npm run dev</code>.
            </p>
          )}
        </div>
      </div>

      {/* Pool contract */}
      <div className="bg-white rounded-2xl border border-black/8 shadow-sm p-5">
        <h3 className="font-display font-bold text-ink mb-3">Pool Contract</h3>
        {inventoryData?.poolAddress ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <code className="font-mono text-xs text-ink-muted flex-1 break-all">{inventoryData.poolAddress}</code>
              <button
                onClick={async () => { await navigator.clipboard.writeText(inventoryData.poolAddress!); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                className="shrink-0 text-xs font-semibold text-navy hover:underline"
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            <a
              href={`${EXPLORER_BASE}/contract/${inventoryData.poolAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-ink-muted hover:text-ink transition-colors inline-block"
            >
              View on Explorer →
            </a>
          </div>
        ) : (
          <p className="text-xs text-ink-muted">Pool contract not deployed yet.</p>
        )}
      </div>

      <SignerKeyCard address={address} />

      {/* Recent trades */}
      <div className="bg-white rounded-2xl border border-black/8 shadow-sm p-5">
        <h3 className="font-display font-bold text-ink mb-4">Recent Trades</h3>
        {trades.length === 0 ? (
          <p className="text-xs text-ink-muted">No trades yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  {['Time', 'Pair', 'Amount In', 'Amount Out', 'Status'].map(h => (
                    <th key={h} className="text-left text-[10px] font-bold uppercase tracking-widest text-ink-muted pb-3 pr-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trades.map(t => (
                  <tr key={t.quoteId} className="border-t border-black/5">
                    <td className="text-xs text-ink-muted py-2.5 pr-4">{new Date(t.quotedAt).toLocaleTimeString()}</td>
                    <td className="text-xs font-semibold text-ink py-2.5 pr-4">{t.tokenIn === USDC_CONTRACT ? 'USDC→EURC' : 'EURC→USDC'}</td>
                    <td className="font-mono text-xs text-ink py-2.5 pr-4">{stroopsToHuman(t.amountIn)}</td>
                    <td className="font-mono text-xs text-ink py-2.5 pr-4">{stroopsToHuman(t.amountOut)}</td>
                    <td className="py-2.5"><StatusBadge status={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Inventory Tab ──────────────────────────────────────────────────── */

function parseDepositError(raw: string, token: string): string {
  if (raw.includes('#10') || raw.includes('not within the allowed range') || raw.includes('InsufficientBalance'))
    return `Insufficient ${token} balance in your wallet. Fund your wallet with ${token} on Stellar mainnet.`;
  if (raw.includes('#13') || raw.includes('trustline entry is missing'))
    return `${token} trustline not set up. Add a ${token} trustline in your Stellar wallet first, then fund it with ${token}.`;
  if (raw.includes('Transaction failed on-chain') || raw.includes('TX failed'))
    return `${token} deposit failed on-chain. Ensure your wallet has sufficient ${token} balance`;
  return raw;
}

type DepositPhase = 'idle' | 'simulating' | 'awaiting_freighter' | 'confirming' | 'success' | 'error';

const PHASE_LABEL: Record<DepositPhase, string> = {
  idle: '', simulating: 'Preparing transaction…', awaiting_freighter: 'Approve in Freighter…',
  confirming: 'Confirming on Stellar…', success: '', error: '',
};
const PHASE_PROGRESS: Record<DepositPhase, number> = {
  idle: 0, simulating: 25, awaiting_freighter: 50, confirming: 80, success: 100, error: 0,
};

function InventoryTab({ makerAddress, inventoryData, showToast, refetch }: {
  makerAddress: string;
  inventoryData: InventoryData | null;
  showToast: (m: string, t: 'success' | 'error' | 'info') => void;
  refetch: (forceRefresh?: boolean) => void;
}) {
  const [depositToken, setDepositToken]   = useState<'usdc' | 'eurc'>('usdc');
  const [depositAmount, setDepositAmount] = useState('');
  const [depositPhase, setDepositPhase]   = useState<DepositPhase>('idle');
  const [depositError, setDepositError]   = useState('');
  const [depositedAmount, setDepositedAmount] = useState('');

  const [withdrawToken, setWithdrawToken]     = useState<'usdc' | 'eurc'>('usdc');
  const [withdrawAmount, setWithdrawAmount]   = useState('');
  const [withdrawing, setWithdrawing]         = useState(false);
  const [lastTx, setLastTx]                   = useState<string | null>(null);

  const poolAddress     = inventoryData?.poolAddress ?? null;
  const depositTokenAddr = depositToken === 'usdc' ? USDC_CONTRACT : EURC_CONTRACT;
  const isBusy = depositPhase !== 'idle' && depositPhase !== 'success' && depositPhase !== 'error';

  const handleDeposit = async () => {
    if (!poolAddress) { showToast('Pool contract not deployed', 'error'); return; }
    let stroops: bigint;
    try { stroops = humanToStroops(depositAmount); } catch { showToast('Invalid amount', 'error'); return; }
    if (stroops <= 0n) { showToast('Amount must be > 0', 'error'); return; }
    const tokenUpper = depositToken.toUpperCase();
    const walletRaw = depositToken === 'usdc' ? (inventoryData?.wallet.usdc ?? '0') : (inventoryData?.wallet.eurc ?? '0');
    if (BigInt(walletRaw) < stroops) {
      showToast(`Insufficient ${tokenUpper}: wallet has ${stroopsToHuman(walletRaw)}, need ${depositAmount}. Fund your wallet with ${tokenUpper} on Stellar mainnet.`, 'error');
      return;
    }
    setDepositError('');
    try {
      setDepositPhase('simulating');
      const depositXdr = await buildDepositTx(makerAddress, poolAddress, depositTokenAddr, stroops);
      setDepositPhase('awaiting_freighter');
      const signedDeposit = await signWithWallet(depositXdr);
      setDepositPhase('confirming');
      await submitAndWait(signedDeposit);
      setDepositedAmount(depositAmount);
      setDepositPhase('success');
      setDepositAmount('');
      setTimeout(() => refetch(true), 3000);
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : String(e);
      setDepositError(parseDepositError(raw, depositToken.toUpperCase()));
      setDepositPhase('error');
    }
  };

  const handleWithdraw = async () => {
    if (!poolAddress) { showToast('Pool contract not deployed', 'error'); return; }
    const tokenAddress = withdrawToken === 'usdc' ? USDC_CONTRACT : EURC_CONTRACT;
    let stroops: bigint;
    try { stroops = humanToStroops(withdrawAmount); } catch { showToast('Invalid amount', 'error'); return; }
    if (stroops <= 0n) { showToast('Amount must be > 0', 'error'); return; }
    setWithdrawing(true);
    try {
      const xdr    = await buildWithdrawTx(makerAddress, poolAddress, tokenAddress, stroops);
      const signed = await signWithWallet(xdr);
      const hash   = await submitTransaction(signed);
      setLastTx(hash);
      showToast(`Withdrew ${withdrawAmount} ${withdrawToken.toUpperCase()}`, 'success');
      setWithdrawAmount('');
      setTimeout(() => refetch(true), 5000);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Withdraw failed', 'error');
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <div className="space-y-5">

      {/* Pool Balances */}
      <div className="bg-white rounded-2xl border border-black/8 shadow-sm p-6">
        <h2 className="font-display text-xl font-bold text-ink mb-5">Pool Balances</h2>
        {inventoryData ? (
          <>
            <div className="grid grid-cols-2 gap-4 mb-3">
              {(['USDC', 'EURC'] as const).map(tok => {
                const key = tok.toLowerCase() as 'usdc' | 'eurc';
                return (
                  <div key={tok} className="bg-cream rounded-xl border border-black/8 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted mb-2">{tok}</p>
                    <p className="font-display text-2xl font-bold text-ink">{inventoryData.vault[key]}</p>
                    <p className="text-xs text-ink-muted mt-1">Wallet: {inventoryData.wallet[key]}</p>
                  </div>
                );
              })}
            </div>
            {poolAddress && (
              <p className="text-xs text-ink-muted">
                Pool: <code className="font-mono text-ink">{poolAddress.slice(0, 10)}…{poolAddress.slice(-8)}</code>
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-ink-muted">Loading…</p>
        )}
      </div>

      {/* Deposit */}
      <div className="bg-white rounded-2xl border border-black/8 shadow-sm p-6">
        <h3 className="font-display text-lg font-bold text-ink mb-4">Deposit to Pool</h3>
        {!poolAddress && (
          <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
            Deploy your pool contract first (Setup Step 3).
          </p>
        )}
        {depositPhase === 'idle' && (
          <>
            <div className="flex gap-3 mb-4">
              <select
                value={depositToken}
                onChange={e => setDepositToken(e.target.value as 'usdc' | 'eurc')}
                className="bg-cream border border-black/10 px-3 py-2.5 text-sm text-ink rounded-xl outline-none"
              >
                <option value="usdc">USDC</option>
                <option value="eurc">EURC</option>
              </select>
              <input
                type="number" min="0" step="any" placeholder="Amount"
                value={depositAmount}
                onChange={e => setDepositAmount(e.target.value)}
                className="flex-1 bg-cream border border-black/10 px-4 py-2.5 text-sm text-ink placeholder-ink-muted/40 outline-none focus:border-black/20 rounded-xl transition-colors"
              />
            </div>
            <p className="text-xs text-ink-muted mb-3">Single transaction — tokens transfer directly to your pool.</p>
            <button
              onClick={handleDeposit}
              disabled={!depositAmount || !poolAddress}
              className={`w-full py-3 font-display text-sm font-bold rounded-xl transition-colors ${
                depositAmount && poolAddress
                  ? 'bg-navy text-white hover:bg-navy-light'
                  : 'bg-black/5 text-ink-muted cursor-not-allowed'
              }`}
            >
              Deposit
            </button>
          </>
        )}
        {isBusy && (
          <div className="py-4 space-y-4">
            <div className="w-full h-1.5 bg-black/8 rounded-full">
              <div
                className="h-1.5 bg-navy rounded-full transition-all duration-500"
                style={{ width: `${PHASE_PROGRESS[depositPhase]}%` }}
              />
            </div>
            <div className="flex items-center gap-3">
              <span className="w-4 h-4 border-2 border-navy border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-ink-muted">{PHASE_LABEL[depositPhase]}</span>
            </div>
          </div>
        )}
        {depositPhase === 'success' && (
          <div className="text-center py-4">
            <p className="text-sm font-semibold text-green-700">✓ Deposited {depositedAmount} {depositToken.toUpperCase()} into pool</p>
            <button onClick={() => setDepositPhase('idle')} className="text-xs text-ink-muted hover:text-ink mt-3 transition-colors underline underline-offset-4">
              Deposit More
            </button>
          </div>
        )}
        {depositPhase === 'error' && (
          <div className="p-4 border border-red-200 bg-red-50 rounded-xl space-y-3">
            <p className="text-sm font-semibold text-red-600">✗ Deposit failed</p>
            <p className="text-xs text-ink-muted">{depositError}</p>
            <div className="flex gap-3">
              <button onClick={handleDeposit} className="px-4 py-2 text-xs font-semibold border border-black/12 text-ink rounded-lg hover:border-black/20 transition-colors">Try Again</button>
              <button onClick={() => setDepositPhase('idle')} className="px-4 py-2 text-xs text-ink-muted hover:text-ink transition-colors">Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* Withdraw */}
      <div className="bg-white rounded-2xl border border-black/8 shadow-sm p-6">
        <h3 className="font-display text-lg font-bold text-ink mb-4">Withdraw from Pool</h3>
        {!poolAddress && (
          <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
            Deploy your pool contract first.
          </p>
        )}
        <div className="flex gap-3 mb-4">
          <select
            value={withdrawToken}
            onChange={e => setWithdrawToken(e.target.value as 'usdc' | 'eurc')}
            className="bg-cream border border-black/10 px-3 py-2.5 text-sm text-ink rounded-xl outline-none"
          >
            <option value="usdc">USDC</option>
            <option value="eurc">EURC</option>
          </select>
          <input
            type="number" min="0" step="any" placeholder="Amount"
            value={withdrawAmount}
            onChange={e => setWithdrawAmount(e.target.value)}
            className="flex-1 bg-cream border border-black/10 px-4 py-2.5 text-sm text-ink placeholder-ink-muted/40 outline-none focus:border-black/20 rounded-xl transition-colors"
          />
        </div>
        <button
          onClick={handleWithdraw}
          disabled={withdrawing || !withdrawAmount || !poolAddress}
          className={`w-full py-3 font-display text-sm font-bold rounded-xl border transition-colors flex items-center justify-center gap-2 ${
            !withdrawing && withdrawAmount && poolAddress
              ? 'border-black/12 text-ink hover:border-black/20 hover:bg-cream'
              : 'border-black/8 text-ink-muted cursor-not-allowed'
          }`}
        >
          {withdrawing && <span className="w-3.5 h-3.5 border-2 border-current/40 border-t-current rounded-full animate-spin" />}
          {withdrawing ? 'Withdrawing…' : 'Withdraw'}
        </button>
        {lastTx && (
          <div className="mt-4 flex items-center gap-2 bg-lavender/30 border border-lavender-mid rounded-xl px-4 py-3">
            <span className="text-xs font-semibold text-navy">Last tx:</span>
            <a
              href={`${EXPLORER_BASE}/tx/${lastTx}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs text-ink-muted hover:text-ink transition-colors"
            >
              {lastTx.slice(0, 12)}…{lastTx.slice(-8)} →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Rate Limits Tab ──────────────────────────────────────────────── */

interface RateLimit { takerAddress: string; expiresAt: string; }

function RateLimitsTab({ makerAddress }: { makerAddress: string }) {
  const [limits, setLimits]   = useState<RateLimit[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/makers/${makerAddress}/rate-limits`);
      if (res.ok) setLimits((await res.json()).limits ?? []);
    } catch {} finally { setLoading(false); }
  }, [makerAddress]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);

  return (
    <div className="bg-white rounded-2xl border border-black/8 shadow-sm p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-display text-xl font-bold text-ink">Rate-Limited Takers</h2>
        <button onClick={load} className="text-xs font-semibold text-ink-muted hover:text-ink transition-colors">↻ Refresh</button>
      </div>
      {loading ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : limits.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-ink-muted">No active rate limits.</p>
          <p className="text-xs text-ink-muted mt-2">Takers are auto-limited after 10 RFQ requests per minute.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {['Taker Address', 'Expires At', 'Remaining'].map(h => (
                  <th key={h} className="text-left text-[10px] font-bold uppercase tracking-widest text-ink-muted pb-3 pr-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {limits.map(l => {
                const remaining = Math.max(0, Math.floor((new Date(l.expiresAt).getTime() - Date.now()) / 1000));
                const min = Math.floor(remaining / 60);
                const label = min > 0 ? `${min}m ${remaining % 60}s` : `${remaining}s`;
                return (
                  <tr key={l.takerAddress} className="border-t border-black/5">
                    <td className="font-mono text-xs text-ink py-3 pr-4">
                      {l.takerAddress.slice(0, 8)}…{l.takerAddress.slice(-6)}
                      <button
                        onClick={() => navigator.clipboard.writeText(l.takerAddress)}
                        className="ml-2 text-ink-muted hover:text-ink transition-colors"
                        title="Copy"
                      >⧉</button>
                    </td>
                    <td className="text-xs text-ink-muted py-3 pr-4">{new Date(l.expiresAt).toLocaleTimeString()}</td>
                    <td className="py-3 pr-4">
                      <span className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full border ${
                        remaining > 60
                          ? 'bg-red-50 border-red-200 text-red-600'
                          : 'bg-amber-50 border-amber-200 text-amber-700'
                      }`}>
                        {label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── History Tab ──────────────────────────────────────────────────── */

function HistoryTab({ makerAddress }: { makerAddress: string }) {
  const [trades, setTrades]   = useState<TradeRecord[]>([]);
  const [total, setTotal]     = useState(0);
  const [offset, setOffset]   = useState(0);
  const [loading, setLoading] = useState(true);
  const limit = 20;

  const load = useCallback(async (off: number) => {
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/trades?makerAddress=${makerAddress}&limit=${limit}&offset=${off}`);
      const data = await res.json();
      setTrades(data.trades ?? []);
      setTotal(data.total ?? 0);
    } catch {} finally { setLoading(false); }
  }, [makerAddress]);

  useEffect(() => { load(0); }, [load]);

  const pages = Math.ceil(total / limit);
  const page  = Math.floor(offset / limit) + 1;

  return (
    <div className="bg-white rounded-2xl border border-black/8 shadow-sm p-6">
      <h2 className="font-display text-xl font-bold text-ink mb-5">Trade History</h2>
      {loading ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : trades.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-ink-muted">No trades yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {['Time', 'Direction', 'Amount In', 'Amount Out', 'Rate', 'Status', ''].map(h => (
                  <th key={h} className="text-left text-[10px] font-bold uppercase tracking-widest text-ink-muted pb-3 pr-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trades.map(t => {
                const direction = t.tokenIn === USDC_CONTRACT ? 'USDC→EURC' : 'EURC→USDC';
                const amtIn  = parseFloat(stroopsToHuman(t.amountIn));
                const amtOut = parseFloat(stroopsToHuman(t.amountOut));
                const rate   = amtIn > 0 ? (amtOut / amtIn).toFixed(4) : '—';
                return (
                  <tr key={t.quoteId} className="border-t border-black/5">
                    <td className="text-xs text-ink-muted py-3 pr-4">{new Date(t.quotedAt).toLocaleString()}</td>
                    <td className="text-xs font-semibold text-ink py-3 pr-4">{direction}</td>
                    <td className="font-mono text-xs text-ink py-3 pr-4">{stroopsToHuman(t.amountIn)}</td>
                    <td className="font-mono text-xs text-ink py-3 pr-4">{stroopsToHuman(t.amountOut)}</td>
                    <td className="text-xs text-ink-muted py-3 pr-4">{rate}</td>
                    <td className="py-3 pr-4"><StatusBadge status={t.status} /></td>
                    <td className="py-3">
                      {t.txHash && (
                        <a href={`${EXPLORER_BASE}/tx/${t.txHash}`} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-ink-muted hover:text-ink transition-colors">↗</a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div className="flex items-center justify-between mt-5 pt-4 border-t border-black/8">
          <button
            onClick={() => { const o = offset - limit; setOffset(o); load(o); }}
            disabled={offset === 0}
            className="text-xs font-semibold text-ink-muted hover:text-ink disabled:opacity-30 transition-colors"
          >← Previous</button>
          <span className="text-xs text-ink-muted">Page {page} of {pages}</span>
          <button
            onClick={() => { const o = offset + limit; setOffset(o); load(o); }}
            disabled={offset + limit >= total}
            className="text-xs font-semibold text-ink-muted hover:text-ink disabled:opacity-30 transition-colors"
          >Next →</button>
        </div>
      )}
    </div>
  );
}

/* ── Shared helpers ───────────────────────────────────────────────── */

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl border border-black/8 shadow-sm p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted mb-1">{label}</p>
      <p className="font-display text-xl font-bold text-ink">{value}</p>
    </div>
  );
}

function BalanceRow({ label, vault, wallet }: { label: string; vault: string; wallet: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs font-bold text-ink-muted">{label}</span>
      <div className="text-right">
        <span className="font-display text-sm font-bold text-ink block">{vault}</span>
        <span className="text-xs text-ink-muted">Wallet: {wallet}</span>
      </div>
    </div>
  );
}

function SignerKeyCard({ address }: { address: string }) {
  const [onChainKey, setOnChainKey] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState(true);
  const [inputKey, setInputKey]     = useState('');
  const [phase, setPhase]           = useState<'idle' | 'simulating' | 'awaiting_freighter' | 'confirming' | 'done' | 'error'>('idle');
  const [errMsg, setErrMsg]         = useState('');

  useEffect(() => {
    getOnChainSignerKey(address).then(k => { setOnChainKey(k); setLoadingKey(false); });
  }, [address]);

  const handleUpdate = async () => {
    const key = inputKey.trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(key)) { setErrMsg('Signer public key must be 64 hex characters'); setPhase('error'); return; }
    setErrMsg('');
    try {
      setPhase('simulating');
      const xdr = await buildUpdateSignerTx(address, key);
      setPhase('awaiting_freighter');
      const signed = await signWithWallet(xdr);
      setPhase('confirming');
      await submitAndWait(signed);
      setOnChainKey(key);
      setInputKey('');
      setPhase('done');
    } catch (e: unknown) {
      setErrMsg(e instanceof Error ? e.message : 'Update failed');
      setPhase('error');
    }
  };

  const isBusy = phase === 'simulating' || phase === 'awaiting_freighter' || phase === 'confirming';
  const phaseLabel: Record<string, string> = {
    simulating: 'Preparing transaction…', awaiting_freighter: 'Approve in Freighter…', confirming: 'Confirming on Stellar…',
  };

  return (
    <div className="bg-white rounded-2xl border border-black/8 shadow-sm p-5">
      <h3 className="font-display font-bold text-ink mb-3">Signer Key</h3>
      <div className="mb-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted mb-1.5">On-chain registered key</p>
        {loadingKey ? (
          <p className="text-xs text-ink-muted">Loading…</p>
        ) : onChainKey ? (
          <code className="font-mono text-xs text-ink-muted break-all">{onChainKey}</code>
        ) : (
          <p className="text-xs font-semibold text-amber-700">Not registered on-chain</p>
        )}
      </div>
      {phase === 'done' ? (
        <div>
          <p className="text-xs font-semibold text-green-700 mb-2">✓ Signer key updated on-chain</p>
          <button onClick={() => setPhase('idle')} className="text-xs text-ink-muted hover:text-ink transition-colors underline underline-offset-4">Update again</button>
        </div>
      ) : (
        <>
          <p className="text-xs text-ink-muted mb-3">
            If your SDK signer key doesn&apos;t match the on-chain key, quotes will fail ED25519 verification.
            Paste your signer public key from your{' '}
            <code className="font-mono text-ink">.cred</code> file and click Update.
          </p>
          {isBusy ? (
            <div className="flex items-center gap-2 py-2">
              <span className="w-3.5 h-3.5 border-2 border-navy border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-ink-muted">{phaseLabel[phase]}</span>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="64-hex signer public key"
                value={inputKey}
                onChange={e => setInputKey(e.target.value)}
                className="flex-1 bg-cream border border-black/10 px-3 py-2.5 font-mono text-xs text-ink placeholder-ink-muted/40 outline-none focus:border-black/20 rounded-xl transition-colors"
              />
              <button
                onClick={handleUpdate}
                disabled={!inputKey.trim()}
                className={`px-4 py-2 text-xs font-bold rounded-xl border transition-colors ${
                  inputKey.trim()
                    ? 'bg-navy text-white border-navy hover:bg-navy-light'
                    : 'border-black/10 text-ink-muted cursor-not-allowed'
                }`}
              >
                Update
              </button>
            </div>
          )}
          {phase === 'error' && (
            <p className="text-xs text-red-600 mt-2">{errMsg}</p>
          )}
        </>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const pill: Record<string, string> = {
    confirmed: 'bg-green-50 border-green-200 text-green-700',
    submitted: 'bg-blue-50 border-blue-200 text-blue-700',
    failed:    'bg-red-50 border-red-200 text-red-600',
    expired:   'bg-cream border-black/10 text-ink-muted',
    quoted:    'bg-cream border-black/10 text-ink-muted',
  };
  return (
    <span className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full border ${pill[status] ?? 'bg-cream border-black/10 text-ink-muted'}`}>
      {status}
    </span>
  );
}
