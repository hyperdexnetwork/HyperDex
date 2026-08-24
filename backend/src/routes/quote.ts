import { Router, Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { RfqRouter } from '../rfq/RfqRouter';
import { Trade } from '../db/models/Trade';
import { Maker } from '../db/models/Maker';
import {
  ValidationError,
  NotFoundError,
  NoMakersError,
  QuoteRefusedError,
  QuoteTimeoutError,
} from '../utils/errors';
import { config } from '../config';
import { logger } from '../utils/logger';
import { auctionStore } from '../rfq/AuctionStore';
import { MakerConnectionRegistry } from '../websocket/MakerConnection';
import { PriceBook } from '../pricebook/PriceBook';
import { rateLimitStore } from '../rfq/RateLimitStore';
import { getCachedProtocolFeeBps } from '../utils/protocolFee';
import { preflightTaker } from '../rfq/preflight';

const router = Router();

const limiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
});

// Auctions fan out RFQs to every connected maker, so they need a tighter cap
// than plain reads. Keyed by taker address when present, falling back to IP.
const auctionLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  keyGenerator: (req) => (req.body?.takerAddress as string) || req.ip || 'unknown',
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many quote requests. Please wait before trying again.',
      },
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Result polling is frequent (once/sec for ~30s) but cheap; allow generous IP-based polling.
const resultLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  keyGenerator: (req) => req.ip || 'unknown',
  standardHeaders: true,
  legacyHeaders: false,
});

const QuoteRequestSchema = z.object({
  tokenIn: z.string().min(1),
  tokenOut: z.string().min(1),
  amountIn: z.string().regex(/^\d+$/, 'amountIn must be a positive integer string'),
  takerAddress: z.string().regex(/^G[A-Z2-7]{55}$/, 'invalid Stellar address'),
});

const ConfirmSchema = z.object({
  quoteId: z.string().regex(/^[0-9a-f]{64}$/, 'invalid quoteId'),
  txHash: z.string().regex(/^[0-9a-f]{64}$/, 'invalid txHash'),
  takerAddress: z.string().regex(/^G[A-Z2-7]{55}$/, 'invalid Stellar address'),
});

// This endpoint only HINTS which transaction to look at — the poller refuses to
// confirm anything without a matching quote_executed event on chain. It is still
// rate limited, because quoteId and takerAddress are both public.
const confirmLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  keyGenerator: (req) => (req.body?.takerAddress as string) || req.ip || 'unknown',
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/api/quote', limiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = QuoteRequestSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PARAMS',
          message: body.error.issues.map(i => i.message).join('; '),
        },
      });
      return;
    }

    const { tokenIn, tokenOut, amountIn, takerAddress } = body.data;
    const usdc = config.USDC_CONTRACT_ADDRESS;
    const eurc = config.EURC_CONTRACT_ADDRESS;

    if (![usdc, eurc].includes(tokenIn)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'tokenIn must be USDC or EURC' },
      });
      return;
    }
    if (![usdc, eurc].includes(tokenOut)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'tokenOut must be USDC or EURC' },
      });
      return;
    }
    if (tokenIn === tokenOut) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'tokenIn and tokenOut must differ' },
      });
      return;
    }

    const quote = await RfqRouter.getInstance().requestQuote({
      tokenIn,
      tokenOut,
      amountIn,
      takerAddress,
    });
    res.json({ success: true, quote });
  } catch (err) {
    if (err instanceof NoMakersError) {
      res.status(503).json({
        success: false,
        error: { code: 'NO_MAKERS', message: err.message },
      });
      return;
    }
    if (err instanceof QuoteRefusedError) {
      res.status(503).json({
        success: false,
        error: { code: 'QUOTE_REFUSED', message: err.message, reasons: err.reasons },
      });
      return;
    }
    if (err instanceof QuoteTimeoutError) {
      res.status(503).json({
        success: false,
        error: { code: 'QUOTE_TIMEOUT', message: err.message },
      });
      return;
    }
    if (err instanceof ValidationError) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_PARAMS', message: (err as Error).message },
      });
      return;
    }
    next(err);
  }
});

