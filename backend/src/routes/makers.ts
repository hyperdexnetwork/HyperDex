import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import axios from 'axios';
import { Maker } from '../db/models/Maker';
import { PendingMaker } from '../db/models/PendingMaker';
import { ApiKey } from '../db/models/ApiKey';
import { Trade } from '../db/models/Trade';
import {
  getWalletTokenBalance,
  getPoolAddressFromRegistry,
  getMakerPoolBalance,
  invalidateSignerKeyCache,
} from '../utils/stellarUtils';
import { rateLimitStore } from '../rfq/RateLimitStore';
import { MakerConnectionRegistry } from '../websocket/MakerConnection';
import { PriceBook } from '../pricebook/PriceBook';
import { ValidationError, NotFoundError } from '../utils/errors';
import { config } from '../config';
import { requireAdmin } from '../middleware/requireAdmin';

/**
 * Authenticate the caller as a maker via `Authorization: Bearer <sk_live_...>`.
 * Returns the matched ApiKey doc (with makerId) or null. Shared by the routes
 * that mutate maker-owned state.
 */
async function authMakerByApiKey(req: Request) {
  const authHeader = req.headers.authorization ?? '';
  const rawKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!rawKey) return null;
  const prefix = rawKey.slice(0, 15);
  const apiKeyDoc = await ApiKey.findOne({ keyPrefix: prefix, active: true });
  if (!apiKeyDoc) return null;
  const valid = await bcrypt.compare(rawKey, apiKeyDoc.keyHash);
  if (!valid) return null;
  return apiKeyDoc;
}

const router = Router();

const verifyKeyLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

const applyLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
});

// The pool/inventory reads fan one HTTP request out to several Soroban RPC
// calls plus Horizon, and they accept ANY well-formed G-address. Unlimited,
// they are a free amplifier against our own RPC quota — which also starves
// quoting, since bid verification depends on the same RPC.
const chainReadLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  keyGenerator: (req) => req.ip || 'unknown',
  standardHeaders: true,
  legacyHeaders: false,
});

/** Horizon has no default timeout; a hung upstream would pin a request handler. */
const HORIZON_TIMEOUT_MS = 5_000;

// ── Schemas ────────────────────────────────────────────────────────────────────

const ApplySchema = z.object({
  stellarAddress: z.string().regex(/^G[A-Z2-7]{55}$/, 'invalid Stellar address'),
  name: z.string().min(2).max(50),
  contactEmail: z.string().email().optional(),
  contactTelegram: z.string().optional(),
  requestedPairs: z.array(z.object({ tokenIn: z.string(), tokenOut: z.string() })).min(1),
}).refine(d => d.contactEmail || d.contactTelegram, {
  message: 'At least one of contactEmail or contactTelegram is required',
});

const RegisterSchema = z.object({
  stellarAddress: z.string().regex(/^G[A-Z2-7]{55}$/, 'invalid Stellar address'),
  name: z.string().min(1).max(64),
  signerPublicKey: z.string().length(64, 'signerPublicKey must be 64 hex chars'),
  supportedPairs: z.array(z.object({ tokenIn: z.string(), tokenOut: z.string() })).min(1),
});

const VerifyKeySchema = z.object({
  apiKey: z.string().startsWith('sk_live_').min(72, 'apiKey must be at least 72 chars'),
  makerAddress: z.string().regex(/^G[A-Z2-7]{55}$/, 'invalid Stellar address').optional(),
});

// ── POST /api/makers/apply ─────────────────────────────────────────────────────

