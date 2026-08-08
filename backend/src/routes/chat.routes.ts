import { Router } from 'express';
import { Project } from '../models/Project';
import { Product } from '../models/Product';
import { ApiKey } from '../models/ApiKey';
import { Deployment } from '../models/Deployment';
import { VisitLog, VISIT_SITE_TYPES, type VisitSiteType } from '../models/VisitLog';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { protect, restrictTo } from '../middleware/auth';
import { asString } from '../utils/validation';
import { DAY_MS, dateKey, lastDateKeys, MONGO_TIMEZONE } from '../utils/dateBucket';

const router = Router();

// Admin-only: this assistant answers questions about the platform's own data.
router.use(protect, restrictTo('admin'));

const DAYS_30 = 30 * 24 * 60 * 60 * 1000;
const DAY = DAY_MS;

interface ChatRow {
    [key: string]: string | number;
}

interface ChatReply {
    reply: string;
    kind: 'text' | 'table';
    columns?: string[];
    rows?: ChatRow[];
    reports?: { label: string; url: string; format: string }[];
    chart?: { label: string; color: string; data: { date: string; value: number }[] };
}

const fmt = (n: number): string => n.toLocaleString('en-US');
const replyText = (reply: string): ChatReply => ({ reply, kind: 'text' });

/** Aggregate ALL tracked visits into daily rows (optionally filtered by siteType). */
const visitRows = async (siteType?: VisitSiteType) => {
    const match: Record<string, unknown> = {};
    if (siteType) match.siteType = siteType;
    return VisitLog.aggregate<{ _id: string; pageviews: number; sessions: string[] }>([
        { $match: match },
        {
            $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', ...MONGO_TIMEZONE() } },
                pageviews: { $sum: 1 },
                sessions: { $addToSet: '$session' },
            },
        },
    ]);
};

const totalsFromRows = (rows: { _id: string; pageviews: number; sessions: string[] }[]) => {
    const now = new Date();
    const todayKey = dateKey(now);
    const weekKey = dateKey(new Date(now.getTime() - 6 * DAY));
    const monthKey = dateKey(new Date(now.getFullYear(), now.getMonth(), 1));
    const yearKey = dateKey(new Date(now.getFullYear(), 0, 1));
    const count = (from: string) => {
        const inRange = rows.filter((r) => r._id >= from);
        const sessions = new Set<string>();
        let pageviews = 0;
        for (const r of inRange) {
            pageviews += r.pageviews;
            for (const s of r.sessions) if (s) sessions.add(s);
        }
        return { pageviews, visitors: sessions.size };
    };
    return {
        today: count(todayKey),
        thisWeek: count(weekKey),
        thisMonth: count(monthKey),
        thisYear: count(yearKey),
        allTime: count('0000-01-01'),
    };
};

const seriesFromRows = (rows: { _id: string; pageviews: number; sessions: string[] }[], days: number) => {
    const byDate = new Map(rows.map((r) => [r._id, r]));
    return lastDateKeys(days).map((date) => ({ date, value: byDate.get(date)?.sessions.length ?? 0 }));
};

const allVisitorTotals = async () => totalsFromRows(await visitRows());

