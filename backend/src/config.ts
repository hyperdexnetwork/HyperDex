import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const configSchema = z.object({
  PORT: z.string().default('4000').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  MONGODB_DB_NAME: z.string().default('hyperdex'),

  // Testnet only: any value other than 'testnet' fails config validation at startup.
  STELLAR_NETWORK: z.literal('testnet').default('testnet'),
  STELLAR_RPC_URL: z.string().url().default('https://soroban-testnet.stellar.org'),
  HORIZON_URL: z.string().url().default('https://horizon-testnet.stellar.org'),
  USDC_CONTRACT_ADDRESS: z.string().min(1, 'USDC_CONTRACT_ADDRESS is required'),
  EURC_CONTRACT_ADDRESS: z.string().min(1, 'EURC_CONTRACT_ADDRESS is required'),
  POOL_REGISTRY_CONTRACT_ADDRESS: z.string().min(1, 'POOL_REGISTRY_CONTRACT_ADDRESS is required'),
  MAKER_POOL_FACTORY_ADDRESS: z.string().optional(),
  ADMIN_ADDRESS: z.string().optional(),
  PROTOCOL_FEE_BPS: z.string().default('10').transform(Number),

  API_KEY_SALT_ROUNDS: z.string().default('10').transform(Number),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  RFQ_TIMEOUT_MS: z.string().default('750').transform(Number),
  RFQ_MAX_MAKERS: z.string().default('3').transform(Number),
  PRICE_LEVEL_STALE_MS: z.string().default('5000').transform(Number),
  WS_PING_INTERVAL_MS: z.string().default('30000').transform(Number),
  WS_PONG_TIMEOUT_MS: z.string().default('10000').transform(Number),
  // Per-connection inbound message rate limit (token bucket). Sized for a maker
  // pushing frequent price updates plus RFQ responses; well above legitimate traffic.
  WS_MAX_MESSAGES_PER_SEC: z.string().default('25').transform(Number),
  WS_MESSAGE_BURST: z.string().default('50').transform(Number),

  RATE_LIMIT_WINDOW_MS: z.string().default('1000').transform(Number),
  RATE_LIMIT_MAX_REQUESTS: z.string().default('10').transform(Number),

  POLL_INTERVAL_MS: z.coerce.number().default(5000),
  TX_TIMEOUT_MS: z.coerce.number().default(300_000),
  POLL_CONCURRENCY: z.coerce.number().default(10),
  QUOTE_VERIFIER_CONTRACT_ADDRESS: z.string().min(1, 'QUOTE_VERIFIER_CONTRACT_ADDRESS is required'),
});

const parsed = configSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map(i => `  ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const config = parsed.data;

export const CORS_ORIGIN_LIST = config.CORS_ORIGINS.split(',').map(s => s.trim());

// Single source of truth for the network passphrase (Stellar Testnet).
export const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