router.post('/api/makers/apply', applyLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = ApplySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ success: false, error: body.error.issues.map(i => i.message).join('; ') });
      return;
    }

    const { stellarAddress, name, contactEmail, contactTelegram, requestedPairs } = body.data;

    const existing = await PendingMaker.findOne({ stellarAddress });
    if (existing && (existing.status === 'pending' || existing.status === 'approved')) {
      res.status(409).json({ success: false, error: 'Application already exists', status: existing.status });
      return;
    }

    const alreadyMaker = await Maker.findOne({ stellarAddress });
    if (alreadyMaker) {
      res.status(409).json({ success: false, error: 'Already a registered maker' });
      return;
    }

    // If rejected, allow re-apply by updating existing record
    if (existing && existing.status === 'rejected') {
      existing.name = name;
      existing.contactEmail = contactEmail;
      existing.contactTelegram = contactTelegram;
      existing.requestedPairs = requestedPairs;
      existing.status = 'pending';
      existing.submittedAt = new Date();
      existing.reviewedAt = null;
      existing.adminNotes = null;
      await existing.save();
      res.status(201).json({ success: true, message: 'Application submitted successfully', applicationId: existing._id });
      return;
    }

    const pendingMaker = await PendingMaker.create({
      stellarAddress, name, contactEmail, contactTelegram, requestedPairs,
      status: 'pending', submittedAt: new Date(),
    });

    res.status(201).json({
      success: true,
      message: 'Application submitted successfully',
      applicationId: pendingMaker._id,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/makers/application/:address ───────────────────────────────────────

router.get('/api/makers/application/:address', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { address } = req.params;
    if (!/^G[A-Z2-7]{55}$/.test(address)) {
      res.status(400).json({ success: false, error: 'Invalid Stellar address' });
      return;
    }

    const pending = await PendingMaker.findOne({ stellarAddress: address })
      .select('-generatedApiKey -__v')
      .lean();

    if (!pending) {
      res.status(404).json({ found: false });
      return;
    }

    res.json({
      found: true,
      status: pending.status,
      name: pending.name,
      submittedAt: pending.submittedAt,
      onChainRegistered: pending.onChainRegistered,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/makers ────────────────────────────────────────────────────────────

router.get('/api/makers', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const makers = await Maker.find({ active: true })
      .select('-signerPublicKey -__v')
      .sort({ lastSeenAt: -1 })
      .lean();

    const formatted = makers.map(m => ({
      name: m.name,
      stellarAddress: `${m.stellarAddress.slice(0, 4)}...${m.stellarAddress.slice(-4)}`,
      connectionStatus: m.connectionStatus,
      lastSeenAt: m.lastSeenAt,
      supportedPairs: m.supportedPairs,
      totalTrades: m.totalTrades,
      totalVolume: m.totalVolume,
    }));

    res.json({ makers: formatted });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/makers/register ──────────────────────────────────────────────────

// Admin-only: this directly creates a maker AND mints a live API key, bypassing
// the apply→approve flow. Must never be world-callable.
router.post('/api/makers/register', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = RegisterSchema.safeParse(req.body);
    if (!body.success) throw new ValidationError(body.error.issues.map(i => i.message).join('; '));

    const { stellarAddress, name, signerPublicKey, supportedPairs } = body.data;

    const existing = await Maker.findOne({ stellarAddress });
    if (existing) return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'Maker already registered' } });

    const maker = await Maker.create({ stellarAddress, name, signerPublicKey, supportedPairs });

    const rawKey = 'sk_live_' + crypto.randomBytes(32).toString('hex');
    const keyPrefix = rawKey.slice(0, 15);
    const keyHash = await bcrypt.hash(rawKey, config.API_KEY_SALT_ROUNDS);

    await ApiKey.create({ makerId: maker._id, keyHash, keyPrefix, label: 'Default' });

    res.status(201).json({
      success: true,
      maker: { id: maker._id, stellarAddress: maker.stellarAddress, name: maker.name },
      apiKey: rawKey,
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/makers/verify-key ────────────────────────────────────────────────

router.post('/api/makers/verify-key', verifyKeyLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = VerifyKeySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ success: false, error: body.error.issues.map(i => i.message).join('; ') });
      return;
    }

    const { apiKey, makerAddress } = body.data;
    const prefix = apiKey.slice(0, 15);

    const apiKeyDoc = await ApiKey.findOne({ keyPrefix: prefix, active: true }).populate('makerId');
    if (!apiKeyDoc) {
      res.status(401).json({ success: false, error: 'API key not found' });
      return;
    }

    const valid = await bcrypt.compare(apiKey, apiKeyDoc.keyHash);
    if (!valid) {
      res.status(401).json({ success: false, error: 'Invalid API key' });
      return;
    }

    const maker = apiKeyDoc.makerId as unknown as import('../db/models/Maker').IMaker;

    if (!maker.active) {
      res.status(403).json({ success: false, error: 'Maker account is suspended' });
      return;
    }

    if (makerAddress && maker.stellarAddress !== makerAddress) {
      res.status(403).json({ success: false, error: 'API key does not match this maker address' });
      return;
    }

    await ApiKey.findByIdAndUpdate(apiKeyDoc._id, { lastUsedAt: new Date() });

    res.json({
      success: true,
      maker: {
        name: maker.name,
        stellarAddress: maker.stellarAddress,
        active: maker.active,
        supportedPairs: maker.supportedPairs,
        connectionStatus: maker.connectionStatus,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/makers/:address/status ────────────────────────────────────────────

router.get('/api/makers/:address/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { address } = req.params;
    if (!/^G[A-Z2-7]{55}$/.test(address)) throw new ValidationError('Invalid Stellar address');

    const maker = await Maker.findOne({ stellarAddress: address }).lean();
    if (!maker) throw new NotFoundError('Maker not found');

    const registry = MakerConnectionRegistry.getInstance();
    const isConnected = registry.isConnected(maker._id.toString());

    const priceBook = PriceBook.getInstance();
    const priceLevels = priceBook.getMakerLevels(maker._id.toString());

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const stats = await Trade.aggregate([
      {
        $match: {
          makerAddress: maker.stellarAddress,
          status: 'confirmed',
          confirmedAt: { $gte: oneDayAgo },
        },
      },
      {
        $group: {
          _id: null,
          totalTrades: { $sum: 1 },
          totalVolume: { $sum: '$amountInUsd' },
          totalFees: { $sum: { $toDouble: '$feeAmount' } },
        },
      },
    ]);
    const s = stats[0] ?? { totalTrades: 0, totalVolume: 0, totalFees: 0 };

    res.json({
      success: true,
      maker: {
        name: maker.name,
        stellarAddress: maker.stellarAddress,
        active: maker.active,
        connectionStatus: isConnected ? 'connected' : 'disconnected',
        lastSeenAt: maker.lastSeenAt,
        supportedPairs: maker.supportedPairs,
        totalTrades: maker.totalTrades,
        totalVolume: maker.totalVolume,
        totalFeesEarned: maker.totalFeesEarned,
        signerPublicKey: maker.signerPublicKey ?? null,
      },
      stats24h: {
        trades: s.totalTrades,
        volume: parseFloat((s.totalVolume ?? 0).toFixed(2)),
        fees: parseFloat((s.totalFees ?? 0).toFixed(4)),
      },
      priceLevels: priceLevels ?? null,
      isConnected,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/makers/:address/pool ──────────────────────────────────────────────

router.get('/api/makers/:address/pool', chainReadLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { address } = req.params;
    if (!/^G[A-Z2-7]{55}$/.test(address)) throw new ValidationError('Invalid Stellar address');

    // refresh=true bypasses the cache, so it must not be available to anonymous
    // callers — otherwise the cheapest defence is opt-out by the attacker.
    const skipCache = req.query.refresh === 'true' && (await authMakerByApiKey(req)) !== null;
    const poolAddress = await getPoolAddressFromRegistry(address, skipCache).catch(() => null);
    res.json({
      poolAddress: poolAddress ?? null,
      poolDeployed: poolAddress != null,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/makers/:address/inventory ─────────────────────────────────────────

router.get('/api/makers/:address/inventory', chainReadLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { address } = req.params;
    if (!/^G[A-Z2-7]{55}$/.test(address)) throw new ValidationError('Invalid Stellar address');

    const skipCache = req.query.refresh === 'true' && (await authMakerByApiKey(req)) !== null;
    const [poolAddress, walletUsdc, walletEurc, horizonData] = await Promise.all([
      getPoolAddressFromRegistry(address, skipCache).catch(() => null),
      getWalletTokenBalance(address, config.USDC_CONTRACT_ADDRESS, skipCache).catch(() => '0'),
      getWalletTokenBalance(address, config.EURC_CONTRACT_ADDRESS, skipCache).catch(() => '0'),
      axios.get(`${config.HORIZON_URL}/accounts/${address}`, { timeout: HORIZON_TIMEOUT_MS }).catch(() => null),
    ]);

    let walletXlm = '0';
    if (horizonData?.data?.balances) {
      for (const b of horizonData.data.balances) {
        if (b.asset_type === 'native') {
          walletXlm = parseFloat(b.balance).toFixed(7);
          break;
        }
      }
    }

    if (!poolAddress) {
      res.json({
        success: true,
        vault: { usdc: '0', eurc: '0' },
        wallet: { usdc: walletUsdc, eurc: walletEurc, xlm: walletXlm },
        poolAddress: null,
        poolDeployed: false,
      });
      return;
    }

    const [usdcBalance, eurcBalance] = await Promise.all([
      getMakerPoolBalance(poolAddress, config.USDC_CONTRACT_ADDRESS, skipCache).catch(() => 0n),
      getMakerPoolBalance(poolAddress, config.EURC_CONTRACT_ADDRESS, skipCache).catch(() => 0n),
    ]);

    res.json({
      success: true,
      vault: {
        usdc: (Number(usdcBalance) / 1e7).toFixed(7),
        eurc: (Number(eurcBalance) / 1e7).toFixed(7),
      },
      wallet: { usdc: walletUsdc, eurc: walletEurc, xlm: walletXlm },
      poolAddress,
      poolDeployed: true,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/makers/:address/rate-limits ───────────────────────────────────────

router.get('/api/makers/:address/rate-limits', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { address } = req.params;
    if (!/^G[A-Z2-7]{55}$/.test(address)) throw new ValidationError('Invalid Stellar address');

    const maker = await Maker.findOne({ stellarAddress: address }).lean();
    if (!maker) throw new NotFoundError('Maker not found');

    const limits = rateLimitStore.getActiveLimitsForMaker(maker._id.toString());
    res.json({
      limits: limits.map(l => ({
        takerAddress: l.takerAddress,
        expiresAt: l.expiresAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/makers/register-signer-key ──────────────────────────────────────

router.post('/api/makers/register-signer-key', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization ?? '';
    const rawKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!rawKey) {
      res.status(401).json({ success: false, error: 'Missing Authorization header' });
      return;
    }

    const { signerPublicKey } = req.body;
    if (typeof signerPublicKey !== 'string' || !/^[0-9a-f]{64}$/.test(signerPublicKey)) {
      res.status(400).json({ success: false, error: 'signerPublicKey must be 64 hex chars' });
      return;
    }

    const prefix = rawKey.slice(0, 15);
    const apiKeyDoc = await ApiKey.findOne({ keyPrefix: prefix, active: true }).populate('makerId');
    if (!apiKeyDoc) {
      res.status(401).json({ success: false, error: 'API key not found' });
      return;
    }

    const bcrypt = require('bcrypt') as typeof import('bcrypt');
    const valid = await bcrypt.compare(rawKey, apiKeyDoc.keyHash);
    if (!valid) {
      res.status(401).json({ success: false, error: 'Invalid API key' });
      return;
    }

    const maker = apiKeyDoc.makerId as unknown as import('../db/models/Maker').IMaker;
    await Maker.findByIdAndUpdate(maker._id, { signerPublicKey });

    // Bid verification reads the signer key from the on-chain registry through a
    // 60s cache that a warmer keeps refreshing, so it never expires on its own
    // for a connected maker. After a rotation — exactly what you do when a hot
    // key leaks — a stale entry keeps ACCEPTING bids from the revoked key and
    // REJECTING bids from the new one. Drop it now.
    invalidateSignerKeyCache(maker.stellarAddress);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/makers/:address ─────────────────────────────────────────────────

router.patch('/api/makers/:address', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { address } = req.params;
    if (!/^G[A-Z2-7]{55}$/.test(address)) throw new ValidationError('Invalid Stellar address');

    // Authenticate: caller must present the API key that belongs to this maker.
    // Without this, anyone could overwrite a maker's signerPublicKey — which is
    // the key the backend uses for off-chain bid verification.
    const apiKeyDoc = await authMakerByApiKey(req);
    if (!apiKeyDoc) {
      res.status(401).json({ success: false, error: 'Valid maker API key required' });
      return;
    }

    const target = await Maker.findOne({ stellarAddress: address });
    if (!target) throw new NotFoundError('Maker not found');
    if (apiKeyDoc.makerId.toString() !== target._id.toString()) {
      res.status(403).json({ success: false, error: 'API key does not match this maker' });
      return;
    }

    // signerPublicKey, if provided, must be well-formed.
    if (req.body.signerPublicKey !== undefined && !/^[0-9a-f]{64}$/.test(req.body.signerPublicKey)) {
      res.status(400).json({ success: false, error: 'signerPublicKey must be 64 hex chars' });
      return;
    }

    const allowed = ['name', 'signerPublicKey', 'supportedPairs', 'serverUrl'];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const maker = await Maker.findByIdAndUpdate(
      target._id,
      { $set: { ...updates, updatedAt: new Date() } },
      { new: true }
    ).lean();

    if (updates.signerPublicKey !== undefined) {
      invalidateSignerKeyCache(target.stellarAddress);
    }

    res.json({ success: true, maker });
  } catch (err) {
    next(err);
  }
});

export default router;
