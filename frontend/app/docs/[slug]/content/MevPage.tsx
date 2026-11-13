import { H1, H2, P, Ul, Li } from '@/components/docs/DocsPrimitives';

export default function MevPage() {
  return (
    <>
      <H1 tag="Concepts">MEV Protection</H1>
      <P>MEV (Maximal Extractable Value) refers to the profit that can be extracted by reordering, inserting, or censoring transactions — typically by frontrunners who observe pending swaps in the mempool and trade ahead of them.</P>

      <H2 id="how-hyperdex-eliminates-mev">How HyperDex limits MEV</H2>
      <P>HyperDex removes the price-manipulation forms of MEV (front-running and sandwiching) by design. Ordering and inclusion are still up to the network, so a delayed transaction can still miss the quote&apos;s expiry:</P>
      <Ul>
        <Li><strong>No visible pending price:</strong> The taker&apos;s intended trade is not visible on-chain until after it is settled. There is no &quot;swap X for Y at price Z&quot; sitting in a mempool.</Li>
        <Li><strong>Price locked at quote time:</strong> By the time the taker submits the transaction, the price is already cryptographically fixed in the signed quote. A frontrunner cannot change the rate the taker receives.</Li>
        <Li><strong>No on-chain price oracle:</strong> AMM-based DEXes expose their price through the bonding curve state. HyperDex has no on-chain price — nothing for a sandwich bot to manipulate.</Li>
        <Li><strong>Direct maker settlement:</strong> Trades go directly between the taker and the maker&apos;s own maker_pool. There is no shared AMM pool to drain or rebalance.</Li>
      </Ul>
    </>
  );
}
