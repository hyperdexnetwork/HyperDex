'use client'
import React from 'react'
import { useAuction } from '@/hooks/useAuction'
import { useWallet }  from '@/hooks/useWallet'
import { EXPLORER_BASE } from '@/lib/constants'

// ── Color palette ──────────────────────────────────────────────────
const C = {
  white:   '#FFFFFF',
  section: '#F2F1EF',          // warm light-gray section bg
  border:  'rgba(0,0,0,0.07)',
  navy:    '#1C1B2E',          // CTA button
  ink:     '#111118',
  muted:   '#A8A8B8',
  dim:     '#C4C4D0',          // placeholder zero
  green:   '#16a34a',
  red:     '#dc2626',
  amber:   '#d97706',
  violet:  '#7c3aed',
}

const noSpinner = `
  input[type=number]::-webkit-inner-spin-button,
  input[type=number]::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }
  input[type=number] { -moz-appearance:textfield; }
`

export default function SwapCard() {
  const { address, connect, isConnecting } = useWallet()
  const {
    state, amountIn,
    tokenInSym, tokenOutSym,
    setAmountIn, swapTokenDirection,
    startAuction, approveSwap,
    rejectSwap, cancelAuction, resetState,
  } = useAuction()

  const usdVal = (sym: string, amt: string) => {
    const n = parseFloat(amt) || 0
    if (!n) return '$0'
    const rate = sym === 'EURC' ? 1.12 : 1.00
    return '$' + (n * rate).toLocaleString(undefined, { maximumFractionDigits: 2 })
  }

  // ── IDLE / STARTING / ERROR / NO_QUOTES / REJECTED ────────────
  if (['idle','starting','error','no_quotes','rejected'].includes(state.status)) {
    return (
      <div style={card}>
        <style>{noSpinner}</style>
        {/* Sell */}
        <div style={sectionBox}>
          <p style={sectionLbl}>Sell</p>
          <div style={amtRow}>
            <input
              type="number"
              placeholder="0"
              value={amountIn}
              onChange={e => { setAmountIn(e.target.value); resetState() }}
              style={{ ...amtInput, color: amountIn ? C.ink : C.dim }}
              min="0"
            />
            <TokenPill symbol={tokenInSym} />
          </div>
          <p style={usdLbl}>{usdVal(tokenInSym, amountIn)}</p>
        </div>

        {/* Switch button */}
        <div style={switchRow}>
          <button onClick={swapTokenDirection} style={switchBtn} title="Switch tokens">
            <SwitchIcon />
          </button>
        </div>

        {/* Buy */}
        <div style={sectionBox}>
          <p style={sectionLbl}>Buy</p>
          <div style={amtRow}>
            <div style={{ ...amtInput, color: C.dim, display: 'flex', alignItems: 'center' }}>0</div>
            <TokenPill symbol={tokenOutSym} />
          </div>
          <p style={usdLbl}>$0</p>
        </div>

        {/* Status alerts.
            A missing trustline is not a retryable error — it needs an on-chain
            ChangeTrust — so it gets its own panel with the fix attached rather
            than a red message the trader can only re-read. */}
        {state.status === 'error' && state.missingTrustline?.asset && (
          <TrustlineAlert
            asset={state.missingTrustline.asset}
            message={state.error ?? ''}
            onDone={resetState}
          />
        )}
        {state.status === 'error' && state.error && !state.missingTrustline?.asset && (
          <Alert color={C.red} bg="rgba(220,38,38,0.06)" bd="rgba(220,38,38,0.18)">{state.error}</Alert>
        )}
        {state.status === 'no_quotes' && (
          <Alert color={C.amber} bg="rgba(217,119,6,0.06)" bd="rgba(217,119,6,0.18)">
            No bids received. Check that makers are online and try again.
          </Alert>
        )}
        {state.status === 'rejected' && (
          <Alert color={C.muted} bg="rgba(0,0,0,0.03)" bd={C.border}>
            Quote declined. Start a new auction when ready.
          </Alert>
        )}

        {/* CTA */}
        {!address ? (
          <button onClick={connect} disabled={isConnecting} style={cta}>
            {isConnecting ? 'CONNECTING…' : 'CONNECT WALLET'}
          </button>
        ) : !amountIn || parseFloat(amountIn) <= 0 ? (
          <button style={{ ...cta, opacity: 0.4, cursor: 'not-allowed' }} disabled>
            ENTER AMOUNT
          </button>
        ) : state.status === 'starting' ? (
          <button style={{ ...cta, opacity: 0.65, cursor: 'wait' }} disabled>
            STARTING…
          </button>
        ) : (
          <button onClick={startAuction} style={cta}>GET BEST PRICE →</button>
        )}
      </div>
    )
  }

  // ── COLLECTING ────────────────────────────────────────────────
  if (state.status === 'collecting') {
    const pct = (state.collectingSeconds / 30) * 100
    const col  =
      state.collectingSeconds > 10 ? C.violet :
      state.collectingSeconds > 5  ? C.amber  : C.red
    return (
      <div style={card}>
        <div style={centerCol}>
          <p style={bigLbl}>Collecting Sealed Bids</p>
          <p style={subLbl}>Each maker bids independently — prices are sealed</p>
          <p style={{ fontSize: '40px', fontWeight: 800, color: col, marginBottom: '8px' }}>
            {state.collectingSeconds}s
          </p>
          <div style={track}><div style={{ ...fill, width: `${pct}%`, background: col }} /></div>
          <div style={{ display:'flex', gap:'10px', width:'100%', margin:'16px 0' }}>
            <StatPill label="Active makers"  value={String(state.makerCount)} />
            <StatPill label="Bids received"  value={`${state.quotesReceived}/${state.makerCount}`} />
          </div>
          <p style={{ fontSize:'12px', color:C.muted, marginBottom:'16px' }}>Bids are sealed — best price wins</p>
          <button onClick={cancelAuction} style={ghost}>Cancel</button>
        </div>
      </div>
    )
  }

  // ── COMPLETED ─────────────────────────────────────────────────
  if (state.status === 'completed' && state.bestQuote) {
    const q   = state.bestQuote
    const pct = (state.acceptSeconds / 10) * 100
    const col =
      state.acceptSeconds > 5 ? C.green :
      state.acceptSeconds > 2 ? C.amber : C.red
    return (
      <div style={card}>
        <div style={centerCol}>
          <p style={bigLbl}>Best Price Found</p>
          <p style={subLbl}>{q.quotesReceived} bid(s) received · best selected</p>
          <div style={priceBox}>
            <div style={priceRow}>
              <span style={priceLbl}>You pay</span>
              <span style={priceVal}>{q.humanAmountIn} {tokenInSym}</span>
            </div>
            <div style={{ textAlign:'center', color:C.muted, padding:'6px 0', fontSize:'18px' }}>↓</div>
            <div style={priceRow}>
              <span style={priceLbl}>You receive</span>
              <span style={{ ...priceVal, color:C.green, fontSize:'22px' }}>{q.humanAmountOut} {tokenOutSym}</span>
            </div>
          </div>
          <div style={detailBox}>
            {([
              ['Rate',         q.rate],
              ['Market maker', q.makerName],
              ['Protocol fee', '0.10%'],
              ['Slippage',     'Zero — guaranteed'],
            ] as [string,string][]).map(([k,v]) => (
              <div key={k} style={detailRow}>
                <span style={{ color:C.muted, fontSize:'13px' }}>{k}</span>
                <span style={{ color: k==='Slippage' ? C.green : C.ink, fontSize:'13px', fontWeight:600 }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ width:'100%', marginBottom:'12px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:'12px', marginBottom:'4px' }}>
              <span style={{ color:C.muted }}>Time to accept</span>
              <span style={{ color:col, fontWeight:700 }}>{state.acceptSeconds}s</span>
            </div>
            <div style={track}><div style={{ ...fill, width:`${pct}%`, background:col, transition:'width 1s linear,background 0.3s' }} /></div>
          </div>
          <div style={{ display:'flex', gap:'10px', width:'100%' }}>
            <button onClick={approveSwap} style={{ ...cta, flex:2, marginTop:0 }}>✓ Swap Now</button>
            <button onClick={rejectSwap}  style={{ ...ghost, flex:1, marginTop:0 }}>✗ Reject</button>
          </div>
        </div>
      </div>
    )
  }

  // ── EXECUTING ────────────────────────────────────────────────
  if (state.status === 'executing') {
    return (
      <div style={card}>
        <div style={centerCol}>
          <Spinner /><p style={bigLbl}>Approve in Freighter</p>
          <p style={subLbl}>Review and sign the swap transaction</p>
        </div>
      </div>
    )
  }

  // ── CONFIRMING ───────────────────────────────────────────────
  if (state.status === 'confirming') {
    return (
      <div style={card}>
        <div style={centerCol}>
          <Spinner /><p style={bigLbl}>Confirming…</p>
          <p style={subLbl}>Waiting for Stellar ledger confirmation (~5s)</p>
        </div>
      </div>
    )
  }

  // ── SUCCESS ──────────────────────────────────────────────────
  if (state.status === 'success' && state.bestQuote) {
    return (
      <div style={card}>
        <div style={centerCol}>
          <img
            src={tokenOutSym === 'USDC' ? '/logo-usdc.png' : '/logo-eurc.png'}
            alt={tokenOutSym}
            style={{ width: 64, height: 64, objectFit: 'contain', borderRadius: '50%', marginBottom: '12px' }}
          />
          <p style={bigLbl}>Swap Confirmed!</p>
          <div style={{ display:'flex', alignItems:'center', gap:'16px', margin:'16px 0 20px', textAlign:'center' }}>
            <div>
              <p style={{ fontSize:'11px', color:C.muted, marginBottom:'4px' }}>Sent</p>
              <p style={{ fontSize:'18px', fontWeight:700, color:C.ink }}>{state.bestQuote.humanAmountIn} {tokenInSym}</p>
            </div>
            <div style={{ fontSize:'24px', color:C.muted }}>→</div>
            <div>
              <p style={{ fontSize:'11px', color:C.muted, marginBottom:'4px' }}>Received</p>
              <p style={{ fontSize:'18px', fontWeight:700, color:C.green }}>{state.bestQuote.humanAmountOut} {tokenOutSym}</p>
            </div>
          </div>
          {state.txHash && (
            <a href={`${EXPLORER_BASE}/tx/${state.txHash}`}
              target="_blank" rel="noopener noreferrer"
              style={{ color:C.violet, fontSize:'13px', textDecoration:'none', marginBottom:'16px', display:'block' }}>
              View on Stellar Explorer ↗
            </a>
          )}
          <button onClick={resetState} style={cta}>Swap Again</button>
        </div>
      </div>
    )
  }

  return null
}

// ── Sub-components ─────────────────────────────────────────────────

function TokenPill({ symbol }: { symbol: string }) {
  const logo = symbol === 'USDC' ? '/logo-usdc.png' : '/logo-eurc.png'
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:'7px', flexShrink:0,
      background: C.white,
      border: `1px solid ${C.border}`,
      borderRadius:'100px',
      padding:'5px 11px 5px 5px',
    }}>
      <img src={logo} alt={symbol}
        style={{ width:26, height:26, objectFit:'contain', borderRadius:'50%', flexShrink:0 }} />
      <span style={{ fontWeight:700, fontSize:'13px', color:C.ink, whiteSpace:'nowrap' }}>{symbol}</span>
      <span style={{ color:C.muted, fontSize:'11px', lineHeight:1 }}>▾</span>
    </div>
  )
}

function SwitchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 16V4m0 0L3 8m4-4 4 4" />
      <path d="M17 8v12m0 0 4-4m-4 4-4-4" />
    </svg>
  )
}

