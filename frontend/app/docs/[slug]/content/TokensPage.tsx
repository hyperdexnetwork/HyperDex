import { H1, P, Table, Callout } from '@/components/docs/DocsPrimitives';

export default function TokensPage() {
  return (
    <>
      <H1 tag="Reference">Supported Tokens</H1>
      <Table
        headers={['Token', 'Type', 'Issuer (Testnet)', 'SAC Address (Testnet)']}
        rows={[
          ['USDC', 'USD Stablecoin', 'Circle testnet (GBBD47IF…FLA5, centre.io)', 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA'],
          ['EURC', 'EUR Stablecoin', 'Circle testnet (GB3Q6QDZ…ZTVO, circle.com)', 'CCUUDM434BMZMYWYDITHFXHDMIVTGGD6T2I5UKNX5BSLXLW7HVR4MCGZ'],
        ]}
      />
      <P>SAC = Stellar Asset Contract — the Soroban-compatible interface for Stellar classic assets. On testnet the two assets have different issuers, so add a trustline to each.</P>
      <Callout type="info" title="Adding more tokens">Adding a new token pair requires deploying or verifying its SAC address and wiring it into the maker_pool + oracle. Open a GitHub issue to request new pairs.</Callout>
    </>
  );
}
