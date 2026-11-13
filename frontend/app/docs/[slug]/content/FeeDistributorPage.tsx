import { H1, H2, P, Table, Mono } from '@/components/docs/DocsPrimitives';

export default function FeeDistributorPage() {
  return (
    <>
      <H1 tag="Programs">fee_distributor</H1>
      <P>The <Mono>fee_distributor</Mono> is a simple accounting contract that accumulates protocol fees and provides a controlled withdrawal path to the treasury.</P>

      <H2 id="design-rationale">Design rationale</H2>
      <P>Separating fee collection from pool custody means treasury withdrawal operations never touch maker inventory. An admin action on fee_distributor cannot accidentally affect taker or maker funds held in a maker_pool.</P>

      <H2 id="functions">Functions</H2>
      <Table
        headers={['Function', 'Caller', 'Description']}
        rows={[
          ['withdraw_fees(token)', 'Admin', 'Sweeps the contract’s whole balance of the token to the treasury'],
          ['get_fees(token)', 'Anyone', 'Returns the contract’s current balance of the token'],
        ]}
      />
      <P>Fees arrive by a direct token transfer from the maker&apos;s pool during <Mono>execute_swap</Mono>; there is no separate collect call.</P>
      <P><strong>Current fee rate:</strong> 10 bps (0.10%) of <Mono>amount_out</Mono></P>
      <P><strong>Address:</strong> <Mono>CBVCMBPBGZZQGPFWII5HZCFPGSZ6HKR3URAQGXRDOFLYQVQS6GPSEPYR</Mono></P>
    </>
  );
}
