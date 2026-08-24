import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { PendingMaker } from '../db/models/PendingMaker';
import { Maker } from '../db/models/Maker';
import { ApiKey } from '../db/models/ApiKey';
import { config } from '../config';

const router = Router();

// ── GET /api/admin/pending ─────────────────────────────────────────────────────

router.get('/api/admin/pending', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.query;
    const filter: Record<string, unknown> = {};
    if (status && typeof status === 'string') filter.status = status;

    const applications = await PendingMaker.find(filter)
      .select('-generatedApiKey -__v')
      .sort({ submittedAt: -1 })
      .lean();

    res.json({ applications, total: applications.length });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/admin/pending/:id/approve ────────────────────────────────────────

router.post('/api/admin/pending/:id/approve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pending = await PendingMaker.findById(req.params.id);
    if (!pending) {
      res.status(404).json({ success: false, error: 'Application not found' });
      return;
    }
    if (pending.status !== 'pending') {
      res.status(400).json({ success: false, error: 'Already processed' });
      return;
    }

    const maker = await Maker.create({
      stellarAddress: pending.stellarAddress,
      name: pending.name,
      signerPublicKey: '',
      active: true,
      supportedPairs: pending.requestedPairs,
      connectionStatus: 'unknown',
      totalVolume: 0,
      totalTrades: 0,
      totalFeesEarned: 0,
    });

    const rawKey = 'sk_live_' + crypto.randomBytes(32).toString('hex');
    const keyHash = await bcrypt.hash(rawKey, config.API_KEY_SALT_ROUNDS);
    const keyPrefix = rawKey.slice(0, 15);

    await ApiKey.create({
      makerId: maker._id,
      keyHash,
      keyPrefix,
      label: 'Default',
      active: true,
    });

    pending.status = 'approved';
    pending.makerId = maker._id as unknown as import('mongoose').Types.ObjectId;
    // The raw key is NEVER persisted. ApiKey stores only a bcrypt hash; keeping a
    // plaintext copy here for a re-read window defeated that entirely, and put
    // working maker credentials in every database backup and snapshot. Shown
    // once, in this response, and then unrecoverable — use rotate-key if lost.
    pending.generatedApiKey = null;
    pending.apiKeyGeneratedAt = new Date();
    pending.reviewedAt = new Date();
    await pending.save();

    res.json({
      success: true,
      apiKey: rawKey,
      makerId: maker._id,
      makerName: maker.name,
      makerAddress: maker.stellarAddress,
      message: 'Maker approved. Copy the API key now — it is not stored and cannot be shown again. Use rotate-key to issue a replacement.',
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/pending/:id/apikey — REMOVED ────────────────────────────────
//
// Raw API keys are never persisted: ApiKey stores only a bcrypt hash, and the
// key is shown once in the approve/rotate response. There is nothing to re-read,
// so this route answers 410 permanently rather than 404, to tell any older admin
// client explicitly that the capability is gone rather than the record missing.

router.get('/api/admin/pending/:id/apikey', (_req: Request, res: Response) => {
  res.status(410).json({
    success: false,
    error: 'API keys are not retrievable',
    message: 'Keys are shown once when issued and never stored. Use rotate-key to issue a replacement.',
  });
});

// ── POST /api/admin/pending/:id/reject ─────────────────────────────────────────

router.post('/api/admin/pending/:id/reject', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pending = await PendingMaker.findById(req.params.id);
    if (!pending) {
      res.status(404).json({ success: false, error: 'Application not found' });
      return;
    }
    if (pending.status !== 'pending') {
      res.status(400).json({ success: false, error: 'Already processed' });
      return;
    }

    pending.status = 'rejected';
    pending.adminNotes = req.body.reason ?? null;
    pending.reviewedAt = new Date();
    await pending.save();

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/admin/pending/:id/rotate-key ─────────────────────────────────────

router.post('/api/admin/pending/:id/rotate-key', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pending = await PendingMaker.findById(req.params.id);
    if (!pending || pending.status !== 'approved') {
      res.status(404).json({ success: false, error: 'Approved application not found' });
      return;
    }
    if (!pending.makerId) {
      res.status(400).json({ success: false, error: 'No maker associated with this application' });
      return;
    }

    // Deactivate old key
    await ApiKey.updateMany({ makerId: pending.makerId }, { $set: { active: false } });

    const rawKey = 'sk_live_' + crypto.randomBytes(32).toString('hex');
    const keyHash = await bcrypt.hash(rawKey, config.API_KEY_SALT_ROUNDS);
    const keyPrefix = rawKey.slice(0, 15);

    await ApiKey.create({ makerId: pending.makerId, keyHash, keyPrefix, label: 'Rotated', active: true });

    pending.generatedApiKey = null;
    pending.apiKeyGeneratedAt = new Date();
    await pending.save();

    res.json({
      success: true,
      apiKey: rawKey,
      message: 'New API key generated. Copy it now — it is not stored and cannot be shown again.',
    });
  } catch (err) {
    next(err);
  }
});

export default router;
