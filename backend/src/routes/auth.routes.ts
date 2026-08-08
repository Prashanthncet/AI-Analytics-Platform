import { Router } from 'express';
import type { HydratedDocument } from 'mongoose';
import { User, comparePassword, type UserDoc, type UserRole } from '../models/User';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { protect, signToken } from '../middleware/auth';

const router = Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface SafeUser {
    _id: string;
    name: string;
    email: string;
    role: UserRole;
    active: boolean;
    createdAt: Date;
}

const toSafeUser = (user: HydratedDocument<UserDoc>): SafeUser => ({
    _id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
    createdAt: user.createdAt,
});

// Public registration is intentionally disabled — the admin account is provisioned by the seed
// script (`npm run seed`) from ADMIN_EMAIL / ADMIN_PASSWORD environment variables.

// POST /api/auth/login
router.post(
    '/login',
    asyncHandler(async (req, res) => {
        const { email, password } = req.body ?? {};

        if (typeof email !== 'string' || typeof password !== 'string') {
            throw new AppError(400, 'Email and password are required');
        }

        const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+password');
        if (!user || !user.active || !(await comparePassword(password, user.password))) {
            throw new AppError(401, 'Invalid email or password');
        }
        // The platform is admin-only — non-admin accounts (e.g. legacy Phase 1 users) cannot sign in.
        if (user.role !== 'admin') {
            throw new AppError(403, 'Access is restricted to administrators');
        }

        const token = signToken(user._id.toString(), user.role);
        res.status(200).json({ success: true, token, user: toSafeUser(user) });
    })
);

// GET /api/auth/me
router.get(
    '/me',
    protect,
    asyncHandler(async (req, res) => {
        res.status(200).json({ success: true, user: toSafeUser(req.user!) });
    })
);

export default router;
