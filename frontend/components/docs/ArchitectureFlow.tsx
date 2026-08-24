/**
 * End-to-end request flow: quote discovery off-chain (steps 1–4), settlement
 * on-chain (step 5 onward).
 *
 * Inline SVG rather than an image so it stays sharp at any zoom, and rather
 * than ASCII art so the arrows can actually cross — the flow is a graph, not a
 * stack, and box-drawing characters cannot express the return paths.
 */

const C = {
  bg: '#111118',
  edge: 'rgba(255,255,255,0.42)',
  chip: 'rgba(255,255,255,0.09)',
  chipText: 'rgba(255,255,255,0.78)',
  offchain: '#1B7A8C', // backend — the only off-chain service HyperDex runs
  actor: '#2A2A34', // taker + makers: parties, not infrastructure
  contract: '#6D5BC4', // Soroban contracts
  nodeText: '#FFFFFF',
  stroke: 'rgba(255,255,255,0.14)',
};

function Node({
  x, y, w, h, fill, lines,
}: { x: number; y: number; w: number; h: number; fill: string; lines: string[] }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={7} fill={fill} stroke={C.stroke} />
      {lines.map((t, i) => (
        <text
          key={t}
          x={x + w / 2}
          y={y + h / 2 + (i - (lines.length - 1) / 2) * 15 + 4}
          textAnchor="middle"
          fill={C.nodeText}
          fontSize={12.5}
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          {t}
        </text>
      ))}
    </g>
  );
}

function Label({ x, y, text }: { x: number; y: number; text: string }) {
  const w = text.length * 6.1 + 12;
  return (
    <g>
      <rect x={x - w / 2} y={y - 9} width={w} height={18} rx={3} fill={C.chip} />
      <text
        x={x}
        y={y + 4}
        textAnchor="middle"
        fill={C.chipText}
        fontSize={11}
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
      >
        {text}
      </text>
    </g>
  );
}

const Edge = ({ d }: { d: string }) => (
  <path d={d} fill="none" stroke={C.edge} strokeWidth={1.3} markerEnd="url(#arw)" />
);

export default function ArchitectureFlow() {
  return (
    <figure className="my-6">
      <div className="rounded-2xl overflow-x-auto" style={{ background: C.bg }}>
        <svg
          viewBox="0 0 1112 500"
          role="img"
          aria-label="HyperDex request flow: a taker requests a quote from the backend, which
            dispatches sealed RFQs to maker SDKs; the winning signed quote is returned to the
            taker, who submits it to the quote_verifier contract. That contract reads the maker
            from pool_registry and calls execute_swap on the maker's pool, which sends token_out
            to the taker and the protocol fee to fee_distributor."
          style={{ display: 'block', width: '100%', minWidth: 720, height: 'auto' }}
        >
          <defs>
            <marker id="arw" viewBox="0 0 10 10" refX="9" refY="5"
              markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill={C.edge} />
            </marker>
          </defs>

          {/* ── off-chain: price discovery ─────────────────────────── */}
          <Edge d="M148,272 C240,250 300,180 368,150" />
          <Label x={232} y={153} text="1. request quote" />

          <Edge d="M575,132 C640,110 680,80 733,72" />
          <Label x={631} y={63} text="2. sealed RFQ" />

          <Edge d="M733,100 C680,118 640,140 577,148" />
          <Label x={655} y={109} text="3. signed quote" />

          <Edge d="M575,158 C640,166 680,172 733,178" />
          <Label x={655} y={170} text="2. sealed RFQ" />

          <Edge d="M733,206 C670,214 620,196 577,172" />
          <Label x={648} y={221} text="3. signed quote" />

          <Edge d="M368,176 C300,206 240,246 150,268" />
          <Label x={258} y={215} text="4. winning quote" />

          {/* ── on-chain: settlement ───────────────────────────────── */}
          <Edge d="M148,300 L398,308" />
          <Label x={258} y={304} text="5. execute_quote(quote, sig)" />

          <Edge d="M545,302 C610,294 660,290 716,290" />
          <Label x={648} y={292} text="get_maker" />

          <Edge d="M545,322 C620,336 670,368 720,386" />
          <Label x={634} y={360} text="execute_swap" />

          <Edge d="M854,395 L916,395" />
          <Label x={886} y={396} text="fee" />

          {/* pool pays the taker — the long return leg that closes the loop */}
          <Edge d="M722,420 C540,452 300,404 150,312" />
          <Label x={472} y={410} text="token_out" />

          {/* ── nodes ──────────────────────────────────────────────── */}
          <Node x={22} y={252} w={126} h={68} fill={C.actor} lines={['Taker', '(Wallet)']} />
          <Node x={370} y={115} w={205} h={68} fill={C.offchain}
            lines={['HyperDex Backend', 'RFQ Router · Price Book']} />
          <Node x={733} y={40} w={108} h={68} fill={C.actor} lines={['Maker A', '(SDK)']} />
          <Node x={733} y={155} w={108} h={68} fill={C.actor} lines={['Maker B', '(SDK)']} />

          <Node x={398} y={288} w={147} h={46} fill={C.contract} lines={['quote_verifier']} />
          <Node x={716} y={267} w={142} h={46} fill={C.contract} lines={['pool_registry']} />
          <Node x={720} y={362} w={134} h={66} fill={C.contract}
            lines={['maker_pool', '(per maker)']} />
          <Node x={916} y={372} w={156} h={46} fill={C.contract} lines={['fee_distributor']} />
        </svg>
      </div>
      <figcaption className="text-ink-muted text-xs leading-relaxed mt-3">
        Steps 1–4 happen off-chain and cost nothing. Only step 5 touches the ledger, and it
        either settles atomically at the signed price or reverts.
      </figcaption>
    </figure>
  );
}
