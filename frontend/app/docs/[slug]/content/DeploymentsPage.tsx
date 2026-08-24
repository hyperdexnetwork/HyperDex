import { H1, H2, P, Table, Callout } from '@/components/docs/DocsPrimitives';

export default function DeploymentsPage() {
  return (
    <>
      <H1 tag="Reference">Deployments</H1>
      <Callout type="warn" title="Live on Mainnet">All addresses below are on Stellar Mainnet (Public network). Transactions move real funds.</Callout>

      <H2 id="smart-contracts">Smart Contracts (Stellar Mainnet)</H2>
      <Table
        headers={['Contract', 'Address']}
        rows={[
          ['pool_registry',      'CDONQCEJFQHOUIFWB4X4K2MVSFXH6HLEYPWRBPTAUR4WZNP2FD4YSQWW'],
          ['quote_verifier',     'CDMOUCUKCZRMSYQE5TQ7QVGVUFJYFSP7XLLBHL3ZE2EQLZGZUFC4PHXK'],
          ['maker_pool_factory', 'CBDD5WBPCX6GSF4XIP6CAKAM3TCU6R73CW7QNYUTXXT3OAGEPFFACOI4'],
          ['fee_distributor',    'CAAWWYIUWKV2Z4OGAVBXNVRGRCN3QY3FF4M2BLV72V2MBNEVFLMSAU2R'],
          ['USDC (SAC)',         'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75'],
          ['EURC (SAC)',         'CDTKPWPLOURQA2SGTKTUQOWRCBZEORB4BWBOMJ3D3ZTQQSGE5F6JBQLV'],
        ]}
      />
      <Callout type="info" title="Per-maker pools">Each maker has their <strong>own</strong> maker_pool contract, deployed on demand by <strong>maker_pool_factory</strong> when they register. There is no single shared vault — a pool address is unique per maker and shown on the /maker dashboard.</Callout>

      <H2 id="service-urls">Service URLs</H2>
      <Table
        headers={['Service', 'Local Dev', 'Live (Mainnet)', 'Live (Testnet)']}
        rows={[
          ['Frontend',         'http://localhost:3000',   'https://hyperdex.live', 'https://hyperdex.live (network switcher)'],
          ['Backend REST',     'http://localhost:4000',   'https://hyperdex.onrender.com', 'https://hyperdex-testnet.onrender.com'],
          ['Backend WS',       'ws://localhost:4000/ws/maker', 'wss://hyperdex.onrender.com/ws/maker', 'wss://hyperdex-testnet.onrender.com/ws/maker'],
          ['Maker SDK health', 'http://localhost:3001/health', '—', '—'],
          ['Stellar Explorer', 'https://stellar.expert/explorer/public', '', 'https://stellar.expert/explorer/testnet'],
        ]}
      />
    </>
  );
}