router.post('/api/quote/confirm', confirmLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = ConfirmSchema.safeParse(req.body);
    if (!body.success) {
      throw new ValidationError(body.error.issues.map(i => i.message).join('; '));
    }

    const { quoteId, txHash, takerAddress } = body.data;
    const trade = await Trade.findOne({ quoteId });
    if (!trade) throw new NotFoundError(`Trade not found for quoteId: ${quoteId}`);
    if (trade.takerAddress !== takerAddress) throw new ValidationError('takerAddress mismatch');

    // Never overwrite a hash already being tracked. Otherwise a caller could
    // point a genuine in-flight trade at a different transaction and the real
    // settlement would stop being followed.
    if (trade.txHash && trade.txHash !== txHash) {
      res.status(409).json({
        success: false,
        error: {
          code: 'ALREADY_SUBMITTED',
          message: 'This quote is already being tracked against another transaction',
        },
      });
      return;
    }
    if (trade.status === 'confirmed') {
      res.json({ success: true, status: 'confirmed' });
      return;
    }

    trade.status = 'submitted';
    trade.txHash = txHash;
    trade.submittedAt = new Date();
    await trade.save();

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/quote/start ───────────────────────────────────────────────────

router.post('/api/quote/start', auctionLimiter, async (req: Request, res: Response) => {
  try {
    const { tokenIn, tokenOut, amountIn, takerAddress } = req.body

    const usdc = config.USDC_CONTRACT_ADDRESS
    const eurc = config.EURC_CONTRACT_ADDRESS

    if (![usdc, eurc].includes(tokenIn) || ![usdc, eurc].includes(tokenOut)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'Unsupported token. Supported: USDC, EURC' }
      })
      return
    }
    if (tokenIn === tokenOut) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'tokenIn and tokenOut must be different' }
      })
      return
    }
    // Must match the stricter /api/quote validation: amountIn is forwarded to
    // makers as the value to sign and is later parsed with BigInt, so decimals
    // and exponent notation ("1.5", "1e9", "0x10") must be rejected here rather
    // than throwing downstream.
    if (typeof amountIn !== 'string' || !/^\d+$/.test(amountIn) || BigInt(amountIn) <= 0n) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'amountIn must be a positive integer string' }
      })
      return
    }
    if (!takerAddress || !/^G[A-Z2-7]{55}$/.test(takerAddress)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'Invalid taker address' }
      })
      return
    }

    // Pre-flight the taker BEFORE opening an auction. Without this, a wallet
    // that cannot receive tokenOut still fans an RFQ out to every maker, waits
    // the full 30s window, and fails inside the SAC with a raw HostError.
    const pre = await preflightTaker({ takerAddress, tokenIn, tokenOut, amountIn })
    if (!pre.ok) {
      logger.info('Quote request rejected by pre-flight', {
        code: pre.code,
        taker: takerAddress.slice(0, 8),
        token: pre.token,
      })
      res.status(400).json({
        success: false,
        error: {
          code:      pre.code,
          message:   pre.message,
          token:     pre.token,
          asset:     pre.asset,
          required:  pre.required,
          available: pre.available,
        }
      })
      return
    }

    const rankedMakers = PriceBook.getInstance().getBestMakers(
      tokenIn, tokenOut, Number(amountIn)
    )

    if (rankedMakers.length === 0) {
      res.status(503).json({
        success: false,
        error: { code: 'NO_MAKERS', message: 'No market makers are currently online' }
      })
      return
    }

    const auctionId = randomUUID()
    const WINDOW_MS = 30_000

    auctionStore.create({
      auctionId,
      tokenIn,
      tokenOut,
      amountIn,
      takerAddress,
      makerCount: rankedMakers.length,
      windowMs: WINDOW_MS
    })

    // Cap fan-out. Without this the sealed-bid path dispatched to EVERY
    // connected maker, so each one learned the taker's address, pair and size
    // for every trade on the venue — and RFQ_MAX_MAKERS, which the operator
    // believes bounds this, only ever applied to the legacy /api/quote path.
    const registry = MakerConnectionRegistry.getInstance()
    let dispatched = 0
    for (const maker of rankedMakers.slice(0, config.RFQ_MAX_MAKERS)) {
      if (rateLimitStore.isLimited(maker.makerId, takerAddress)) continue
      const conn = registry.getConnection(maker.makerId)
      if (!conn) continue

      conn.send({
        type: 'rfq',
        message: {
          rfqId:       auctionId,
          takerAddress,
          tokenIn,
          tokenOut,
          amountIn,
          feesBps:     getCachedProtocolFeeBps(),
          requestedAt: Date.now()
        }
      })
      dispatched++

      logger.info('RFQ dispatched', {
        auctionId: auctionId.slice(0, 8),
        maker:     maker.makerId.slice(0, 8)
      })
    }

    if (dispatched === 0) {
      res.status(503).json({
        success: false,
        error: { code: 'NO_MAKERS', message: 'No makers available (all rate-limited)' }
      })
      return
    }

    setTimeout(() => {
      void auctionStore.complete(auctionId)
    }, WINDOW_MS + 500)

    res.json({
      success:       true,
      auctionId,
      makerCount:    dispatched,
      windowSeconds: 30,
      message:       `Collecting sealed bids from ${dispatched} maker(s)`
    })

  } catch (err: any) {
    logger.error('Error starting auction', { err: err.message })
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: err.message }
    })
  }
})

