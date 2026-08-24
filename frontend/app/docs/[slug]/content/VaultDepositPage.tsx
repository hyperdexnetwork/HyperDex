import { H1, H2, P, Code, Callout, Mono } from '@/components/docs/DocsPrimitives';

export default function VaultDepositPage() {
  return (
    <>
      <H1 tag="Getting Started">Deposit Pool Inventory</H1>
      <P>Before the Maker SDK can fill swaps, your <Mono>maker_pool</Mono> needs token inventory. Your pool is the counterparty in every swap you win — it sends <Mono>token_out</Mono> to the taker and receives <Mono>token_in</Mono> from the taker.</P>

      <H2 id="why-pool">Why does the pool hold inventory?</H2>
      <P>Atomic on-chain settlement requires the pool to already have the output tokens at the time the transaction executes. There is no flash-loan or JIT liquidity — the pool holds a real pre-funded balance. This guarantees that any accepted quote can always be settled.</P>

      <H2 id="how-to-deposit">How to deposit</H2>
      <P>Deposits are done from the dashboard, not a script. Go to <strong>/maker → Inventory</strong>, enter a USDC or EURC amount, and click <strong>Deposit</strong>. Each token is a 2-transaction flow that Freighter walks you through:</P>
      <Code>{`TX 1 — approve   (token.approve → your pool)
TX 2 — deposit   (pool.deposit moves tokens into the pool)`}</Code>
      <Callout type="info" title="Frontend-driven">The old standalone deposit-vault-inventory.ts script has been removed. Deposits and withdrawals both run through the /maker Inventory tab, signed in Freighter.</Callout>

      <H2 id="check-balance">Check your balance</H2>
      <Code>{`# mainnet
curl https://hyperdex.onrender.com/api/makers/YOUR_ADDRESS/inventory
# testnet
curl https://hyperdex-testnet.onrender.com/api/makers/YOUR_ADDRESS/inventory
# → { "usdc": "1000.0000000", "eurc": "500.0000000" }`}</Code>
      <Callout type="tip" title="EURC Inventory">EURC inventory is required for USDC → EURC swaps. Fund your maker wallet with mainnet EURC (buy on an exchange or acquire via the Stellar DEX) and deposit it before going live.</Callout>
    </>
  );
}
