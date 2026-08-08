import jwt, { type JwtPayload } from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { User, type UserRole } from '../models/User';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';

export interface AuthTokenPayload extends JwtPayload {
    id: string;
    role: UserRole;
}

export const signToken = (userId: string, role: UserRole): string =>
    jwt.sign({ id: userId, role }, process.env.JWT_SECRET || 'dev_secret', { expiresIn: '7d' });

export const protect = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        throw new AppError(401, 'Not authorized — missing token');
    }

    const token = header.split(' ')[1];
    if (!token) {
        throw new AppError(401, 'Not authorized — missing token');
    }

    let decoded: AuthTokenPayload;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret') as AuthTokenPayload;
    } catch {
        throw new AppError(401, 'Not authorized — token expired or invalid');
    }

    const user = await User.findById(decoded.id);
    if (!user || !user.active) {
        throw new AppError(401, 'Not authorized — user no longer exists');
    }

    req.user = user;
    next();
});

export const restrictTo = (...roles: UserRole[]) =>
    (req: Request, _res: Response, next: NextFunction) => {
        if (!req.user || !roles.includes(req.user.role)) {
            throw new AppError(403, 'You do not have permission to perform this action');
        }
        next();
    };