// ─── GET /api/quote/result/:auctionId ────────────────────────────────────────

router.get('/api/quote/result/:auctionId', resultLimiter, async (req: Request, res: Response) => {
  try {
    const { auctionId } = req.params
    const auction = auctionStore.get(auctionId)

    if (!auction) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Auction not found' }
      })
      return
    }

    if (auction.status === 'collecting') {
      const elapsed   = Date.now() - auction.startedAt
      const remaining = Math.max(0, Math.ceil((auction.windowMs - elapsed) / 1000))
      res.json({
        success:          true,
        status:           'collecting',
        auctionId,
        quotesReceived:   auction.quotes.length,
        makerCount:       auction.makerCount,
        secondsRemaining: remaining
      })
      return
    }

    if (auction.status === 'no_quotes') {
      res.json({
        success:  true,
        status:   'no_quotes',
        auctionId,
        message:  'No makers submitted bids for this trade'
      })
      return
    }

    if (auction.status === 'completed' && auction.bestQuote) {
      const q = auction.bestQuote

      let makerName = 'Market Maker'
      try {
        const maker = await Maker.findOne({ stellarAddress: q.makerAddress })
        if (maker?.name) makerName = maker.name
      } catch { /* ignore */ }

      // The maker signs the GROSS amount_out. On-chain, quote_verifier carves the
      // protocol fee out of it — fee = floor(amount_out * fee_bps / 10_000) — and
      // pays the taker taker_gets = amount_out - fee. Show the trader that NET
      // figure (and the fee) so the "You receive" number matches the actual payout,
      // not the pre-fee amount. amountOut (raw/gross) stays untouched because the
      // taker's signature is over the gross value the frontend puts in the tx.
      // Fee comes from the contract, not the env copy — see utils/protocolFee.
      const feeBps    = BigInt(getCachedProtocolFeeBps())
      const grossOut  = BigInt(q.amountOut)
      const feeAmount = (grossOut * feeBps) / 10_000n
      const netOut    = grossOut - feeAmount

      const amtIn    = Number(auction.amountIn)
      const rate     = (Number(netOut) / amtIn).toFixed(7)
      const humanIn  = (amtIn  / 1e7).toFixed(7)
      const humanOut = (Number(netOut)   / 1e7).toFixed(7)
      const humanGrossOut = (Number(grossOut) / 1e7).toFixed(7)
      const humanFee = (Number(feeAmount) / 1e7).toFixed(7)
      const inSym    = auction.tokenIn  === config.USDC_CONTRACT_ADDRESS ? 'USDC' : 'EURC'
      const outSym   = auction.tokenOut === config.USDC_CONTRACT_ADDRESS ? 'USDC' : 'EURC'

      res.json({
        success:  true,
        status:   'completed',
        auctionId,
        bestQuote: {
          quoteId:         q.quoteId,
          makerAddress:    q.makerAddress,
          takerAddress:    auction.takerAddress,
          makerName,
          tokenIn:         auction.tokenIn,
          tokenOut:        auction.tokenOut,
          amountIn:        auction.amountIn,
          amountOut:       q.amountOut,
          expiryTimestamp: q.expiryTimestamp,
          salt:            q.salt,
          signature:       q.signature,
          rate:            `1 ${inSym} = ${rate} ${outSym}`,
          humanAmountIn:   humanIn,
          humanAmountOut:  humanOut,       // NET of protocol fee — what the taker actually receives
          humanAmountOutGross: humanGrossOut, // maker's quoted amount_out before fee
          humanFee:        humanFee,       // protocol fee carved out on-chain
          feeBps:          Number(feeBps),
          quotesReceived:  auction.quotes.length,
          allBidsCount:    auction.quotes.length
        }
      })
      return
    }

    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Unknown state' }
    })

  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: err.message }
    })
  }
})

export default router;
