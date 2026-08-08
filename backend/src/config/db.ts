import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

export const MONGO_URI_DEFAULT = 'mongodb://admin:password@localhost:27017/ai_analytics?authSource=admin';

/**
 * Connect to MongoDB. Returns the mongoose connection (resolved once connected).
 * Unlike a fire-and-forget setup, this is awaitable so boot-time work (e.g. AUTO_SEED)
 * can run only after the database is actually reachable. Callers that don't await it
 * still get mongoose's automatic reconnect retries.
 */
const connectDB = async (): Promise<typeof mongoose.connection> => {
    const uri = process.env.MONGO_URI || MONGO_URI_DEFAULT;
    await mongoose.connect(uri);
    console.log('MongoDB Connected');
    return mongoose.connection;
};

export default connectDB;
