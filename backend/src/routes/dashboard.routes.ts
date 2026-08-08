import { Router } from 'express';
import { User } from '../models/User';
import { Project, PROJECT_STATUSES } from '../models/Project';
import { Product, PRODUCT_CATEGORIES, PRODUCT_TYPES } from '../models/Product';
import { ApiKey, API_KEY_STATUSES } from '../models/ApiKey';
import { Deployment } from '../models/Deployment';
import { VisitLog } from '../models/VisitLog';
import { asyncHandler } from '../utils/asyncHandler';
import { DAY_MS, dateKey, lastDateKeys, MONGO_TIMEZONE } from '../utils/dateBucket';

const router = Router();

// Dashboard is public (view-only).

// GET /api/dashboard/stats
router.get(
    '/stats',
    asyncHandler(async (_req, res) => {
        const DAYS_30 = 30 * 24 * 60 * 60 * 1000;

        const [userCount, projectCount, productCount, apiKeyCount, deploymentCount] = await Promise.all([
            User.countDocuments(),
            Project.countDocuments(),
            Product.countDocuments(),
            ApiKey.countDocuments(),
            Deployment.countDocuments(),
        ]);

        const [projectsByStatus, productsByType, productsByCategory, apiKeysByStatus, costAgg, deploymentsByStatus] =
            await Promise.all([
                Project.aggregate<{ _id: string; count: number }>([
                    { $group: { _id: '$status', count: { $sum: 1 } } },
                ]),
                Product.aggregate<{ _id: string; count: number }>([
                    { $group: { _id: '$type', count: { $sum: 1 } } },
                ]),
                Product.aggregate<{ _id: string; count: number }>([
                    { $group: { _id: '$category', count: { $sum: 1 } } },
                ]),
                ApiKey.aggregate<{ _id: string; count: number }>([
                    { $group: { _id: '$status', count: { $sum: 1 } } },
                ]),
                ApiKey.aggregate<{ _id: null; usage: number; costUsd: number }>([
                    {
                        $group: {
                            _id: null,
                            usage: { $sum: '$usage' },
                            costUsd: { $sum: '$costUsd' },
                        },
                    },
                ]),
                Deployment.aggregate<{ _id: string; count: number }>([
                    { $group: { _id: '$status', count: { $sum: 1 } } },
                ]),
            ]);

        const statusCounts = (list: { _id: string; count: number }[], all: readonly string[]) => {
            const map = new Map(list.map((entry) => [entry._id, entry.count]));
            return all.map((value) => ({ status: value, count: map.get(value) ?? 0 }));
        };
        const typeCounts = (list: { _id: string; count: number }[], all: readonly string[]) => {
            const map = new Map(list.map((entry) => [entry._id, entry.count]));
            return all.map((value) => ({ type: value, count: map.get(value) ?? 0 }));
        };
        const categoryCounts = (list: { _id: string; count: number }[], all: readonly string[]) => {
            const map = new Map(list.map((entry) => [entry._id, entry.count]));
            return all.map((value) => ({ category: value, count: map.get(value) ?? 0 }));
        };

        const expiringKeys = await ApiKey.countDocuments({
            status: 'active',
            expiresAt: { $gte: new Date(), $lte: new Date(Date.now() + DAYS_30) },
        });
        const expiringSoftware = await Product.countDocuments({
            category: 'software',
            licenseExpiresAt: { $gte: new Date(), $lte: new Date(Date.now() + DAYS_30) },
        });

        // Visitor analytics aggregated across ALL tracked sites (real data once the snippet is embedded).
        const [visitRows, software] = await Promise.all([
            VisitLog.aggregate<{ _id: string; pageviews: number; sessions: string[] }>([
                {
                    $group: {
                        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', ...MONGO_TIMEZONE() } },
                        pageviews: { $sum: 1 },
                        sessions: { $addToSet: '$session' },
                    },
                },
            ]),
            Product.find({ category: 'software' })
                .sort({ licenseExpiresAt: 1 })
                .select('name vendor licenseSeats licenseExpiresAt licenseKeyMasked status')
                .limit(20),
        ]);

        const now = new Date();
        const DAY = DAY_MS;
        const todayKey = dateKey(now);
        const weekKey = dateKey(new Date(now.getTime() - 6 * DAY));
        const monthKey = dateKey(new Date(now.getFullYear(), now.getMonth(), 1));
        const yearKey = dateKey(new Date(now.getFullYear(), 0, 1));
        const countRange = (from: string) => {
            const inRange = visitRows.filter((r) => r._id >= from);
            const sessions = new Set<string>();
            let pageviews = 0;
            for (const r of inRange) {
                pageviews += r.pageviews;
                for (const s of r.sessions) if (s) sessions.add(s);
            }
            return { pageviews, visitors: sessions.size };
        };
        const visitors = {
            totals: {
                today: countRange(todayKey),
                thisWeek: countRange(weekKey),
                thisMonth: countRange(monthKey),
                thisYear: countRange(yearKey),
                allTime: countRange('0000-01-01'),
            },
            series: (() => {
                const byDate = new Map(visitRows.map((r) => [r._id, r]));
                return lastDateKeys(30).map((date) => ({
                    date,
                    visitors: byDate.get(date)?.sessions.length ?? 0,
                    pageviews: byDate.get(date)?.pageviews ?? 0,
                }));
            })(),
        };

        const [recentProjects, recentProducts, recentApiKeys] = await Promise.all([
            Project.find().sort({ createdAt: -1 }).limit(5).select('name status createdAt'),
            Product.find().sort({ createdAt: -1 }).limit(5).select('name type category status createdAt'),
            ApiKey.find()
                .sort({ createdAt: -1 })
                .limit(5)
                .select('name provider keyMasked costUsd usage status expiresAt createdAt'),
        ]);

        const deploymentCounts = {
            live: deploymentsByStatus.find((d) => d._id === 'live')?.count ?? 0,
            offline: deploymentsByStatus.find((d) => d._id === 'offline')?.count ?? 0,
            unknown: deploymentsByStatus.find((d) => d._id === 'unknown')?.count ?? 0,
            paused: deploymentsByStatus.find((d) => d._id === 'paused')?.count ?? 0,
        };

        res.status(200).json({
            success: true,
            data: {
                counts: {
                    users: userCount,
                    projects: projectCount,
                    products: productCount,
                    apiKeys: apiKeyCount,
                    deployments: deploymentCount,
                },
                projectsByStatus: statusCounts(projectsByStatus, PROJECT_STATUSES),
                productsByType: typeCounts(productsByType, PRODUCT_TYPES),
                productsByCategory: categoryCounts(productsByCategory, PRODUCT_CATEGORIES),
                apiKeysByStatus: statusCounts(apiKeysByStatus, API_KEY_STATUSES),
                apiKeyTotals: {
                    usage: costAgg[0]?.usage ?? 0,
                    costUsd: costAgg[0]?.costUsd ?? 0,
                    expiringSoon: expiringKeys,
                    expiringSoftware: expiringSoftware,
                },
                deploymentCounts,
                visitors,
                software,
                recentProjects,
                recentProducts,
                recentApiKeys,
            },
        });
    })
);

export default router;
