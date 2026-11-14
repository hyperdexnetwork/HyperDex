import { H1, H2, P, Ul, Li, Table, Mono, Callout } from '@/components/docs/DocsPrimitives';

export default function FeesPage() {
  return (
    <>
      <H1 tag="Concepts">Protocol Fees</H1>
      <Callout type="info" title="Changing in v3">In v3 the fee (10 bps) becomes part of the terms both sides sign, with a hard cap of 50 bps, and the taker sets a minimum amount out. A fee change after signing makes the trade revert instead of paying the taker less. See <strong>v3 &amp; Roadmap</strong>.</Callout>
      <P>HyperDex charges a <strong>10 basis point (0.10%) protocol fee</strong> on each settled swap, deducted from <Mono>amount_out</Mono> before the taker receives it.</P>

      <H2 id="fee-flow">Fee flow</H2>
      <Ul>
        <Li>Maker quotes <Mono>amount_out = 109.00 USDC</Mono> for <Mono>amount_in = 100.00 EURC</Mono></Li>
        <Li>Protocol fee = <Mono>109.00 × 0.001 = 0.109 USDC</Mono></Li>
        <Li>Taker receives <Mono>108.891 USDC</Mono></Li>
        <Li><Mono>fee_distributor</Mono> accumulates <Mono>0.109 USDC</Mono></Li>
      </Ul>

      <H2 id="fee-withdrawal">Fee withdrawal</H2>
      <P>Accumulated fees are withdrawn by the admin to a treasury address via <Mono>fee_distributor.withdraw()</Mono>. This is the only admin-privileged operation in the core protocol flow.</P>

      <Table
        headers={['Parameter', 'Value']}
        rows={[
          ['Fee rate', '10 bps (0.10%)'],
          ['Deducted from', 'amount_out (what taker receives)'],
          ['Recipient', 'fee_distributor contract'],
          ['Withdrawal', 'Admin-only, to treasury address'],
        ]}
      />
    </>
  );
}
