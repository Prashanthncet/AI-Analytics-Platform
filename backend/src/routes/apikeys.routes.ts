import { Router } from 'express';
import { isValidObjectId, type HydratedDocument } from 'mongoose';
import { ApiKey, API_KEY_PROVIDERS, API_KEY_STATUSES, type ApiKeyDoc } from '../models/ApiKey';
import { Deployment } from '../models/Deployment';
import { VisitLog } from '../models/VisitLog';
import { UsageLog } from '../models/UsageLog';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { protect, restrictTo } from '../middleware/auth';
import { decryptSecret, encryptSecret, maskSecret } from '../utils/crypto';
import { asEnum, asNonNegativeNumber, asString } from '../utils/validation';

const router = Router();

// Reads are public (view-only — keys stay masked). Writes require an admin JWT.
const adminOnly = [protect, restrictTo('admin')];

interface ApiKeyDto {
    _id: string;
    name: string;
    provider: string;
    keyMasked: string;
    quota: number;
    usage: number;
    remaining: number;
    costUsd: number;
    expiresAt: Date | null;
    status: string;
    owner: unknown;
    createdAt: Date;
    updatedAt: Date;
}

const effectiveStatus = (key: HydratedDocument<ApiKeyDoc>): string =>
    key.expiresAt && key.expiresAt.getTime() <= Date.now() && key.status === 'active'
        ? 'expired'
        : key.status;

const toDto = (key: HydratedDocument<ApiKeyDoc>): ApiKeyDto => ({
    _id: key._id.toString(),
    name: key.name,
    provider: key.provider,
    keyMasked: key.keyMasked,
    quota: key.quota,
    usage: key.usage,
    remaining: key.quota > 0 ? Math.max(0, key.quota - key.usage) : -1,
    costUsd: key.costUsd,
    expiresAt: key.expiresAt ?? null,
    status: effectiveStatus(key),
    owner: key.owner,
    createdAt: key.createdAt,
    updatedAt: key.updatedAt,
});

const keyPopulate = { path: 'owner', select: 'name email' };

// GET /api/apikeys?status=active&provider=openai
router.get(
    '/',
    asyncHandler(async (req, res) => {
        const filter: Record<string, unknown> = {};
        const parsedStatus = asEnum(req.query.status, API_KEY_STATUSES);
        if (parsedStatus) filter.status = parsedStatus;
        const parsedProvider = asEnum(req.query.provider, API_KEY_PROVIDERS);
        if (parsedProvider) filter.provider = parsedProvider;

        const keys = await ApiKey.find(filter)
            .sort({ createdAt: -1 })
            .limit(200)
            .populate(keyPopulate);

        res.status(200).json({ success: true, data: keys.map(toDto) });
    })
);

// GET /api/apikeys/:id
router.get(
    '/:id',
    asyncHandler(async (req, res) => {
        if (!isValidObjectId(req.params.id)) throw new AppError(400, 'Invalid api key id');
        const key = await ApiKey.findById(req.params.id).populate(keyPopulate);
        if (!key) throw new AppError(404, 'API key not found');
        res.status(200).json({ success: true, data: toDto(key) });
    })
);

// GET /api/apikeys/:id/reveal — admin only: return the decrypted key. This is the
// ONLY way the plaintext secret ever leaves the server, and it requires an admin JWT.
router.get(
    '/:id/reveal',
    ...adminOnly,
    asyncHandler(async (req, res) => {
        if (!isValidObjectId(req.params.id)) throw new AppError(400, 'Invalid api key id');
        const key = await ApiKey.findById(req.params.id).select('+keyEncrypted');
        if (!key) throw new AppError(404, 'API key not found');
        let decrypted: string;
        try {
            decrypted = decryptSecret(key.keyEncrypted);
        } catch {
            throw new AppError(500, 'Failed to decrypt key');
        }
        res.status(200).json({ success: true, data: { key: decrypted } });
    })
);

// POST /api/apikeys
router.post(
    '/',
    ...adminOnly,
    asyncHandler(async (req, res) => {
        const name = asString(req.body?.name);
        const key = asString(req.body?.key);
        if (!name) throw new AppError(400, 'Key name is required');
        if (!key || key.length < 8) {
            throw new AppError(400, 'API key must be at least 8 characters');
        }

        const expiresAt = asString(req.body?.expiresAt);
        const keyDoc = await ApiKey.create({
            name,
            provider: asEnum(req.body?.provider, API_KEY_PROVIDERS) ?? 'other',
            keyEncrypted: encryptSecret(key),
            keyMasked: maskSecret(key),
            quota: asNonNegativeNumber(req.body?.quota) ?? 0,
            usage: asNonNegativeNumber(req.body?.usage) ?? 0,
            costUsd: asNonNegativeNumber(req.body?.costUsd) ?? 0,
            ...(expiresAt ? { expiresAt: new Date(expiresAt) } : {}),
            owner: req.user!._id,
        });

        res.status(201).json({ success: true, data: toDto(keyDoc) });
    })
);

// PATCH /api/apikeys/:id
router.patch(
    '/:id',
    ...adminOnly,
    asyncHandler(async (req, res) => {
        if (!isValidObjectId(req.params.id)) throw new AppError(400, 'Invalid api key id');
        const key = await ApiKey.findById(req.params.id);
        if (!key) throw new AppError(404, 'API key not found');

        const body = req.body ?? {};
        const name = asString(body.name);
        if (name) key.name = name;
        const rawKey = asString(body.key);
        if (rawKey) {
            if (rawKey.length < 8) throw new AppError(400, 'API key must be at least 8 characters');
            key.keyEncrypted = encryptSecret(rawKey);
            key.keyMasked = maskSecret(rawKey);
        }
        const provider = asEnum(body.provider, API_KEY_PROVIDERS);
        if (provider) key.provider = provider;
        const quota = asNonNegativeNumber(body.quota);
        if (quota !== undefined) key.quota = quota;
        const usage = asNonNegativeNumber(body.usage);
        if (usage !== undefined) key.usage = usage;
        const costUsd = asNonNegativeNumber(body.costUsd);
        if (costUsd !== undefined) key.costUsd = costUsd;
        const status = asEnum(body.status, API_KEY_STATUSES);
        if (status) key.status = status;
        const expiresAt = asString(body.expiresAt);
        if (expiresAt) key.expiresAt = new Date(expiresAt);
        if (body.expiresAt === null || body.expiresAt === '') key.expiresAt = null;

        await key.save();
        res.status(200).json({ success: true, data: toDto(key) });
    })
);

// DELETE /api/apikeys/:id
router.delete(
    '/:id',
    ...adminOnly,
    asyncHandler(async (req, res) => {
        if (!isValidObjectId(req.params.id)) throw new AppError(400, 'Invalid api key id');
        const key = await ApiKey.findById(req.params.id);
        if (!key) throw new AppError(404, 'API key not found');
        await key.deleteOne();
        // Cascade: drop the key's deployments, visitor logs and usage logs.
        const depFilter: Record<string, unknown> = { targetType: 'apikey', targetId: req.params.id };
        const visitFilter: Record<string, unknown> = { siteType: 'apikey', siteId: req.params.id };
        const usageFilter: Record<string, unknown> = { targetType: 'apikey', targetId: req.params.id };
        await Promise.all([
            Deployment.deleteMany(depFilter),
            VisitLog.deleteMany(visitFilter),
            UsageLog.deleteMany(usageFilter),
        ]);
        res.status(200).json({ success: true, data: null });
    })
);

export default router;
