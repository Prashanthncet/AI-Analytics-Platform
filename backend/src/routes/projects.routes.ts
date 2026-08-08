import { Router } from 'express';
import { isValidObjectId } from 'mongoose';
import { Project, PROJECT_STATUSES } from '../models/Project';
import { Deployment } from '../models/Deployment';
import { VisitLog } from '../models/VisitLog';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { protect, restrictTo } from '../middleware/auth';
import { asEnum, asString } from '../utils/validation';

const router = Router();

const projectPopulate = { path: 'owner', select: 'name email' };

// Reads are public (view-only). Writes require an admin JWT.
const adminOnly = [protect, restrictTo('admin')];

// GET /api/projects?status=active&search=foo&page=1&limit=50
router.get(
    '/',
    asyncHandler(async (req, res) => {
        const { status, search } = req.query;

        const filter: Record<string, unknown> = {};
        const parsedStatus = asEnum(status, PROJECT_STATUSES);
        if (parsedStatus) filter.status = parsedStatus;
        if (typeof search === 'string' && search.trim()) {
            const regex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            filter.$or = [{ name: regex }, { description: regex }];
        }

        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));

        const [projects, total] = await Promise.all([
            Project.find(filter)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .populate(projectPopulate),
            Project.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            data: projects,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        });
    })
);

// GET /api/projects/:id
router.get(
    '/:id',
    asyncHandler(async (req, res) => {
        if (!isValidObjectId(req.params.id)) throw new AppError(400, 'Invalid project id');
        const project = await Project.findById(req.params.id).populate(projectPopulate);
        if (!project) throw new AppError(404, 'Project not found');
        res.status(200).json({ success: true, data: project });
    })
);

// POST /api/projects
router.post(
    '/',
    ...adminOnly,
    asyncHandler(async (req, res) => {
        const name = asString(req.body?.name);
        if (!name) throw new AppError(400, 'Project name is required');

        const project = await Project.create({
            name,
            description: asString(req.body?.description) ?? '',
            status: asEnum(req.body?.status, PROJECT_STATUSES) ?? 'active',
            owner: req.user!._id,
            ...(asString(req.body?.startDate) ? { startDate: new Date(req.body.startDate) } : {}),
            ...(asString(req.body?.endDate) ? { endDate: new Date(req.body.endDate) } : {}),
        });

        res.status(201).json({ success: true, data: project });
    })
);

// PATCH /api/projects/:id
router.patch(
    '/:id',
    ...adminOnly,
    asyncHandler(async (req, res) => {
        if (!isValidObjectId(req.params.id)) throw new AppError(400, 'Invalid project id');

        const project = await Project.findById(req.params.id);
        if (!project) throw new AppError(404, 'Project not found');

        const body = req.body ?? {};
        const name = asString(body.name);
        if (name) project.name = name;
        if (typeof body.description === 'string') project.description = body.description;
        const status = asEnum(body.status, PROJECT_STATUSES);
        if (status) project.status = status;
        const startDate = asString(body.startDate);
        if (startDate) project.startDate = new Date(startDate);
        if (body.startDate === null || body.startDate === '') project.startDate = null;
        const endDate = asString(body.endDate);
        if (endDate) project.endDate = new Date(endDate);
        if (body.endDate === null || body.endDate === '') project.endDate = null;

        await project.save();
        await project.populate(projectPopulate);

        res.status(200).json({ success: true, data: project });
    })
);

// DELETE /api/projects/:id
router.delete(
    '/:id',
    ...adminOnly,
    asyncHandler(async (req, res) => {
        if (!isValidObjectId(req.params.id)) throw new AppError(400, 'Invalid project id');
        const project = await Project.findByIdAndDelete(req.params.id);
        if (!project) throw new AppError(404, 'Project not found');
        // Cascade: drop the project's deployments and visitor logs so no orphaned data remains.
        const depFilter: Record<string, unknown> = { targetType: 'project', targetId: req.params.id };
        const visitFilter: Record<string, unknown> = { siteType: 'project', siteId: req.params.id };
        await Promise.all([Deployment.deleteMany(depFilter), VisitLog.deleteMany(visitFilter)]);
        res.status(200).json({ success: true, data: null });
    })
);

export default router;
