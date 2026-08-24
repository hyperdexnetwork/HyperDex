'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNetwork } from '@/hooks/useNetwork';

type Pt = { t: number; p: number };
type Period = 'LIVE' | '1D' | '1W' | '1M' | '1Y' | 'All';
const PERIODS: Period[] = ['LIVE', '1D', '1W', '1M', '1Y', 'All'];

const PERIOD_DAYS: Record<Period, string> = {
  LIVE: '1',
  '1D': '1',
  '1W': '7',
  '1M': '30',
  '1Y': '365',
  All:  'max',
};

const PERIOD_LABEL: Record<Period, string> = {
  LIVE: '24H',
  '1D': '24H',
  '1W': '7D',
  '1M': '30D',
  '1Y': '1Y',
  All:  'ALL-TIME',
};

function fmt(n: number): string {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  return '$' + n.toFixed(2);
}

function formatTooltip(ts: number, period: Period): string {
  const d = new Date(ts);
  if (period === 'LIVE' || period === '1D')
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  if (period === '1W' || period === '1M') {
    const date = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${date} ${time}`;
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' });
}

const CG_CHART = '/api/coingecko/chart?days=';
const CG_PRICE = '/api/coingecko/spot';

export default function PriceChartPanel() {
  const { network } = useNetwork();
  const [period, setPeriod]     = useState<Period>('LIVE');
  const [data, setData]         = useState<Pt[]>([]);
  const [loading, setLoading]   = useState(true);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [stats, setStats]       = useState({ vol24h: 0, mcap: 0, supply: '' });
  const svgRef = useRef<SVGSVGElement>(null);

  // ── Fetch historical chart from CoinGecko ──────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setHoverIdx(null);

    fetch(CG_CHART + PERIOD_DAYS[period])
      .then(r => r.json())
      .then(json => {
        if (cancelled) return;
        const raw: [number, number][] = json.prices ?? [];
        setData(raw.map(([t, eurcUsd]) => ({ t, p: 1 / eurcUsd })));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [period]);

  // ── Fetch stats once on mount ──────────────────────────────────
  useEffect(() => {
    fetch(CG_PRICE)
      .then(r => r.json())
      .then(d => {
        const eurc = d['euro-coin'] ?? {};
        const usdc = d['usd-coin'] ?? {};
        setStats({
          vol24h: eurc.usd_24h_vol ?? 0,
          mcap:   usdc.usd_market_cap ?? 0,
          supply: usdc.usd_market_cap
            ? `${(usdc.usd_market_cap / 1e9).toFixed(1)}B USDC`
            : '',
        });
      })
      .catch(() => {});
  }, []);

  // ── Periodic refresh: re-fetch chart data every 60 s ────────────
  useEffect(() => {
    const id = setInterval(() => {
      fetch(CG_CHART + PERIOD_DAYS[period])
        .then(r => r.json())
        .then(json => {
          const raw: [number, number][] = json.prices ?? [];
          if (raw.length) setData(raw.map(([t, eurcUsd]) => ({ t, p: 1 / eurcUsd })));
        })
        .catch(() => {});
    }, 60_000);
    return () => clearInterval(id);
  }, [period]);

  // ── SVG chart geometry ─────────────────────────────────────────
  const W = 1000, H = 300;
  const PT = 20, PB = 28;
  const chartH = H - PT - PB;

  const prices = data.map(d => d.p);
  const mn  = prices.length ? Math.min(...prices) : 0;
  const mx  = prices.length ? Math.max(...prices) : 1;
  const rng = mx - mn || 0.0001;

  const sx = (i: number) => (i / Math.max(1, data.length - 1)) * W;
  const sy = (p: number) => PT + (1 - (p - mn) / rng) * chartH;

  const linePath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${sx(i).toFixed(1)} ${sy(d.p).toFixed(1)}`)
    .join(' ');
  const areaPath = data.length ? `${linePath} L ${W} ${H} L 0 ${H} Z` : '';

  // ── Hover ──────────────────────────────────────────────────────
  const onMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect || !data.length) return;
      const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      setHoverIdx(Math.round(frac * (data.length - 1)));
    },
    [data.length],
  );

  const hp = hoverIdx !== null ? data[hoverIdx] ?? null : null;
  const hx = hoverIdx !== null ? sx(hoverIdx) : null;
  const hy = hp ? sy(hp.p) : null;
  const htLabel = hp ? formatTooltip(hp.t, period) : null;

  const curr = data.length ? data[data.length - 1].p : 0;
  const open = data.length ? data[0].p : 0;
  const pctChange = open ? ((curr - open) / open) * 100 : 0;
  const isUp = pctChange >= 0;
  const LINE = isUp ? '#16a34a' : '#dc2626';
  const displayPrice = hp?.p ?? curr;

  const low  = prices.length ? Math.min(...prices) : 0;
  const high = prices.length ? Math.max(...prices) : 0;
  const lowPct  = open ? ((low  - open) / open) * 100 : 0;
  const highPct = open ? ((high - open) / open) * 100 : 0;

  const tooltipW = (period === '1W' || period === '1M') ? 110 : 84;
  const tooltipX = hx !== null ? Math.min(W - tooltipW, Math.max(4, hx - tooltipW / 2)) : 0;
  const periodLabel = PERIOD_LABEL[period];

  return (
    <div>
      {/* ── Price header ──────────────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center -space-x-2">
            <img src="/logo-usdc.png" alt="USDC" className="h-7 w-7 rounded-full object-contain ring-2 ring-cream" />
            <img src="/logo-eurc.png" alt="EURC" className="h-7 w-7 rounded-full object-contain ring-2 ring-cream" />
          </div>
          <span className="font-display text-sm font-semibold text-ink">USDC / EURC</span>
          <span className="text-[11px] font-semibold text-ink-muted bg-black/6 px-2.5 py-0.5 rounded-full border border-black/8" suppressHydrationWarning>
            {network.label}
          </span>
        </div>

        {loading && !data.length ? (
          <div className="font-display text-6xl font-bold text-ink/30 tabular-nums leading-none animate-pulse">
            0.0000
          </div>
        ) : (
          <div className="font-display text-6xl font-bold text-ink tabular-nums leading-none">
            {displayPrice.toFixed(6)}
          </div>
        )}

        <div className={`flex items-center gap-2 mt-2 text-sm font-semibold ${isUp ? 'text-green-600' : 'text-red-500'}`}>
          {data.length > 0 && (
            <>
              <span>{isUp ? '↑' : '↓'}{Math.abs(pctChange).toFixed(2)}%</span>
              <span className="text-ink-muted font-normal text-xs">vs. period open</span>
            </>
          )}
        </div>
      </div>

      {/* ── SVG Chart ──────────────────────────────────────────────── */}
      <div
        className="relative w-full select-none rounded-xl overflow-hidden"
        style={{ paddingBottom: '30%' }}
      >
        {loading && !data.length ? (
          <div className="absolute inset-0 flex items-center justify-center text-ink-muted text-sm">
            Loading chart&hellip;
          </div>
        ) : (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full"
            onMouseMove={onMove}
            onMouseLeave={() => setHoverIdx(null)}
            style={{ cursor: 'crosshair' }}
          >
            <defs>
              <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={LINE} stopOpacity="0.14" />
                <stop offset="100%" stopColor={LINE} stopOpacity="0"    />
              </linearGradient>
            </defs>

            {/* Area */}
            <path d={areaPath} fill="url(#cg)" />
            {/* Line */}
            <path d={linePath} fill="none" stroke={LINE} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />

            {/* Crosshair */}
            {hx !== null && hy !== null && hoverIdx !== null && (
              <>
                <rect x={tooltipX} y={1} width={tooltipW} height="18" rx="5" fill="rgba(17,17,24,0.72)" />
                <text
                  x={tooltipX + tooltipW / 2}
                  y="13"
                  textAnchor="middle"
                  fontSize="10"
                  fill="white"
                  fontFamily="monospace"
                >
                  {htLabel}
                </text>

                <line
                  x1={hx} y1={PT}
                  x2={hx} y2={H - PB}
                  stroke="#111118"
                  strokeWidth="1"
                  strokeOpacity="0.18"
                  strokeDasharray="5 4"
                />

                <circle cx={hx} cy={hy} r="10" fill={LINE} fillOpacity="0.15" />
                <circle cx={hx} cy={hy} r="4.5" fill={LINE} />
              </>
            )}
          </svg>
        )}
      </div>

      {/* ── Period selector ────────────────────────────────────────── */}
      <div className="flex justify-end items-center gap-0.5 mt-3 pb-6 border-b border-black/10">
        {PERIODS.map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`relative flex items-center gap-1 px-3.5 py-1.5 text-xs font-semibold rounded-full transition-colors
              ${period === p ? 'bg-ink text-white' : 'text-ink-muted hover:text-ink hover:bg-black/5'}`}
          >
            {p === 'LIVE' && (
              <span
                className={`inline-block w-1.5 h-1.5 rounded-full ${
                  period === 'LIVE' ? 'bg-green-400 animate-pulse' : 'bg-ink-muted/40'
                }`}
              />
            )}
            {p}
          </button>
        ))}
      </div>

      {/* ── Stats ─────────────────────────────────────────────────── */}
      <div className="mt-7">
        <h3 className="font-display text-sm font-bold text-ink mb-5 uppercase tracking-wide">
          About USDC / EURC
        </h3>
        <div className="grid grid-cols-3 gap-x-6 gap-y-7">
          <Stat label="24H VOLUME" value={stats.vol24h ? fmt(stats.vol24h) : '—'} />
          <Stat
            label={`${periodLabel} LOW`}
            value={low ? `$${low.toFixed(6)}` : '—'}
            change={low ? `${lowPct >= 0 ? '+' : ''}${lowPct.toFixed(2)}%` : undefined}
            pos={lowPct >= 0}
          />
          <Stat
            label={`${periodLabel} HIGH`}
            value={high ? `$${high.toFixed(6)}` : '—'}
            change={high ? `${highPct >= 0 ? '+' : ''}${highPct.toFixed(2)}%` : undefined}
            pos={highPct >= 0}
          />
          <Stat label="MARKET CAP" value={stats.mcap ? fmt(stats.mcap) : '—'} />
          <Stat label="FDV"        value={stats.mcap ? fmt(stats.mcap) : '—'} />
          <Stat label="CIRCULATING SUPPLY" value={stats.supply || '—'} />
        </div>
      </div>
    </div>
  );
}

function Stat({
  label, value, change, pos,
}: {
  label: string;
  value: string;
  change?: string;
  pos?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted mb-1.5">{label}</p>
      <p className="font-display text-base font-bold text-ink">{value}</p>
      {change !== undefined && (
        <p className={`text-xs font-semibold mt-0.5 ${pos ? 'text-green-600' : 'text-red-500'}`}>
          {pos ? '↑' : '↓'} {change}
        </p>
      )}
    </div>
  );
}