function StatPill({ label, value }: { label:string; value:string }) {
  return (
    <div style={{ background:C.section, border:`1px solid ${C.border}`, borderRadius:'10px', padding:'12px', textAlign:'center', flex:1 }}>
      <p style={{ fontSize:'11px', color:C.muted, marginBottom:'3px' }}>{label}</p>
      <p style={{ fontSize:'20px', fontWeight:700, color:C.ink }}>{value}</p>
    </div>
  )
}

function Alert({ color, bg, bd, children }: { color:string; bg:string; bd:string; children:React.ReactNode }) {
  return (
    <div style={{ background:bg, border:`1px solid ${bd}`, borderRadius:'10px', padding:'10px 14px', fontSize:'13px', color, marginTop:'10px' }}>
      {children}
    </div>
  )
}

function RadarPulse() {
  return (
    <div style={{ position:'relative', width:'72px', height:'72px', margin:'0 auto 20px', display:'flex', alignItems:'center', justifyContent:'center' }}>
      {[0,1,2].map(i=>(
        <span key={i} style={{ position:'absolute', width:'72px', height:'72px', borderRadius:'50%', border:`2px solid ${C.violet}`, animation:`rp 2s ease-out ${i*0.65}s infinite`, opacity:0 }} />
      ))}
      <div style={{ width:'18px', height:'18px', borderRadius:'50%', background:C.violet, zIndex:1 }} />
      <style>{`@keyframes rp{0%{transform:scale(.3);opacity:.7}100%{transform:scale(2);opacity:0}}`}</style>
    </div>
  )
}

