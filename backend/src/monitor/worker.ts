import { Deployment, MAX_CHECKS } from '../models/Deployment';
import { ApiKey } from '../models/ApiKey';

const CHECK_TIMEOUT_MS = 10_000;
const DUE_AFTER_MS = 45_000; // re-check when the last check is older than this

/** 24h rolling uptime from the stored check history, as a 0-100 number (null if no checks). */
const computeUptime = (
    checks: { at: Date; ok: boolean }[] | undefined
): number | null => {
    if (!checks || checks.length === 0) return null;
    const recent = checks.slice(-MAX_CHECKS);
    const ok = recent.filter((c) => c.ok).length;
    return Math.round((ok / recent.length) * 1000) / 10;
};

const checkDeployment = async (deploymentId: string): Promise<void> => {
    const deployment = await Deployment.findById(deploymentId);
    if (!deployment || !deployment.enabled || !deployment.checkUrl) return;

    const url = deployment.checkUrl;
    const startedAt = Date.now();
    let ok = false;

    try {
        const res = await fetch(url, {
            method: 'GET',
            // Never follow redirects — a 3xx still proves the server is up, and this avoids the
            // check URL redirecting the probe onto internal/cloud-metadata endpoints.
            redirect: 'manual',
            signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
            headers: { 'user-agent': 'AI-Analytics-Uptime/1.0' },
        });
        ok = res.status < 500; // 2xx/3xx/4xx all mean the server answered; 5xx is treated as down.
    } catch {
        ok = false;
    }

    const responseMs = Date.now() - startedAt;

    deployment.checks.push({ at: new Date(), ok, responseMs });
    while (deployment.checks.length > MAX_CHECKS) deployment.checks.shift();
    const uptimePercent = computeUptime(deployment.checks);

    const newStatus = ok ? 'live' : 'offline';
    const changed = deployment.status !== newStatus;

    deployment.uptimePercent = uptimePercent;
    deployment.lastCheckedAt = new Date();
    deployment.lastResponseMs = responseMs;
    if (changed) {
        deployment.status = newStatus;
        deployment.lastStatusChangeAt = new Date();
    }

    await deployment.save();
};

const sweepDueDeployments = async (): Promise<void> => {
    const due = await Deployment.find({
        enabled: true,
        checkUrl: { $ne: '' },
        $or: [{ lastCheckedAt: { $lt: new Date(Date.now() - DUE_AFTER_MS) } }, { lastCheckedAt: null }],
    }).select('_id');

    if (due.length === 0) return;
    // Run checks concurrently but bounded.
    const pool = due.map((d) => checkDeployment(d._id.toString()));
    await Promise.allSettled(pool);
};

/** Mark API keys whose expiry has passed as expired. */
const sweepExpiredKeys = async (): Promise<void> => {
    await ApiKey.updateMany(
        { status: 'active', expiresAt: { $lt: new Date() } },
        { $set: { status: 'expired' } }
    );
};

let sweeping = false;

const runSweep = async (): Promise<void> => {
    if (sweeping) return; // never let two sweeps overlap
    sweeping = true;
    try {
        await Promise.all([sweepExpiredKeys(), sweepDueDeployments()]);
    } catch (err) {
        console.error('Monitor sweep error:', err instanceof Error ? err.message : err);
    } finally {
        sweeping = false;
    }
};

let intervalId: NodeJS.Timeout | null = null;

/** Start the monitor worker. Runs an initial sweep immediately, then on the configured interval. */
export const startMonitor = (): void => {
    if (intervalId) return;
    const intervalMs = Number(process.env.MONITOR_INTERVAL_MS) || 60_000;
    void runSweep();
    intervalId = setInterval(() => void runSweep(), intervalMs);
    intervalId.unref();
    console.log(`Monitor worker started (interval ${intervalMs}ms)`);
};
