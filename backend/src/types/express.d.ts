import type { HydratedDocument } from 'mongoose';
import type { UserDoc } from '../models/User';

declare global {
    namespace Express {
        interface Request {
            user?: HydratedDocument<UserDoc>;
        }
    }
}

export {};
