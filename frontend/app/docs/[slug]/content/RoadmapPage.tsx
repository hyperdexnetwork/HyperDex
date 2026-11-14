import { H1, H2, P, Table, Callout, Mono } from '@/components/docs/DocsPrimitives';

const TARGET_ARCH_URL = 'https://github.com/hyperdexnetwork/HyperDex/blob/main/docs/TARGET_ARCHITECTURE.md';

export default function RoadmapPage() {
  return (
    <>
      <H1 tag="Start">v3 &amp; Roadmap</H1>
      <P>
        HyperDex v3 turns today&apos;s testnet RFQ exchange into an <strong>RFQ liquidity and settlement layer</strong> for
        stablecoin FX on Stellar. Professional makers quote firm prices for the exact size requested, each quote is
        compared against Stellar&apos;s own liquidity, and the chosen trade settles atomically on Soroban, wallet to
        wallet, at the signed price or not at all.
      </P>
      <Callout type="info" title="Status">
        Everything on this page is planned work. The pages under Getting Started, Concepts and Programs describe v2,
        the system running on Stellar Testnet today. The full design is in{' '}
        <a href={TARGET_ARCH_URL} className="underline" target="_blank" rel="noreferrer">TARGET_ARCHITECTURE.md</a>.
      </Callout>

      <H2 id="who-it-serves">Who it serves</H2>
      <Table
        headers={['Who', 'Role', 'What they get']}
        rows={[
          ['Makers (OTC desks, market makers, treasury desks)', 'Supply quotes', 'Order flow without locking capital in pools; funds stay in their own accounts'],
          ['Integrators (wallets, payment platforms, fintech APIs, aggregators)', 'Request and settle trades for their users', 'One API for firm USDC↔EURC conversion, with the best on-chain route shown alongside'],
          ['End businesses and users', 'Reached through integrators', 'A known amount out before they sign'],
        ]}
      />

      <H2 id="v2-to-v3">What changes from v2 to v3</H2>
      <Table
        headers={['Today (v2)', 'v3', 'Why']}
        rows={[
          ['Custom ed25519 quote signature checked by quote_verifier', <>hyperdex_settlement: maker and taker both authorise the exact terms with Soroban <Mono>require_auth_for_args</Mono></>, 'Native replay protection, bound to the contract and the network'],
          ['One maker_pool per maker, inventory pre-deposited', 'Wallet-to-wallet settlement, no pools', 'Makers keep capital in their own accounts; nothing can be stranded in a contract'],
          ['Maker approval enforced off-chain', 'maker_registry: on-chain approval, allowed pairs, size limits, global, pair and maker pauses', 'Venue rules enforced on-chain and visible to anyone'],
          ['Admin can change the fee after a quote is signed; no taker minimum', <>Fee (10 bps, hard cap 50 bps) and <Mono>min_buy</Mono> are part of the signed terms</>, 'The taker gets what was signed, or the trade reverts'],
          ['Single admin key; fee_distributor contract', 'Multisig admin; fees go straight to a multisig treasury', 'No single key controls the venue'],
          ['No route comparison', 'Horizon strict-send paths (SDEX and AMM pools) compared with every quote, net of fees', 'Execution quality is measured, not claimed'],
          ['30-second sealed-bid auction window', <>One quote-collection deadline of about 0.5–2 s, then on-chain validity until <Mono>expiry_ledger</Mono></>, 'A price in about a second; bids stay sealed'],
        ]}
      />

      <H2 id="roadmap">Roadmap</H2>
      <Table
        headers={['Phase', 'Builds']}
        rows={[
          ['v3', 'Settlement and registry contracts, maker SDK authorization signing, sub-2-second quote collection, transaction builder, SDEX/AMM route comparison, multisig admin and treasury, fresh testnet deployment'],
          ['Next', 'Integrator API (/v1: quote, build, submit, track), lifecycle tracking and reconciliation, risk limits, maker reliability scoring'],
          ['Later', 'Maker smart accounts with scoped keys, inventory reservation, route fallback execution, more corridors, business tooling when integrators ask for it'],
          ['Later: ZK compliance credentials', 'Takers prove KYB with a zero-knowledge proof (Groth16 on BN254), and makers can require it. No identity data on-chain, and none held by HyperDex.'],
          ['Later: confidential settlement', 'Hide trade size and counterparties, with auditor view keys, by integrating Stellar Private Payments or confidential tokens once their ZK verifiers and audits are final'],
          ['Audit', 'Independent security audit, fixes and verified WASM builds before any real-value launch'],
        ]}
      />

      <H2 id="for-makers">What it means for makers</H2>
      <P>
        In v3 makers no longer deposit inventory into a pool. They quote from their own Stellar account, and the maker
        SDK signs a Soroban authorization entry for the exact trade instead of a custom quote signature. Existing makers
        re-register in the new on-chain registry; no funds need to move.
      </P>

      <H2 id="custody">Custody stays the same</H2>
      <P>
        HyperDex is non-custodial in every phase: the service holds no signing keys and never holds user or maker funds.
      </P>
    </>
  );
}