function Spinner() {
  return (
    <div style={{ width:'36px', height:'36px', border:`3px solid rgba(124,58,237,.12)`, borderTopColor:C.violet, borderRadius:'50%', animation:'rs .75s linear infinite', margin:'0 auto 20px' }}>
      <style>{`@keyframes rs{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background:   C.white,
  borderRadius: '24px',
  padding:      '10px',
  width:        '100%',
  boxShadow:    '0 2px 20px rgba(0,0,0,0.09), 0 0 0 1px rgba(0,0,0,0.05)',
}

const sectionBox: React.CSSProperties = {
  background:   C.section,
  borderRadius: '16px',
  padding:      '16px 16px 12px',
}

const sectionLbl: React.CSSProperties = {
  fontSize:13, fontWeight:700, color:C.ink, margin:'0 0 10px',
}

const amtRow: React.CSSProperties = {
  display:'flex', alignItems:'center', justifyContent:'space-between', gap:'10px', marginBottom:'6px',
}

const amtInput: React.CSSProperties = {
  background:'transparent', border:'none', outline:'none',
  fontSize:36, fontWeight:600, color:C.dim,
  flex:1, width:0, minWidth:0,
  fontVariantNumeric:'tabular-nums',
}

const usdLbl: React.CSSProperties = {
  fontSize:12, color:'#B8B8C8', fontWeight:500, margin:0,
}

const switchRow: React.CSSProperties = {
  display:'flex', justifyContent:'center', margin:'-2px 0', position:'relative', zIndex:2,
}

const switchBtn: React.CSSProperties = {
  width:36, height:36, borderRadius:'50%',
  background: C.white,
  border: `1.5px solid ${C.border}`,
  color: C.ink, cursor:'pointer',
  display:'flex', alignItems:'center', justifyContent:'center',
  boxShadow:'0 1px 6px rgba(0,0,0,0.09)',
}

const cta: React.CSSProperties = {
  width:'100%', padding:'14px',
  borderRadius:'16px',
  background: C.navy, color:'#fff',
  border:'none',
  fontSize:13, fontWeight:700, letterSpacing:'0.08em',
  cursor:'pointer', marginTop:'8px',
}

const ghost: React.CSSProperties = {
  width:'100%', padding:'11px',
  borderRadius:'14px',
  background:'transparent', color:C.muted,
  border:`1.5px solid ${C.border}`,
  fontSize:14, cursor:'pointer', marginTop:'8px',
}


const centerCol: React.CSSProperties = {
  display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center', padding:'16px 8px',
}

const bigLbl: React.CSSProperties = { fontSize:20, fontWeight:700, color:C.ink, margin:'0 0 6px' }
const subLbl: React.CSSProperties = { fontSize:13, color:C.muted, margin:'0 0 20px' }

const priceBox: React.CSSProperties = {
  background:'rgba(124,58,237,0.05)', border:'1px solid rgba(124,58,237,0.12)',
  borderRadius:'14px', padding:'16px', width:'100%', marginBottom:'12px',
}

const priceRow: React.CSSProperties = { display:'flex', justifyContent:'space-between', alignItems:'center' }
const priceLbl: React.CSSProperties = { fontSize:12, color:'#A0A0B0' }
const priceVal: React.CSSProperties = { fontSize:18, fontWeight:700, color:C.ink }

const detailBox: React.CSSProperties = {
  background:C.section, borderRadius:'12px', padding:'12px 14px', width:'100%', marginBottom:'12px',
}

const detailRow: React.CSSProperties = { display:'flex', justifyContent:'space-between', padding:'4px 0' }

const track: React.CSSProperties = {
  height:5, background:C.section, borderRadius:3, overflow:'hidden', width:'100%',
}

const fill: React.CSSProperties = {
  height:'100%', borderRadius:3, transition:'width 1s linear',
}

/* ── TrustlineAlert ─────────────────────────────────────────────────
   Stellar will not deliver a classic asset to an account that has not
   opted in to holding it. Rather than telling the trader their swap
   failed, offer the one transaction that fixes it. */

function TrustlineAlert({
  asset, message, onDone,
}: {
  asset: string;
  message: string;
  onDone: () => void;
}) {
  const [busy, setBusy]   = React.useState(false)
  const [done, setDone]   = React.useState(false)
  const [err,  setErr]    = React.useState<string | null>(null)
  const { address } = useWallet()
  const code = asset.split(':')[0]

  const addTrustline = async () => {
    if (!address) return
    setBusy(true); setErr(null)
    try {
      const { buildAddTrustlineTx, submitClassicTransaction, signWithWallet } =
        await import('@/lib/stellar')
      const xdr    = await buildAddTrustlineTx(address, asset)
      const signed = await signWithWallet(xdr)
      await submitClassicTransaction(signed)
      setDone(true)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Could not add the trustline')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div style={{
        background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.18)',
        borderRadius: 14, padding: '16px 16px 14px', display: 'flex',
        flexDirection: 'column', gap: 10, marginTop: 18,
      }}>
        <p style={{ margin: 0, fontSize: 13, color: C.green, fontWeight: 600 }}>
          {code} trustline added
        </p>
        <button onClick={onDone} style={{
          alignSelf: 'flex-start', fontSize: 12, fontWeight: 600, color: C.ink,
          background: C.white, border: `1px solid ${C.border}`, borderRadius: 8,
          padding: '9px 16px', cursor: 'pointer', marginTop: 2,
        }}>
          Get a quote
        </button>
      </div>
    )
  }

  return (
    <div style={{
      background: 'rgba(217,119,6,0.06)', border: '1px solid rgba(217,119,6,0.18)',
      borderRadius: 14, padding: '16px 16px 14px', display: 'flex',
      flexDirection: 'column', gap: 10, marginTop: 18,
    }}>
      <p style={{ margin: 0, fontSize: 13, color: C.amber, lineHeight: 1.5 }}>
        {message}
      </p>
      <p style={{ margin: 0, fontSize: 11, color: C.muted }}>
        A trustline is a one-time approval that lets your wallet hold {code}.
      </p>
      {err && (
        <p style={{ margin: 0, fontSize: 12, color: C.red }}>{err}</p>
      )}
      <button
        onClick={addTrustline}
        disabled={busy || !address}
        style={{
          alignSelf: 'flex-start', fontSize: 12, fontWeight: 600,
          color: C.white, background: C.navy, border: 'none', borderRadius: 8,
          padding: '9px 16px', cursor: busy ? 'default' : 'pointer',
          opacity: busy ? 0.6 : 1, marginTop: 2,
        }}
      >
        {busy ? 'Confirm in wallet…' : `Add ${code} trustline`}
      </button>
    </div>
  )
}
