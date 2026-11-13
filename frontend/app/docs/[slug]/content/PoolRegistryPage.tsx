import { H1, H2, P, Ul, Li, Table, Mono } from '@/components/docs/DocsPrimitives';

export default function PoolRegistryPage() {
  return (
    <>
      <H1 tag="Programs">pool_registry</H1>
      <P>The <Mono>pool_registry</Mono> is the identity and access control layer for the entire protocol. It answers one question: <em>is this address a registered, active maker, and what is their signing key?</em></P>

      <H2 id="why-it-exists">Why it exists</H2>
      <P>Without a registry, anyone could claim to be a maker and submit signed quotes. The registry ensures that only entities who have explicitly registered (and been approved off-chain) can have their signatures accepted by the quote_verifier.</P>

      <H2 id="storage">Storage</H2>
      <P>For each registered maker, the registry stores:</P>
      <Ul>
        <Li><Mono>signer_pubkey</Mono> — the ed25519 public key used to verify quote signatures</Li>
        <Li><Mono>is_active</Mono> — boolean flag; false means maker is suspended</Li>
        <Li><Mono>registered_at</Mono> — ledger sequence number of registration</Li>
      </Ul>

      <H2 id="functions">Functions</H2>
      <Table
        headers={['Function', 'Caller', 'Description']}
        rows={[
          ['register_maker(maker, signer_pubkey)', 'Maker', 'Registers maker address with their ed25519 signing key. Maker must sign the transaction.'],
          ['update_signer(maker, new_signer)', 'Maker', 'Rotates the hot signing key. Use this if the signing key is compromised.'],
          ['deactivate_maker(maker)', 'Admin', "Sets is_active = false. Maker's signatures will be rejected by quote_verifier."],
          ['reactivate_maker(maker)', 'Admin', 'Restores is_active = true.'],
          ['get_maker(address)', 'Anyone', 'Returns maker info struct.'],
          ['is_active(address)', 'Anyone (called by quote_verifier)', 'Returns bool.'],
          ['get_signer(address)', 'Anyone (called by quote_verifier)', 'Returns ed25519 public key bytes.'],
        ]}
      />
      <P><strong>Address:</strong> <Mono>CA4VDATAXPCSAJSDSTEZSCLVLIWMT6PYS5WJYITBQZWZ6JAFNP3Q5HNW</Mono></P>
    </>
  );
}
