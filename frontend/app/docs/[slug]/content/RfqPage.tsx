import { H1, H2, P, Table } from '@/components/docs/DocsPrimitives';

export default function RfqPage() {
  return (
    <>
      <H1 tag="Concepts">Request-for-Quote (RFQ)</H1>
      <P>RFQ is a trading model where a buyer (the taker) requests a price for a specific trade, and one or more sellers (makers) respond with firm, binding quotes. The taker then selects the best quote and executes it.</P>
      <P>This is the model used by institutional OTC trading desks, and it produces far better outcomes than AMMs for large trades:</P>

      <H2 id="amm-vs-rfq">AMM vs RFQ Comparison</H2>
      <Table
        headers={['Property', 'AMM (Uniswap-style)', 'RFQ (HyperDex)']}
        rows={[
          ['Price source', 'Bonding curve (x·y=k)', 'Competing professional makers'],
          ['Slippage', 'Always — increases with size', 'Zero — price is fixed at quote time'],
          ['MEV exposure', 'High — mempool visible', 'Low — price locked before submission; quote executable only by the named taker'],
          ['Large trade quality', 'Degrades with size', 'Consistent — makers hedge externally'],
          ['Price transparency', 'On-chain visible', 'Private until settlement'],
        ]}
      />
    </>
  );
}
