import { H1, H2, P, Mono, Callout } from '@/components/docs/DocsPrimitives';

export default function Ed25519Page() {
  return (
    <>
      <H1 tag="Concepts">Quote Signing (ed25519)</H1>
      <Callout type="info" title="Changing in v3">v3 replaces the custom ed25519 quote signature with Soroban&apos;s own authorization: the maker SDK signs an authorization entry for the exact trade, bound to the contract and the network, with built-in replay protection. See <strong>v3 &amp; Roadmap</strong>.</Callout>
      <P>Every quote in HyperDex must be signed by the maker&apos;s registered ed25519 hot key. This is what makes the protocol trustless: the on-chain contract independently verifies the signature before executing any swap.</P>

      <H2 id="why-ed25519">Why ed25519?</H2>
      <P>ed25519 is a fast, secure elliptic-curve signature scheme natively supported by Stellar and Soroban. It produces 64-byte signatures that can be verified in a single Soroban instruction. It is the same scheme used by Stellar keypairs, making SDK integration straightforward.</P>

      <H2 id="what-is-signed">What is signed?</H2>
      <P>The maker signs <Mono>SHA256(XDR(quote))</Mono> — the SHA-256 hash of the XDR-encoded Quote struct. This ensures the signature covers every field of the quote (amounts, addresses, expiry, salt) and cannot be reused for a different quote.</P>

      <H2 id="hot-key-vs-wallet">Hot key vs. wallet key</H2>
      <P>The signing key is a <strong>hot key</strong> that lives in the Maker SDK. It is separate from the maker&apos;s Stellar wallet keypair, which controls the maker_pool inventory. This separation limits exposure: if the hot key is compromised, the attacker can sign fake quotes but cannot withdraw pool funds.</P>
    </>
  );
}
