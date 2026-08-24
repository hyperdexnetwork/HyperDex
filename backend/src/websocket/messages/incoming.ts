import { z } from 'zod';

const PriceLevelSchema = z.object({
  quantity: z.string(),
  price: z.string(),
});

// New format: one message with both BUY and SELL sides
export const PriceLevelsMessageSchema = z.object({
  type: z.literal('priceLevels'),
  message: z.object({
    tokenIn: z.string(),
    tokenOut: z.string(),
    buyLevels: z.array(PriceLevelSchema),
    sellLevels: z.array(PriceLevelSchema),
  }),
});

// Charset matters as much as length here. quoteId and salt are decoded with
// Buffer.from(x, 'hex'), which SILENTLY TRUNCATES on non-hex input — a bid with
// 64 non-hex characters verifies off-chain against exactly what the maker
// signed, then fails at simulation because quote_id is not BytesN<32>. Likewise
// amounts are gated with Number() but consumed with BigInt(), so "1e3" passes
// validation and throws deep in the auction. Pin both to an exact charset.
const Hex64 = z.string().regex(/^[0-9a-f]{64}$/, 'must be 64 lowercase hex chars');
const Uint = z.string().regex(/^\d+$/, 'must be a non-negative integer string');
const StellarAddress = z.string().regex(/^G[A-Z2-7]{55}$/, 'invalid Stellar address');
const ContractAddress = z.string().regex(/^C[A-Z2-7]{55}$/, 'invalid contract address');

export const RfqQuoteMessageSchema = z.object({
  type: z.literal('rfqQuote'),
  message: z.object({
    rfqId: z.string().uuid(),
    quoteId: Hex64,
    makerAddress: z.string(),
    takerAddress: StellarAddress,
    tokenIn: ContractAddress,
    tokenOut: ContractAddress,
    amountIn: Uint,
    amountOut: Uint,
    expiryTimestamp: z.number().int().positive(),
    salt: Hex64,
    signature: z.string().regex(/^[0-9a-f]{128}$/, 'must be 128 lowercase hex chars'),
    spreadBps: z.number().int().nonnegative().optional(),
  }),
});

export const RfqErrorMessageSchema = z.object({
  type: z.literal('rfqError'),
  message: z.object({
    rfqId: z.string().uuid(),
    reason: z.enum([
      'insufficient_liquidity',
      'pair_not_supported',
      'market_conditions',
      'internal_error',
      'rate_limit',
      'below_minimum',
      'above_maximum',
      'calculation_error',
    ]),
    expiryTimestampMs: z.number().optional(),
  }),
});

export const TradeAckMessageSchema = z.object({
  type: z.literal('tradeAck'),
  message: z.object({
    tradeEventId: z.string(),
  }),
});

export const PongMessageSchema = z.object({
  type: z.literal('pong'),
  timestamp: z.number(),
});

export const IncomingMessageSchema = z.discriminatedUnion('type', [
  PriceLevelsMessageSchema,
  RfqQuoteMessageSchema,
  RfqErrorMessageSchema,
  TradeAckMessageSchema,
  PongMessageSchema,
]);

export type IncomingMessage = z.infer<typeof IncomingMessageSchema>;
export type PriceLevelsMessage = z.infer<typeof PriceLevelsMessageSchema>;
export type RfqQuoteMessage = z.infer<typeof RfqQuoteMessageSchema>;
export type RfqErrorMessage = z.infer<typeof RfqErrorMessageSchema>;
export type TradeAckMessage = z.infer<typeof TradeAckMessageSchema>;
export type PongMessage = z.infer<typeof PongMessageSchema>;
