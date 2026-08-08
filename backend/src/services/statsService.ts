import { Types, isValidObjectId } from 'mongoose';
import { VisitLog, type VisitSiteType } from '../models/VisitLog';
import { UsageLog, type UsageTargetType } from '../models/UsageLog';
import { AppError } from '../utils/AppError';
import { DAY_MS, dateKey, lastDateKeys, MONGO_TIMEZONE, startOfDay } from '../utils/dateBucket';

const objectId = (id: string): Types.ObjectId => {
    // Callers validate first, but keep this defensive so a bad id can never crash aggregation.
    if (!isValidObjectId(id)) throw new AppError(400, `Invalid id: ${id}`);
    return new Types.ObjectId(id);
};

export interface VisitorPoint {
    date: string; // YYYY-MM-DD
    pageviews: number;
    visitors: number;
}

export interface VisitorTotals {
    today: { pageviews: number; visitors: number };
    thisWeek: { pageviews: number; visitors: number };
    thisMonth: { pageviews: number; visitors: number };
    thisYear: { pageviews: number; visitors: number };
    allTime: { pageviews: number; visitors: number };
}

export interface UsagePoint {
    date: string; // YYYY-MM-DD
    usage: number;
    costUsd: number;
}

/** Build a list of YYYY-MM-DD strings for the last `days` days (today included), oldest first. */
const lastDays = (days: number): string[] => lastDateKeys(days);

interface VisitorGroup {
    date: string;
    pageviews: number;
    sessions: Set<string>;
}

const mergeVisitorRows = (rows: { _id: string; pageviews: number; sessions: string[] }[]): VisitorPoint[] => {
    const map = new Map<string, VisitorGroup>();
    for (const row of rows) {
        const group = map.get(row._id) ?? { date: row._id, pageviews: 0, sessions: new Set() };
        group.pageviews += row.pageviews;
        for (const s of row.sessions) if (s) group.sessions.add(s);
        map.set(row._id, group);
    }
    return [...map.values()]
        .map((g) => ({ date: g.date, pageviews: g.pageviews, visitors: g.sessions.size }))
        .sort((a, b) => (a.date < b.date ? -1 : 1));
};

const queryVisitorRows = async (
    siteType: VisitSiteType,
    siteId: string,
    from: Date
): Promise<{ _id: string; pageviews: number; sessions: string[] }[]> => {
    return VisitLog.aggregate([
        { $match: { siteType, siteId: objectId(siteId), createdAt: { $gte: from } } },
        {
            $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', ...MONGO_TIMEZONE() } },
                pageviews: { $sum: 1 },
                sessions: { $addToSet: '$session' },
            },
        },
    ]);
};

const countRange = (rows: { _id: string; pageviews: number; sessions: string[] }[]): { pageviews: number; visitors: number } => {
    let pageviews = 0;
    const sessions = new Set<string>();
    for (const row of rows) {
        pageviews += row.pageviews;
        for (const s of row.sessions) if (s) sessions.add(s);
    }
    return { pageviews, visitors: sessions.size };
};

export const visitorSummary = async (
    siteType: VisitSiteType,
    siteId: string,
    days = 30
): Promise<{ totals: VisitorTotals; series: VisitorPoint[]; topPages: { page: string; pageviews: number; visitors: number }[] }> => {
    const now = new Date();
    const today = startOfDay(now);
    const weekAgo = new Date(today.getTime() - 6 * DAY_MS);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    // Totals are computed over ALL history; the series stays within the requested window.
    const [allRows, windowRows] = await Promise.all([
        queryVisitorRows(siteType, siteId, new Date(0)),
        queryVisitorRows(siteType, siteId, new Date(now.getTime() - days * DAY_MS)),
    ]);

    const totals: VisitorTotals = {
        today: countRange(allRows.filter((r) => r._id >= dateKey(today))),
        thisWeek: countRange(allRows.filter((r) => r._id >= dateKey(weekAgo))),
        thisMonth: countRange(allRows.filter((r) => r._id >= dateKey(monthStart))),
        thisYear: countRange(allRows.filter((r) => r._id >= dateKey(yearStart))),
        allTime: countRange(allRows),
    };

    const merged = mergeVisitorRows(windowRows);
    const byDate = new Map(merged.map((p) => [p.date, p]));
    const series = lastDays(days).map((date) => byDate.get(date) ?? { date, pageviews: 0, visitors: 0 });

    const topPages = await VisitLog.aggregate<{ _id: string; pageviews: number; sessions: string[] }>([
        {
            $match: {
                siteType,
                siteId: objectId(siteId),
                createdAt: { $gte: new Date(now.getTime() - 30 * DAY_MS) },
            },
        },
        { $group: { _id: '$page', pageviews: { $sum: 1 }, sessions: { $addToSet: '$session' } } },
        { $sort: { pageviews: -1 } },
        { $limit: 10 },
    ]);
    const mappedPages = topPages.map((p) => ({
        page: p._id || '/',
        pageviews: p.pageviews,
        visitors: p.sessions.filter(Boolean).length,
    }));

    return { totals, series, topPages: mappedPages };
};

export const usageSeries = async (
    targetType: UsageTargetType,
    targetId: string,
    days = 30
): Promise<{ series: UsagePoint[]; totalUsage: number; totalCost: number }> => {
    const now = new Date();
    const rows = await UsageLog.aggregate<{ _id: string; usage: number; costUsd: number }>([
        {
            $match: {
                targetType,
                targetId: objectId(targetId),
                createdAt: { $gte: new Date(now.getTime() - days * DAY_MS) },
            },
        },
        {
            $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', ...MONGO_TIMEZONE() } },
                usage: { $sum: '$usageDelta' },
                costUsd: { $sum: '$costDelta' },
            },
        },
    ]);

    const byDate = new Map(rows.map((r) => [r._id, r]));
    const series = lastDays(days).map((date) => {
        const row = byDate.get(date);
        return { date, usage: row?.usage ?? 0, costUsd: row?.costUsd ?? 0 };
    });

    let totalUsage = 0;
    let totalCost = 0;
    for (const row of rows) {
        totalUsage += row.usage;
        totalCost += row.costUsd;
    }

    return { series, totalUsage, totalCost };
};

export const visitorTotalsForReport = async (
    siteType: VisitSiteType,
    siteId: string
): Promise<VisitorTotals> => {
    const summary = await visitorSummary(siteType, siteId, 30);
    return summary.totals;
};
