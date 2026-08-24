// Central network configuration for the maker SDK.
//
// Every network-specific value resolves through env vars first, falling back to
// the per-network defaults below. Set STELLAR_NETWORK=mainnet (plus the mainnet
// RPC/token env vars) to run against production. No testnet value is hardcoded
// into any operational code path anymore.

export const NETWORK_CONFIG = {
  testnet: {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    usdc: 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
    // Circle's testnet EURC SAC, issued by GB3Q6QDZ… (home_domain circle.com).
    // Note this is NOT the same issuer as the testnet USDC above, which comes
    // from GBBD47IF… (centre.io) — Circle runs separate testnet issuers per
    // asset, so the two addresses intentionally do not share an issuer.
    eurc: 'CCUUDM434BMZMYWYDITHFXHDMIVTGGD6T2I5UKNX5BSLXLW7HVR4MCGZ',
    passphrase: 'Test SDF Network ; September 2015',
  },
  mainnet: {
    rpcUrl: 'https://mainnet.sorobanrpc.com',
    // Mainnet USDC SAC (contract) address.
    usdc: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
    // No default: the EURC Stellar Asset Contract (C...) address MUST be supplied
    // via EURC_CONTRACT_ADDRESS on mainnet. A blank default fails closed rather
    // than shipping a wrong (issuer G...) address that silently breaks EURC.
    eurc: '',
    passphrase: 'Public Global Stellar Network ; September 2015',
  },
} as const;

const NETWORK = process.env.STELLAR_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
export const ACTIVE_CONFIG = NETWORK_CONFIG[NETWORK];

export const STELLAR_RPC = process.env.STELLAR_RPC_URL || ACTIVE_CONFIG.rpcUrl;
export const NETWORK_PASSPHRASE = ACTIVE_CONFIG.passphrase;
export const USDC_CONTRACT =
  process.env.USDC_CONTRACT_ADDRESS || process.env.USDC_CONTRACT || ACTIVE_CONFIG.usdc;
export const EURC_CONTRACT =
  process.env.EURC_CONTRACT_ADDRESS || process.env.EURC_CONTRACT || ACTIVE_CONFIG.eurc;

// Fail closed on mainnet if token contracts aren't explicitly configured, and
// reject issuer (G...) addresses — a SAC token address must be a contract (C...).
if (NETWORK === 'mainnet') {
  for (const [name, val] of [['USDC', USDC_CONTRACT], ['EURC', EURC_CONTRACT]] as const) {
    if (!val) {
      throw new Error(
        `${name}_CONTRACT_ADDRESS is required on mainnet. Set it to the ${name} Stellar Asset Contract (C...) address.`
      );
    }
    if (!val.startsWith('C')) {
      throw new Error(
        `${name}_CONTRACT_ADDRESS must be a Stellar Asset Contract (C...) address, got "${val}". An issuer account (G...) is not a token contract.`
      );
    }
  }
}

// pool_registry contract address (network-specific, set at deploy time).
export const POOL_REGISTRY =
  process.env.POOL_REGISTRY_CONTRACT_ADDRESS || process.env.POOL_REGISTRY_CONTRACT || '';
