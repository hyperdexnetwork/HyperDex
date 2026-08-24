import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { Trade } from '../db/models/Trade';
import { ValidationError, NotFoundError } from '../utils/errors';
import { config } from '../config';

const router = Router();

const statusLimiter = rateLimit({
  windowMs: 60_000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

const listLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

const STELLAR_ADDRESS = /^G[A-Z2-7]{55}$/;

router.get('/api/trades', listLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { makerAddress, takerAddress, status } = req.query;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = Math.max(0, parseInt(req.query.offset as string) || 0);

    // Express's qs parser turns ?makerAddress[$ne]=x into an OBJECT, so passing
    // req.query straight into a Mongo filter lets a caller inject operators.
    // status was already allow-listed; these two were not. Validating the shape
    // also blocks $regex scans against indexed fields, which are a cheap way to
    // pin the database from an unauthenticated endpoint.
    const filter: Record<string, unknown> = {};
    if (makerAddress !== undefined) {
      if (typeof makerAddress !== 'string' || !STELLAR_ADDRESS.test(makerAddress)) {
        throw new ValidationError('Invalid makerAddress');
      }
      filter.makerAddress = makerAddress;
    }
    if (takerAddress !== undefined) {
      if (typeof takerAddress !== 'string' || !STELLAR_ADDRESS.test(takerAddress)) {
        throw new ValidationError('Invalid takerAddress');
      }
      filter.takerAddress = takerAddress;
    }
    if (status) {
      if (typeof status !== 'string') throw new ValidationError('Invalid status value');
      const valid = ['quoted', 'submitted', 'confirmed', 'failed', 'expired'];
      if (!valid.includes(status as string)) throw new ValidationError('Invalid status value');
      filter.status = status;
    }

    const [trades, total] = await Promise.all([
      Trade.find(filter).sort({ quotedAt: -1 }).skip(offset).limit(limit).lean(),
      Trade.countDocuments(filter),
    ]);

    res.json({ trades, total, hasMore: offset + limit < total });
  } catch (err) {
    next(err);
  }
});

router.get('/api/stats', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const matchFilter = { quotedAt: { $gte: since24h }, status: { $in: ['confirmed', 'submitted'] } };

    const [stats, activeMakers, topPairsRaw] = await Promise.all([
      Trade.aggregate([
        { $match: matchFilter },
        {
          $group: {
            _id: null,
            totalVolume24h: { $sum: { $toDouble: '$amountInUsd' } },
            totalTrades24h: { $sum: 1 },
            totalFeesCollected: { $sum: { $toDouble: '$feeAmount' } },
          },
        },
      ]),
      Trade.distinct('makerAddress', { quotedAt: { $gte: since24h } }),
      Trade.aggregate([
        { $match: matchFilter },
        {
          $group: {
            _id: { tokenIn: '$tokenIn', tokenOut: '$tokenOut' },
            volume24h: { $sum: { $toDouble: '$amountInUsd' } },
          },
        },
        { $sort: { volume24h: -1 } },
        { $limit: 5 },
        { $project: { _id: 0, tokenIn: '$_id.tokenIn', tokenOut: '$_id.tokenOut', volume24h: 1 } },
      ]),
    ]);

    const s = stats[0] ?? { totalVolume24h: 0, totalTrades24h: 0, totalFeesCollected: 0 };

    res.json({
      totalVolume24h: s.totalVolume24h ?? 0,
      totalTrades24h: s.totalTrades24h ?? 0,
      activeMakers: activeMakers.length,
      totalFeesCollected: s.totalFeesCollected ?? 0,
      topPairs: topPairsRaw,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/api/trades/:quoteId/status', statusLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { quoteId } = req.params;
    const trade = await Trade.findOne({ quoteId }).lean();
    if (!trade) throw new NotFoundError(`Trade not found: ${quoteId}`);

    const network = config.STELLAR_NETWORK === 'mainnet' ? 'public' : 'testnet';
    const explorerUrl = trade.txHash
      ? `https://stellar.expert/explorer/${network}/tx/${trade.txHash}`
      : null;

    res.json({
      quoteId: trade.quoteId,
      status: trade.status,
      txHash: trade.txHash,
      confirmedAt: trade.confirmedAt ? trade.confirmedAt.toISOString() : null,
      amountIn: trade.amountIn,
      amountOut: trade.amountOut,
      explorerUrl,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
