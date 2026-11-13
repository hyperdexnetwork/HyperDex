import { H1, P, Ul, Li, Mono } from '@/components/docs/DocsPrimitives';

export default function ZeroSlippagePage() {
  return (
    <>
      <H1 tag="Concepts">Zero Slippage</H1>
      <P>Slippage occurs when the price you receive differs from the price you expected. On AMMs, slippage is a mathematical certainty — every trade moves the bonding curve, making the next unit of the trade worse.</P>
      <P>On HyperDex the price is fixed before you sign. Here is why:</P>
      <Ul>
        <Li>The maker quotes an exact <Mono>amount_out</Mono> for an exact <Mono>amount_in</Mono></Li>
        <Li>This quote is cryptographically signed with the maker&apos;s ed25519 key</Li>
        <Li>The <Mono>quote_verifier</Mono> contract verifies the signature and enforces the exact amounts</Li>
        <Li>If the amounts do not match the signed quote, the transaction reverts</Li>
      </Ul>
      <P>The taker receives the signed <Mono>amount_out</Mono> minus the disclosed 0.10% protocol fee, which the swap screen shows before you sign. The maker absorbs market risk between quote time and settlement.</P>
      <P><strong>Limits.</strong> A fixed price is not guaranteed execution. The trade can still fail, without loss to the taker, if the quote expires, if the maker no longer has enough inventory in its pool, or if the maker has rotated its signing key. The protocol fee is set by the admin and is not yet part of the signed quote; binding it into the quote is planned.</P>
    </>
  );
}
