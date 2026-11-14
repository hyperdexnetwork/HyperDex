import { H1, P, Mono, Callout } from '@/components/docs/DocsPrimitives';

export default function ProgramsPage() {
  const programs = [
    { name: 'pool_registry', role: 'Identity layer', desc: 'The single source of truth for who is a registered maker and what their signing key is. All other contracts defer to this for maker lookups.' },
    { name: 'quote_verifier', role: 'Taker entry point', desc: 'The only contract takers interact with directly. Verifies signatures, enforces invariants, orchestrates the maker_pool and fee_distributor.' },
    { name: 'maker_pool', role: 'Custody & swap execution', desc: 'Per-maker inventory pool. The only contract that moves tokens between taker and maker. execute_swap is callable only by quote_verifier.' },
    { name: 'maker_pool_factory', role: 'Pool deployment', desc: 'Deploys a dedicated maker_pool for each maker at registration, using a deterministic salt so the address is stable across simulation and execution.' },
    { name: 'fee_distributor', role: 'Fee accounting', desc: 'Accumulates protocol fees per token. Provides an admin withdrawal function to extract fees to treasury.' },
  ];

  return (
    <>
      <H1 tag="Programs">Programs Overview</H1>
      <Callout type="info" title="Changing in v3">v3 replaces these five contracts with hyperdex_settlement and maker_registry. See <strong>v3 &amp; Roadmap</strong>.</Callout>
      <P>HyperDex is composed of five Soroban smart contracts (called &quot;programs&quot; in Soroban terminology). They are deployed independently and call each other via cross-contract calls. Each program has a single clear responsibility.</P>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
        {programs.map(p => (
          <div key={p.name} className="border border-black/10 rounded-2xl p-5 bg-white hover:-translate-y-0.5 transition-transform">
            <Mono>{p.name}</Mono>
            <p className="text-xs font-bold uppercase tracking-wider text-ink-muted mt-2 mb-1">{p.role}</p>
            <p className="text-ink-muted text-sm leading-relaxed">{p.desc}</p>
          </div>
        ))}
      </div>
    </>
  );
}
