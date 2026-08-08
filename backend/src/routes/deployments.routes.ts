import { Router } from 'express';
import { isValidObjectId, type HydratedDocument } from 'mongoose';
import {
    Deployment,
    DEPLOYMENT_KINDS,
    DEPLOYMENT_STATUSES,
    DEPLOYMENT_TARGET_TYPES,
    MAX_CHECKS,
    type DeploymentDoc,
} from '../models/Deployment';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { protect, restrictTo } from '../middleware/auth';
import { asEnum, asString } from '../utils/validation';

const router = Router();

// Reads are public. Writes require an admin JWT.
const adminOnly = [protect, restrictTo('admin')];

const toDto = (d: HydratedDocument<DeploymentDoc>) => ({
    _id: d._id.toString(),
    name: d.name,
    targetType: d.targetType,
    targetId: d.targetId.toString(),
    kind: d.kind,
    displayUrl: d.displayUrl,
    checkUrl: d.checkUrl,
    enabled: d.enabled,
    status: d.status,
    lastCheckedAt: d.lastCheckedAt ?? null,
    lastResponseMs: d.lastResponseMs ?? null,
    lastStatusChangeAt: d.lastStatusChangeAt ?? null,
    uptimePercent: d.uptimePercent ?? null,
    checks: (d.checks ?? []).slice(-MAX_CHECKS).reverse(),
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
});

// GET /api/deployments?targetType=project&targetId=xxx&status=live
router.get(
    '/',
    asyncHandler(async (req, res) => {
        const filter: Record<string, unknown> = {};
        const targetType = asEnum(req.query.targetType, DEPLOYMENT_TARGET_TYPES);
        if (targetType) filter.targetType = targetType;
        const targetId = asString(req.query.targetId);
        if (targetId) {
            if (!isValidObjectId(targetId)) throw new AppError(400, 'Invalid targetId');
            filter.targetId = targetId;
        }
        const status = asEnum(req.query.status, DEPLOYMENT_STATUSES);
        if (status) filter.status = status;

        const deployments = await Deployment.find(filter).sort({ createdAt: -1 }).limit(200);
        res.status(200).json({ success: true, data: deployments.map(toDto) });
    })
);

// GET /api/deployments/:id
router.get(
    '/:id',
    asyncHandler(async (req, res) => {
        if (!isValidObjectId(req.params.id)) throw new AppError(400, 'Invalid deployment id');
        const deployment = await Deployment.findById(req.params.id);
        if (!deployment) throw new AppError(404, 'Deployment not found');
        res.status(200).json({ success: true, data: toDto(deployment) });
    })
);

// POST /api/deployments
router.post(
    '/',
    ...adminOnly,
    asyncHandler(async (req, res) => {
        const body = req.body ?? {};
        const name = asString(body.name);
        const targetType = asEnum(body.targetType, DEPLOYMENT_TARGET_TYPES);
        const targetId = asString(body.targetId);
        if (!name) throw new AppError(400, 'Deployment name is required');
        if (!targetType || !targetId || !isValidObjectId(targetId)) {
            throw new AppError(400, 'A valid targetType and targetId are required');
        }
        const checkUrl = asString(body.checkUrl);
        if (checkUrl && !/^https?:\/\//i.test(checkUrl)) {
            throw new AppError(400, 'Check URL must start with http:// or https://');
        }

        const deployment = await Deployment.create({
            name,
            targetType,
            targetId,
            kind: asEnum(body.kind, DEPLOYMENT_KINDS) ?? 'web',
            displayUrl: asString(body.displayUrl) ?? '',
            checkUrl: checkUrl ?? '',
            enabled: body.enabled === false ? false : true,
            status: checkUrl ? 'unknown' : 'paused',
        });

        res.status(201).json({ success: true, data: toDto(deployment) });
    })
);

// PATCH /api/deployments/:id
router.patch(
    '/:id',
    ...adminOnly,
    asyncHandler(async (req, res) => {
        if (!isValidObjectId(req.params.id)) throw new AppError(400, 'Invalid deployment id');
        const deployment = await Deployment.findById(req.params.id);
        if (!deployment) throw new AppError(404, 'Deployment not found');

        const body = req.body ?? {};
        const name = asString(body.name);
        if (name) deployment.name = name;
        const kind = asEnum(body.kind, DEPLOYMENT_KINDS);
        if (kind) deployment.kind = kind;
        if (typeof body.displayUrl === 'string') deployment.displayUrl = body.displayUrl;
        if (typeof body.checkUrl === 'string') {
            if (body.checkUrl && !/^https?:\/\//i.test(body.checkUrl)) {
                throw new AppError(400, 'Check URL must start with http:// or https://');
            }
            deployment.checkUrl = body.checkUrl;
            // Re-arm monitoring when the check URL changes (or is cleared).
            deployment.status = body.checkUrl ? 'unknown' : 'paused';
        }
        if (typeof body.enabled === 'boolean') {
            deployment.enabled = body.enabled;
            if (!body.enabled) deployment.status = 'paused';
            else if (deployment.checkUrl && deployment.status === 'paused') {
                deployment.status = 'unknown';
            }
        }

        await deployment.save();
        res.status(200).json({ success: true, data: toDto(deployment) });
    })
);

// DELETE /api/deployments/:id
router.delete(
    '/:id',
    ...adminOnly,
    asyncHandler(async (req, res) => {
        if (!isValidObjectId(req.params.id)) throw new AppError(400, 'Invalid deployment id');
        const deployment = await Deployment.findByIdAndDelete(req.params.id);
        if (!deployment) throw new AppError(404, 'Deployment not found');
        res.status(200).json({ success: true, data: null });
    })
);

export default router;
