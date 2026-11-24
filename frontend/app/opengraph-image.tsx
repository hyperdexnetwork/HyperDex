import { ImageResponse } from 'next/og';

export const alt = 'HyperDex: sealed-bid RFQ on Stellar';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  const bars = [5, 17, 29, 63, 75, 87];
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: 'linear-gradient(135deg, #1C1B2E 0%, #2A2942 60%, #3B3470 100%)',
          color: 'white',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <svg width="44" height="48" viewBox="0 0 100 108">
            {bars.map(x => <rect key={x} x={x} y="5" width="8" height="98" fill="white" />)}
            {[42, 54, 66].map(y => <rect key={y} x="5" y={y} width="90" height="8" fill="white" />)}
          </svg>
          <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: -1 }}>HyperDex</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 104, fontWeight: 700, letterSpacing: -4, lineHeight: 1 }}>Trade without limits.</span>
          <span style={{ marginTop: 28, fontSize: 34, color: 'rgba(255,255,255,0.65)' }}>
            Sealed-bid RFQ on Stellar. One firm price, settled atomically.
          </span>
        </div>
        <div style={{ display: 'flex', gap: 40, fontSize: 24, color: 'rgba(255,255,255,0.55)' }}>
          <span>30s auction</span>
          <span>~5s settlement</span>
          <span>0.10% fee</span>
          <span>Non-custodial</span>
        </div>
      </div>
    ),
    size,
  );
}
