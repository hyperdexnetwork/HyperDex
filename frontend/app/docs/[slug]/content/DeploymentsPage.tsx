import { H1, H2, P, Table, Callout } from '@/components/docs/DocsPrimitives';

export default function DeploymentsPage() {
  return (
    <>
      <H1 tag="Reference">Deployments</H1>
      <Callout type="info" title="Stellar Testnet">All addresses below are on Stellar Testnet. They use test funds only.</Callout>

      <H2 id="smart-contracts">Smart Contracts (Stellar Testnet)</H2>
      <Table
        headers={['Contract', 'Address']}
        rows={[
          ['pool_registry',      'CA4VDATAXPCSAJSDSTEZSCLVLIWMT6PYS5WJYITBQZWZ6JAFNP3Q5HNW'],
          ['quote_verifier',     'CAJ4UIEWD43ZH4F4HIL2NMPKZKLF5OHWNVJUUDQA2RH6A72ZRQVCCYS5'],
          ['maker_pool_factory', 'CAAQHM5YQUXIL62EJKVSXZDK45GIV4ZSTG4UAS5QFBQJN4ZSDDNXZWXD'],
          ['fee_distributor',    'CBVCMBPBGZZQGPFWII5HZCFPGSZ6HKR3URAQGXRDOFLYQVQS6GPSEPYR'],
          ['USDC (SAC)',         'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA'],
          ['EURC (SAC)',         'CCUUDM434BMZMYWYDITHFXHDMIVTGGD6T2I5UKNX5BSLXLW7HVR4MCGZ'],
        ]}
      />
      <Callout type="info" title="Per-maker pools">Each maker has their <strong>own</strong> maker_pool contract, deployed on demand by <strong>maker_pool_factory</strong> when they register. There is no single shared vault — a pool address is unique per maker and shown on the /maker dashboard.</Callout>

      <H2 id="service-urls">Service URLs</H2>
      <Table
        headers={['Service', 'Local Dev', 'Live (Testnet)']}
        rows={[
          ['Frontend',         'http://localhost:3000',   'https://hyperdex.live'],
          ['Backend REST',     'http://localhost:4000',   'https://hyperdex-testnet.onrender.com'],
          ['Backend WS',       'ws://localhost:4000/ws/maker', 'wss://hyperdex-testnet.onrender.com/ws/maker'],
          ['Maker SDK health', 'http://localhost:3001/health', '—'],
          ['Stellar Explorer', 'https://stellar.expert/explorer/testnet', 'https://stellar.expert/explorer/testnet'],
        ]}
      />
    </>
  );
}
