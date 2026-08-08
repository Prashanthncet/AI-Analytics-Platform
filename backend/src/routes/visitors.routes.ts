import { Router } from 'express';
import { isValidObjectId } from 'mongoose';
import { VISIT_SITE_TYPES, type VisitSiteType } from '../models/VisitLog';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { visitorSummary } from '../services/statsService';

const router = Router();

// GET /api/visitors/:siteType/:siteId?days=30 — public analytics for a project/product/key.
router.get(
    '/:siteType/:siteId',
    asyncHandler(async (req, res) => {
        const siteType = String(req.params.siteType ?? '');
        const siteId = String(req.params.siteId ?? '');
        if (!(VISIT_SITE_TYPES as readonly string[]).includes(siteType)) {
            throw new AppError(400, 'Invalid siteType');
        }
        if (!isValidObjectId(siteId)) throw new AppError(400, 'Invalid siteId');

        const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
        const data = await visitorSummary(siteType as VisitSiteType, siteId, days);
        res.status(200).json({ success: true, data });
    })
);

export default router;
