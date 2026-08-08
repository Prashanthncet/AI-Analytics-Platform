import { Router } from 'express';
import { isValidObjectId } from 'mongoose';
import { Product, PRODUCT_CATEGORIES, PRODUCT_STATUSES, PRODUCT_TYPES } from '../models/Product';
import { Deployment } from '../models/Deployment';
import { VisitLog } from '../models/VisitLog';
import { UsageLog } from '../models/UsageLog';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { protect, restrictTo } from '../middleware/auth';
import { encryptSecret, maskSecret } from '../utils/crypto';
import { asEnum, asNonNegativeNumber, asString } from '../utils/validation';

const router = Router();

const productPopulate = { path: 'owner', select: 'name email' };

// Reads are public (view-only). Writes require an admin JWT.
const adminOnly = [protect, restrictTo('admin')];

// GET /api/products?type=web&status=active&search=foo&page=1&limit=50
router.get(
    '/',
    asyncHandler(async (req, res) => {
        const { type, status, search } = req.query;

        const filter: Record<string, unknown> = {};
        const parsedType = asEnum(type, PRODUCT_TYPES);
        if (parsedType) filter.type = parsedType;
        const parsedStatus = asEnum(status, PRODUCT_STATUSES);
        if (parsedStatus) filter.status = parsedStatus;
        if (typeof search === 'string' && search.trim()) {
            const regex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            filter.$or = [{ name: regex }, { vendor: regex }, { description: regex }];
        }

        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));

        const [products, total] = await Promise.all([
            Product.find(filter)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .populate(productPopulate),
            Product.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            data: products,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        });
    })
);

// GET /api/products/:id
router.get(
    '/:id',
    asyncHandler(async (req, res) => {
        if (!isValidObjectId(req.params.id)) throw new AppError(400, 'Invalid product id');
        const product = await Product.findById(req.params.id).populate(productPopulate);
        if (!product) throw new AppError(404, 'Product not found');
        res.status(200).json({ success: true, data: product });
    })
);

// POST /api/products
router.post(
    '/',
    ...adminOnly,
    asyncHandler(async (req, res) => {
        const name = asString(req.body?.name);
        if (!name) throw new AppError(400, 'Product name is required');

        const product = await Product.create({
            name,
            description: asString(req.body?.description) ?? '',
            vendor: asString(req.body?.vendor) ?? '',
            type: asEnum(req.body?.type, PRODUCT_TYPES) ?? 'web',
            category: asEnum(req.body?.category, PRODUCT_CATEGORIES) ?? 'ai_tool',
            status: asEnum(req.body?.status, PRODUCT_STATUSES) ?? 'active',
            quota: asNonNegativeNumber(req.body?.quota) ?? 0,
            usage: asNonNegativeNumber(req.body?.usage) ?? 0,
            costUsd: asNonNegativeNumber(req.body?.costUsd) ?? 0,
            ...(asString(req.body?.licenseKey)
                ? {
                      licenseKeyEncrypted: encryptSecret(req.body.licenseKey as string),
                      licenseKeyMasked: maskSecret(req.body.licenseKey as string),
                  }
                : {}),
            licenseSeats: asNonNegativeNumber(req.body?.licenseSeats) ?? 1,
            ...(asString(req.body?.licenseExpiresAt)
                ? { licenseExpiresAt: new Date(req.body.licenseExpiresAt as string) }
                : {}),
            owner: req.user!._id,
        });

        res.status(201).json({ success: true, data: product });
    })
);

// PATCH /api/products/:id
router.patch(
    '/:id',
    ...adminOnly,
    asyncHandler(async (req, res) => {
        if (!isValidObjectId(req.params.id)) throw new AppError(400, 'Invalid product id');

        const product = await Product.findById(req.params.id);
        if (!product) throw new AppError(404, 'Product not found');

        const body = req.body ?? {};
        const name = asString(body.name);
        if (name) product.name = name;
        if (typeof body.description === 'string') product.description = body.description;
        if (typeof body.vendor === 'string') product.vendor = body.vendor;
        const type = asEnum(body.type, PRODUCT_TYPES);
        if (type) product.type = type;
        const category = asEnum(body.category, PRODUCT_CATEGORIES);
        if (category) product.category = category;
        // Keep record shape consistent with the new category: software rows carry license
        // data, AI tools carry quota/usage/cost — clear the other side's fields on switch.
        if (category === 'software' && product.category !== category) {
            product.quota = 0;
            product.usage = 0;
            product.costUsd = 0;
        }
        if (category === 'ai_tool' && product.category !== category) {
            product.licenseKeyEncrypted = '';
            product.licenseKeyMasked = '';
            product.licenseSeats = 1;
            product.licenseExpiresAt = null;
        }
        const status = asEnum(body.status, PRODUCT_STATUSES);
        if (status) product.status = status;
        const quota = asNonNegativeNumber(body.quota);
        if (quota !== undefined) product.quota = quota;
        const usage = asNonNegativeNumber(body.usage);
        if (usage !== undefined) product.usage = usage;
        const costUsd = asNonNegativeNumber(body.costUsd);
        if (costUsd !== undefined) product.costUsd = costUsd;
        const licenseKey = asString(body.licenseKey);
        if (licenseKey) {
            product.licenseKeyEncrypted = encryptSecret(licenseKey);
            product.licenseKeyMasked = maskSecret(licenseKey);
        }
        const licenseSeats = asNonNegativeNumber(body.licenseSeats);
        if (licenseSeats !== undefined) product.licenseSeats = licenseSeats;
        const licenseExpiresAt = asString(body.licenseExpiresAt);
        if (licenseExpiresAt) product.licenseExpiresAt = new Date(licenseExpiresAt);
        if (body.licenseExpiresAt === null || body.licenseExpiresAt === '') product.licenseExpiresAt = null;

        await product.save();
        await product.populate(productPopulate);

        res.status(200).json({ success: true, data: product });
    })
);

// DELETE /api/products/:id
router.delete(
    '/:id',
    ...adminOnly,
    asyncHandler(async (req, res) => {
        if (!isValidObjectId(req.params.id)) throw new AppError(400, 'Invalid product id');
        const product = await Product.findByIdAndDelete(req.params.id);
        if (!product) throw new AppError(404, 'Product not found');
        // Cascade: drop the product's deployments, visitor logs and usage logs.
        const depFilter: Record<string, unknown> = { targetType: 'product', targetId: req.params.id };
        const visitFilter: Record<string, unknown> = { siteType: 'product', siteId: req.params.id };
        const usageFilter: Record<string, unknown> = { targetType: 'product', targetId: req.params.id };
        await Promise.all([
            Deployment.deleteMany(depFilter),
            VisitLog.deleteMany(visitFilter),
            UsageLog.deleteMany(usageFilter),
        ]);
        res.status(200).json({ success: true, data: null });
    })
);

export default router;
