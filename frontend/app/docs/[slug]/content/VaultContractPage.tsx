import { H1, H2, P, Table, Mono } from '@/components/docs/DocsPrimitives';

export default function VaultContractPage() {
  return (
    <>
      <H1 tag="Programs">maker_pool</H1>
      <P>The <Mono>maker_pool</Mono> is the custody layer. Each maker has their <strong>own</strong> pool contract — deployed on demand by <Mono>maker_pool_factory</Mono> at registration — that holds only that maker&apos;s inventory and moves tokens during their swaps. It has no pricing logic; it simply executes what <Mono>quote_verifier</Mono> tells it to.</P>

      <H2 id="why-per-maker">Why one pool per maker</H2>
      <P>Isolating inventory per maker means one maker&apos;s balance can never be spent settling another maker&apos;s quote. The factory deploys each pool with a deterministic salt (<Mono>sha256(maker.to_xdr())</Mono>) so the same address is computed in both simulation and execution.</P>

      <H2 id="why-prefund">Why makers pre-fund their pool</H2>
      <P>Atomic settlement requires the pool to already hold the output tokens at the moment of execution. There is no credit, no flash loan, no JIT — the pool is a real pre-funded balance sheet. A quote settles only if the pool holds enough of the output token at execution time; if the maker has withdrawn inventory since quoting, the transaction reverts and the taker loses nothing.</P>

      <H2 id="access-control">Access control</H2>
      <P><Mono>execute_swap</Mono> is the most sensitive function — it moves real tokens. It requires <Mono>require_auth()</Mono> from the registered <Mono>quote_verifier</Mono> address. No other contract or user can call it directly.</P>

      <H2 id="functions">Functions</H2>
      <Table
        headers={['Function', 'Caller', 'Description']}
        rows={[
          ['deposit(token, amount)', 'Maker', 'Transfers amount from maker wallet into the pool (2-TX: approve + deposit)'],
          ['withdraw(token, amount)', 'Maker', 'Transfers amount from the pool back to the maker wallet'],
          ['execute_swap(quote)', 'quote_verifier only', 'Moves amount_in from taker→pool, amount_out from pool→taker. Atomic — reverts if either transfer fails.'],
          ['get_balances()', 'Anyone', 'Returns the pool USDC + EURC balances in stroops'],
        ]}
      />
      <P><strong>Factory address:</strong> <Mono>CAAQHM5YQUXIL62EJKVSXZDK45GIV4ZSTG4UAS5QFBQJN4ZSDDNXZWXD</Mono> — individual pool addresses are per-maker and shown on the /maker dashboard.</P>
      <P><strong>Persistent TTL:</strong> every <Mono>deposit</Mono>/<Mono>withdraw</Mono> bumps all storage entries so the pool doesn&apos;t expire (Soroban persistent-storage TTL).</P>
    </>
  );
}
