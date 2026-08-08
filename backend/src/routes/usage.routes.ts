import { Router } from 'express';
import { isValidObjectId } from 'mongoose';
import { UsageLog, USAGE_TARGET_TYPES, type UsageTargetType } from '../models/UsageLog';
import { ApiKey } from '../models/ApiKey';
import { Product } from '../models/Product';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { protect, restrictTo } from '../middleware/auth';
import { asNonNegativeNumber, asString } from '../utils/validation';
import { usageSeries } from '../services/statsService';

const router = Router();

const adminOnly = [protect, restrictTo('admin')];

// POST /api/usage — record a usage/cost increment against an API key or product (admin).
router.post(
    '/',
    ...adminOnly,
    asyncHandler(async (req, res) => {
        const body = req.body ?? {};
        const targetType = body.targetType as unknown;
        const targetId = asString(body.targetId);
        const usageDelta = asNonNegativeNumber(body.usageDelta);
        const costDelta = asNonNegativeNumber(body.costDelta) ?? 0;

        if (
            typeof targetType !== 'string' ||
            !(USAGE_TARGET_TYPES as readonly string[]).includes(targetType)
        ) {
            throw new AppError(400, 'Invalid targetType (apikey or product)');
        }
        if (!targetId || !isValidObjectId(targetId)) {
            throw new AppError(400, 'A valid targetId is required');
        }
        if (usageDelta === undefined || (usageDelta === 0 && costDelta === 0)) {
            throw new AppError(400, 'usageDelta or costDelta must be greater than zero');
        }

        const target =
            targetType === 'apikey'
                ? await ApiKey.findById(targetId)
                : await Product.findById(targetId);
        if (!target) throw new AppError(404, `${targetType} not found`);

        target.usage += usageDelta;
        target.costUsd += costDelta;
        await target.save();

        const log = await UsageLog.create({
            targetType: targetType as UsageTargetType,
            targetId,
            usageDelta,
            costDelta,
            note: asString(body.note) ?? '',
        });

        res.status(201).json({
            success: true,
            data: {
                _id: log._id.toString(),
                targetType: log.targetType,
                targetId: log.targetId.toString(),
                usageDelta: log.usageDelta,
                costDelta: log.costDelta,
                note: log.note,
                createdAt: log.createdAt,
                totalUsage: target.usage,
                totalCost: target.costUsd,
            },
        });
    })
);

// GET /api/usage/:targetType/:targetId?days=30 — public daily usage/cost series.
router.get(
    '/:targetType/:targetId',
    asyncHandler(async (req, res) => {
        const targetType = String(req.params.targetType ?? '');
        const targetId = String(req.params.targetId ?? '');
        if (!(USAGE_TARGET_TYPES as readonly string[]).includes(targetType)) {
            throw new AppError(400, 'Invalid targetType');
        }
        if (!isValidObjectId(targetId)) throw new AppError(400, 'Invalid targetId');

        const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
        const data = await usageSeries(targetType as UsageTargetType, targetId, days);
        res.status(200).json({ success: true, data });
    })
);

export default router;
