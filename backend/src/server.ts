import mongoose from 'mongoose';
import app from './app';
import dotenv from 'dotenv';
import connectDB, { MONGO_URI_DEFAULT } from './config/db';
import { startMonitor } from './monitor/worker';
import { runSeed } from './seed';

dotenv.config();

const PORT = process.env.PORT || 5000;

// Fail fast in production if secrets are missing (dev uses safe local fallbacks).
if (process.env.NODE_ENV === 'production') {
    if (!process.env.JWT_SECRET) {
        console.error('JWT_SECRET must be set in production');
        process.exit(1);
    }
    if (!process.env.ENCRYPTION_KEY) {
        console.error('ENCRYPTION_KEY must be set in production');
        process.exit(1);
    }
}

// Fail fast in production if secrets are missing (dev uses safe local fallbacks).
if (process.env.NODE_ENV === 'production') {
    if (!process.env.MONGO_URI) {
        console.error('MONGO_URI must be set in production');
        process.exit(1);
    }
}

// Connect to Database (non-blocking; mongoose auto-reconnects).
connectDB().catch((err) => console.error('MongoDB Connection Error: ', err));

/** Run the idempotent seed after the DB is actually reachable (retries on cold start). */
const runAutoSeed = async (attempts = 5, delayMs = 10_000): Promise<void> => {
    for (let i = 1; i <= attempts; i++) {
        try {
            await mongoose.connect(process.env.MONGO_URI || MONGO_URI_DEFAULT);
            await runSeed();
            console.log('✓ AUTO_SEED complete');
            return;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`AUTO_SEED attempt ${i}/${attempts} failed (${message})`);
            if (i < attempts) await new Promise((r) => setTimeout(r, delayMs));
        }
    }
    console.error('AUTO_SEED gave up after retries — seed manually with npm run seed');
};

// On a fresh deployment the database is empty. Seed the admin account + real projects/products/
// deployments exactly once (idempotent — no-ops when projects already exist), so the deployed
// dashboard is usable without manual steps. Retried because managed Mongo can cold-start slowly.
if (process.env.AUTO_SEED === 'true' || process.env.AUTO_SEED === '1') {
    void runAutoSeed();
}

// Start the uptime monitor (deployment checks + key auto-expiry)
startMonitor();

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