const handle = async (q: string): Promise<ChatReply> => {
    const text = q.toLowerCase();

    // ---- Overview ----
    if (/overview|summary|dashboard|everything|all stats|status of/.test(text) && !/visitor|traffic|usage|cost/.test(text)) {
        const [projects, products, keys, deployments, visRows] = await Promise.all([
            Project.countDocuments(),
            Product.countDocuments(),
            ApiKey.countDocuments(),
            Deployment.find().select('name status uptimePercent'),
            visitRows(),
        ]);
        const live = deployments.filter((d) => d.status === 'live').length;
        const offline = deployments.filter((d) => d.status === 'offline').length;
        const totals = totalsFromRows(visRows);
        return {
            reply: `You have **${projects} projects**, **${products} products/tools**, **${keys} API keys** and **${deployments.length} monitored deployments** (${live} live, ${offline} offline). Today: ${fmt(totals.today.visitors)} visitors · ${fmt(totals.today.pageviews)} pageviews across all tracked sites.`,
            kind: 'table',
            columns: ['Metric', 'Value'],
            rows: [
                { Metric: 'Projects', Value: projects },
                { Metric: 'AI tools & software', Value: products },
                { Metric: 'API keys tracked', Value: keys },
                { Metric: 'Deployments live', Value: `${live}/${deployments.length}` },
                { Metric: 'Deployments offline', Value: offline },
                { Metric: "Today's visitors", Value: fmt(totals.today.visitors) },
                { Metric: "Today's pageviews", Value: fmt(totals.today.pageviews) },
                { Metric: 'All-time visitors', Value: fmt(totals.allTime.visitors) },
            ],
            chart: {
                label: 'Visitors · last 30 days (all sites)',
                color: '#8b5cf6',
                data: seriesFromRows(visRows, 30),
            },
        };
    }

    // ---- Projects ----
    if (/project/.test(text) && !/report|analytics/.test(text)) {
        const projects = await Project.find().sort({ createdAt: -1 }).select('name status');
        if (projects.length === 0) return replyText('No projects yet. Create one from the Projects page.');
        return {
            reply: `${projects.length} project(s) tracked:`,
            kind: 'table',
            columns: ['Project', 'Status'],
            rows: projects.map((p) => ({ Project: p.name, Status: p.status })),
        };
    }

    // ---- Live / offline monitoring ----
    if (/live|offline|uptime|online|monitor|status|down|deployment/.test(text) && !/visitor|usage|cost/.test(text)) {
        const deployments = await Deployment.find().sort({ status: 1 }).select('name kind status uptimePercent lastResponseMs lastCheckedAt');
        if (deployments.length === 0) return replyText('No deployments configured yet. Add check URLs on a project page to start monitoring.');
        const offline = deployments.filter((d) => d.status === 'offline').length;
        return {
            reply: `Monitoring ${deployments.length} deployment(s) every 60s — **${deployments.filter((d) => d.status === 'live').length} live**, **${offline} offline**${offline > 0 ? ' ⚠️' : ''}.`,
            kind: 'table',
            columns: ['Deployment', 'Kind', 'Status', 'Uptime %', 'Response'],
            rows: deployments.map((d) => ({
                Deployment: d.name,
                Kind: d.kind,
                Status: d.status,
                'Uptime %': d.uptimePercent === null || d.uptimePercent === undefined ? '—' : `${d.uptimePercent}%`,
                Response: d.lastResponseMs === null || d.lastResponseMs === undefined ? '—' : `${d.lastResponseMs}ms`,
            })),
        };
    }

    // ---- Visitors / traffic ----
    if (/visitor|traffic|user|visit|pageview/.test(text)) {
        const all = await allVisitorTotals();
        const perSite = [];
        for (const siteType of VISIT_SITE_TYPES) {
            const t = totalsFromRows(await visitRows(siteType));
            if (t.allTime.visitors > 0 || siteType === 'project') {
                perSite.push({
                    Site: siteType,
                    "Today's visitors": fmt(t.today.visitors),
                    'This week': fmt(t.thisWeek.visitors),
                    'This month': fmt(t.thisMonth.visitors),
                    'All time': fmt(t.allTime.visitors),
                });
            }
        }
        return {
            reply: `Visitor analytics (estimated from session tracking): **${fmt(all.today.visitors)} today**, ${fmt(all.thisWeek.visitors)} this week, ${fmt(all.thisMonth.visitors)} this month, ${fmt(all.allTime.visitors)} all-time across all tracked sites. Embed the tracking snippet to count real visits.`,
            kind: 'table',
            columns: ['Period', 'Visitors', 'Pageviews'],
            rows: [
                { Period: 'Today', Visitors: fmt(all.today.visitors), Pageviews: fmt(all.today.pageviews) },
                { Period: 'This week', Visitors: fmt(all.thisWeek.visitors), Pageviews: fmt(all.thisWeek.pageviews) },
                { Period: 'This month', Visitors: fmt(all.thisMonth.visitors), Pageviews: fmt(all.thisMonth.pageviews) },
                { Period: 'This year', Visitors: fmt(all.thisYear.visitors), Pageviews: fmt(all.thisYear.pageviews) },
                { Period: 'All time', Visitors: fmt(all.allTime.visitors), Pageviews: fmt(all.allTime.pageviews) },
            ],
        };
    }

    // ---- Usage / quota ----
    if (/usage|quota|remaining|utiliz|consume|token/.test(text) && !/cost|spend|price/.test(text)) {
        const [products, keys] = await Promise.all([
            Product.find({ category: 'ai_tool' }).sort({ usage: -1 }).limit(10).select('name quota usage costUsd'),
            ApiKey.find().sort({ usage: -1 }).limit(10).select('name provider quota usage costUsd'),
        ]);
        const pct = (u: number, q: number) => (q > 0 ? `${Math.min(100, Math.round((u / q) * 100))}%` : 'unlimited');
        const rows: ChatRow[] = [
            ...products.map((p) => ({
                Resource: `🛠 ${p.name}`,
                Type: 'AI tool',
                Used: fmt(p.usage),
                Quota: p.quota > 0 ? fmt(p.quota) : '∞',
                'Used %': pct(p.usage, p.quota),
                Cost: `$${p.costUsd.toFixed(2)}`,
            })),
            ...keys.map((k) => ({
                Resource: `🔑 ${k.name}`,
                Type: `API key (${k.provider})`,
                Used: fmt(k.usage),
                Quota: k.quota > 0 ? fmt(k.quota) : '∞',
                'Used %': pct(k.usage, k.quota),
                Cost: `$${k.costUsd.toFixed(2)}`,
            })),
        ];
        if (rows.length === 0) return replyText('No usage data yet. Add AI tools and API keys to track usage.');
        return { reply: 'Usage vs quota across AI tools and API keys:', kind: 'table', columns: ['Resource', 'Type', 'Used', 'Quota', 'Used %', 'Cost'], rows };
    }

    // ---- Cost / spend ----
    if (/cost|spend|spent|price|money|budget/.test(text)) {
        const [keys, products] = await Promise.all([
            ApiKey.aggregate<{ _id: string; costUsd: number }>([{ $group: { _id: '$provider', costUsd: { $sum: '$costUsd' } } }, { $sort: { costUsd: -1 } }]),
            Product.aggregate<{ _id: string; costUsd: number }>([{ $group: { _id: '$category', costUsd: { $sum: '$costUsd' } } }, { $sort: { costUsd: -1 } }]),
        ]);
        const total = [...keys, ...products].reduce((s, r) => s + r.costUsd, 0);
        return {
            reply: `Total tracked spend: **$${total.toFixed(2)}**. Breakdown by provider and category:`,
            kind: 'table',
            columns: ['Provider / Category', 'Cost (USD)'],
            rows: [
                ...keys.map((k) => ({ 'Provider / Category': k._id, 'Cost (USD)': `$${k.costUsd.toFixed(2)}` })),
                ...products.map((p) => ({ 'Provider / Category': `Products (${p._id})`, 'Cost (USD)': `$${p.costUsd.toFixed(2)}` })),
            ],
        };
    }

    // ---- Expiring keys / licenses ----
    if (/expir|expire|renew|soon|running out/.test(text)) {
        const [keys, software] = await Promise.all([
            ApiKey.find({ status: 'active', expiresAt: { $lte: new Date(Date.now() + DAYS_30) } }).select('name provider expiresAt'),
            Product.find({ category: 'software', licenseExpiresAt: { $ne: null } }).select('name vendor licenseExpiresAt licenseSeats'),
        ]);
        const keyRows = keys.map((k) => ({
            Resource: k.name,
            Type: 'API key',
            Expires: k.expiresAt ? k.expiresAt.toISOString().slice(0, 10) : '—',
            'Days left': Math.max(0, Math.ceil(((k.expiresAt?.getTime() ?? 0) - Date.now()) / DAY)),
        }));
        const swRows = software.map((s) => ({
            Resource: s.name,
            Type: 'Software license',
            Expires: s.licenseExpiresAt ? s.licenseExpiresAt.toISOString().slice(0, 10) : '—',
            'Days left': Math.max(0, Math.ceil(((s.licenseExpiresAt?.getTime() ?? 0) - Date.now()) / DAY)),
        }));
        const rows = [...keyRows, ...swRows];
        if (rows.length === 0) return replyText('Nothing expiring in the next 30 days. ✅');
        return { reply: `⚠️ ${rows.length} item(s) expire within 30 days:`, kind: 'table', columns: ['Resource', 'Type', 'Expires', 'Days left'], rows };
    }

    // ---- Software / licenses ----
    if (/software|license|photoshop|figma|seat/.test(text)) {
        const software = await Product.find({ category: 'software' }).select('name vendor licenseExpiresAt licenseSeats status licenseKeyMasked');
        if (software.length === 0) return replyText('No licensed software tracked yet. Add software from the Products page.');
        return {
            reply: `${software.length} licensed software product(s):`,
            kind: 'table',
            columns: ['Software', 'Vendor', 'Seats', 'License', 'Expires'],
            rows: software.map((s) => ({
                Software: s.name,
                Vendor: s.vendor || '—',
                Seats: s.licenseSeats,
                License: s.licenseKeyMasked || '—',
                Expires: s.licenseExpiresAt ? s.licenseExpiresAt.toISOString().slice(0, 10) : 'Never',
            })),
        };
    }

    // ---- Reports ----
    if (/report|export|download|pdf|csv/.test(text)) {
        const [projects, products, keys] = await Promise.all([
            Project.find().select('name'),
            Product.find().select('name category'),
            ApiKey.find().select('name'),
        ]);
        const reports = [
            ...projects.map((p) => ({ label: `📄 ${p.name} (project)`, url: `/api/reports/project/${p._id}?format=pdf`, format: 'pdf' })),
            ...products.map((p) => ({ label: `📄 ${p.name} (${p.category})`, url: `/api/reports/product/${p._id}?format=pdf`, format: 'pdf' })),
            ...keys.map((k) => ({ label: `📄 ${k.name} (API key)`, url: `/api/reports/apikey/${k._id}?format=pdf`, format: 'pdf' })),
        ];
        if (reports.length === 0) return replyText('Nothing to report yet.');
        return {
            reply: `Generate an analytical report for any resource — use the download buttons:`,
            kind: 'table',
            columns: ['Resource', 'Format'],
            rows: reports.map((r) => ({ Resource: r.label.replace('📄 ', ''), Format: r.format })),
            reports,
        };
    }

    // ---- Help ----
    return replyText(
        'I can answer questions about your platform data. Try:\n• "overview" — everything at a glance\n• "live status" / "is my site down"\n• "visitors today / this month"\n• "usage and quota remaining"\n• "api cost / spend"\n• "what expires soon"\n• "software licenses"\n• "reports" — download PDF/CSV\n• "help" — this list'
    );
};

// POST /api/chat — ask the assistant a question (admin only).
router.post(
    '/',
    asyncHandler(async (req, res) => {
        const message = asString(req.body?.message);
        if (!message || message.trim().length === 0) {
            throw new AppError(400, 'Ask me a question — e.g. "overview" or "visitors this month"');
        }
        const reply = await handle(message.slice(0, 500));
        res.status(200).json({ success: true, data: reply });
    })
);

// GET /api/chat/help — capabilities reference for the UI quick-chips.
router.get('/help', (_req, res) => {
    res.status(200).json({
        success: true,
        data: [
            { label: 'Overview', prompt: 'overview' },
            { label: 'Live status', prompt: 'live status of all deployments' },
            { label: 'Visitors', prompt: 'visitors this month' },
            { label: 'Usage & quota', prompt: 'usage and quota remaining' },
            { label: 'API spend', prompt: 'api cost breakdown' },
            { label: 'Expiring soon', prompt: 'what expires soon' },
            { label: 'Software licenses', prompt: 'software licenses' },
            { label: 'Reports', prompt: 'reports' },
        ],
    });
});

export default router;
