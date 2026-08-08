import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError';

export const notFoundHandler = (req: Request, _res: Response, next: NextFunction) => {
    next(new AppError(404, `Route not found: ${req.method} ${req.originalUrl}`));
};

export const errorHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    let error: AppError;

    if (err instanceof AppError) {
        error = err;
    } else if (
        err instanceof Error &&
        'code' in err &&
        (err as { code?: unknown }).code === 11000
    ) {
        // MongoDB duplicate key (e.g. unique email)
        error = new AppError(409, 'A record with this value already exists');
    } else {
        console.error('Unhandled error:', err instanceof Error ? err.message : err);
        error = new AppError(500, 'Something went wrong');
    }

    res.status(error.statusCode).json({
        success: false,
        message: error.message,
    });
};
