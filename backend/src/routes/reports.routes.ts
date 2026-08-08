import { Router, type Response } from 'express';
import PDFDocument from 'pdfkit';
import { isValidObjectId } from 'mongoose';
import { Project } from '../models/Project';
import { Product } from '../models/Product';
import { ApiKey } from '../models/ApiKey';
import { Deployment } from '../models/Deployment';
import { VISIT_SITE_TYPES, type VisitSiteType } from '../models/VisitLog';
import { USAGE_TARGET_TYPES, type UsageTargetType } from '../models/UsageLog';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { protect, restrictTo } from '../middleware/auth';
import { visitorSummary, usageSeries, type VisitorTotals } from '../services/statsService';

const router = Router();

// Reports aggregate the same data that is publicly visible, but downloads are admin-only.
router.use(protect, restrictTo('admin'));

const TARGETS = ['project', 'product', 'apikey'] as const;
type TargetType = (typeof TARGETS)[number];

const siteTypeFor = (targetType: TargetType): VisitSiteType => targetType;
const usageTargetFor = (targetType: TargetType): UsageTargetType | null =>
    targetType === 'apikey' || targetType === 'product' ? targetType : null;

interface ReportContext {
    title: string;
    subtitle: string;
    rows: { label: string; value: string }[];
    totals: VisitorTotals;
    series: { date: string; pageviews: number; visitors: number }[];
    topPages: { page: string; pageviews: number; visitors: number }[];
    usage: { date: string; usage: number; costUsd: number }[] | null;
    usageTotals: { totalUsage: number; totalCost: number } | null;
    deployments: { name: string; kind: string; status: string; uptime: number | null; url: string }[];
}

const buildContext = async (targetType: TargetType, targetId: string, days: number): Promise<ReportContext> => {
    const [visitors, usage, deployments] = await Promise.all([
        visitorSummary(siteTypeFor(targetType), targetId, days),
        usageTargetFor(targetType)
            ? usageSeries(usageTargetFor(targetType) as UsageTargetType, targetId, days)
            : Promise.resolve(null),
        targetType === 'project'
            ? Deployment.find({ targetType: 'project', targetId })
                  .sort({ createdAt: -1 })
                  .select('name kind status uptimePercent displayUrl')
            : Promise.resolve([]),
    ]);

    let title = 'Analytical report';
    let subtitle = '';
    const rows: { label: string; value: string }[] = [];

    if (targetType === 'project') {
        const project = await Project.findById(targetId);
        if (!project) throw new AppError(404, 'Project not found');
        title = project.name;
        subtitle = project.description || 'Project analytics report';
        rows.push(
            { label: 'Status', value: project.status },
            { label: 'Period', value: `Started ${project.startDate ? project.startDate.toISOString().slice(0, 10) : '—'}` },
            { label: 'Report generated', value: new Date().toISOString().slice(0, 16).replace('T', ' ') }
        );
    } else if (targetType === 'product') {
        const product = await Product.findById(targetId);
        if (!product) throw new AppError(404, 'Product not found');
        title = product.name;
        subtitle = `${product.vendor || product.type} — analytics report`;
        rows.push(
            { label: 'Vendor', value: product.vendor || '—' },
            { label: 'Platform', value: product.type },
            { label: 'Status', value: product.status },
            { label: 'Quota', value: product.quota > 0 ? product.quota.toLocaleString() : 'Unlimited' },
            { label: 'Usage', value: product.usage.toLocaleString() },
            { label: 'Remaining', value: product.quota > 0 ? Math.max(0, product.quota - product.usage).toLocaleString() : '∞' },
            { label: 'Cost', value: `$${product.costUsd.toFixed(2)}` },
            { label: 'Report generated', value: new Date().toISOString().slice(0, 16).replace('T', ' ') }
        );
    } else {
        const key = await ApiKey.findById(targetId);
        if (!key) throw new AppError(404, 'API key not found');
        title = key.name;
        subtitle = `${key.provider} API key — analytics report`;
        rows.push(
            { label: 'Provider', value: key.provider },
            { label: 'Key', value: key.keyMasked },
            { label: 'Status', value: key.status },
            { label: 'Quota', value: key.quota > 0 ? key.quota.toLocaleString() : 'Unlimited' },
            { label: 'Usage', value: key.usage.toLocaleString() },
            { label: 'Remaining', value: key.quota > 0 ? Math.max(0, key.quota - key.usage).toLocaleString() : '∞' },
            { label: 'Cost', value: `$${key.costUsd.toFixed(2)}` },
            { label: 'Report generated', value: new Date().toISOString().slice(0, 16).replace('T', ' ') }
        );
    }

    const deploymentRows = deployments.map((d) => ({
        name: d.name,
        kind: d.kind,
        status: d.status,
        uptime: d.uptimePercent ?? null,
        url: d.displayUrl || '—',
    }));

    return {
        title,
        subtitle,
        rows,
        totals: visitors.totals,
        series: visitors.series,
        topPages: visitors.topPages,
        usage: usage ? usage.series : null,
        usageTotals: usage ? { totalUsage: usage.totalUsage, totalCost: usage.totalCost } : null,
        deployments: deploymentRows,
    };
};

const fmt = (n: number): string => n.toLocaleString('en-US');

const escapeCsv = (v: string | number): string => {
    let s = String(v);
    // Guard against spreadsheet formula injection when a cell starts with =, +, -, or @.
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const sendCsv = (res: Response, filename: string, ctx: ReportContext): void => {
    const lines: string[] = [];
    lines.push('AI Product Analytics — Analytical Report');
    lines.push(`Resource,${escapeCsv(ctx.title)}`);
    for (const row of ctx.rows) lines.push(`${escapeCsv(row.label)},${escapeCsv(row.value)}`);
    lines.push('');
    lines.push('Visitors (estimated)');
    lines.push('Period,Pageviews,Visitors');
    for (const key of ['today', 'thisWeek', 'thisMonth', 'thisYear', 'allTime'] as const) {
        lines.push(`${key},${ctx.totals[key].pageviews},${ctx.totals[key].visitors}`);
    }
    lines.push('');
    lines.push('Daily series');
    lines.push('Date,Pageviews,Visitors');
    for (const p of ctx.series) lines.push(`${p.date},${p.pageviews},${p.visitors}`);
    if (ctx.usage && ctx.usage.length > 0) {
        lines.push('');
        lines.push('Usage series');
        lines.push('Date,Usage,Cost USD');
        for (const u of ctx.usage) lines.push(`${u.date},${u.usage},${u.costUsd.toFixed(4)}`);
    }
    if (ctx.deployments.length > 0) {
        lines.push('');
        lines.push('Deployments');
        lines.push('Name,Kind,Status,Uptime %,URL');
        for (const d of ctx.deployments) {
            lines.push(
                `${escapeCsv(d.name)},${d.kind},${d.status},${d.uptime === null ? '' : d.uptime},${escapeCsv(d.url)}`
            );
        }
    }

    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(lines.join('\r\n'));
};

const writePdf = (res: Response, filename: string, ctx: ReportContext): void => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res as unknown as NodeJS.WritableStream);

    const W = doc.page.width - 96;

    doc.fontSize(20).fillColor('#0f172a').text('AI Product Analytics', { continued: false });
    doc.moveDown(0.2);
    doc.fontSize(14).fillColor('#334155').text(ctx.title);
    doc.fontSize(9).fillColor('#64748b').text(ctx.subtitle);
    doc.moveDown(0.8);

    // Summary table
    doc.fontSize(11).fillColor('#0f172a').text('Summary');
    doc.moveDown(0.3);
    let y = doc.y;
    doc.fontSize(9);
    for (const row of ctx.rows) {
        if (y > doc.page.height - 120) {
            doc.addPage();
            y = doc.y;
        }
        doc.fillColor('#64748b').text(row.label, 48, y, { width: 130 });
        doc.fillColor('#0f172a').text(row.value, 190, y, { width: W - 142 });
        y += 15;
    }
    doc.y = y + 8;

    // Visitor totals
    doc.fontSize(11).fillColor('#0f172a').text('Visitors (estimated)');
    doc.moveDown(0.3);
    doc.fontSize(8.5).fillColor('#475569');
    doc.text('Period', 48, doc.y, { width: 90 });
    doc.text('Pageviews', 150, doc.y, { width: 90 });
    doc.text('Visitors', 260, doc.y, { width: 90 });
    doc.moveDown(0.2);
    for (const key of ['today', 'thisWeek', 'thisMonth', 'thisYear', 'allTime'] as const) {
        const t = ctx.totals[key];
        doc.fillColor('#334155').text(key, 48, doc.y, { width: 90 });
        doc.text(fmt(t.pageviews), 150, doc.y, { width: 90 });
        doc.text(fmt(t.visitors), 260, doc.y, { width: 90 });
        doc.moveDown(0.15);
    }

    doc.moveDown(0.6);
    doc.fontSize(11).fillColor('#0f172a').text('Daily traffic (last 14 days)');
    doc.moveDown(0.3);
    doc.fontSize(8.5).fillColor('#475569');
    doc.text('Date', 48, doc.y, { width: 90 });
    doc.text('Pageviews', 150, doc.y, { width: 90 });
    doc.text('Visitors', 260, doc.y, { width: 90 });
    doc.moveDown(0.2);
    for (const p of ctx.series.slice(-14)) {
        if (doc.y > doc.page.height - 120) doc.addPage();
        doc.fillColor('#334155').text(p.date, 48, doc.y, { width: 90 });
        doc.text(fmt(p.pageviews), 150, doc.y, { width: 90 });
        doc.text(fmt(p.visitors), 260, doc.y, { width: 90 });
        doc.moveDown(0.15);
    }

    if (ctx.topPages.length > 0) {
        doc.moveDown(0.6);
        doc.fontSize(11).fillColor('#0f172a').text('Top pages (30 days)');
        doc.moveDown(0.3);
        doc.fontSize(8.5).fillColor('#475569');
        doc.text('Page', 48, doc.y, { width: W - 220 });
        doc.text('Pageviews', W - 160, doc.y, { width: 80 });
        doc.text('Visitors', W - 70, doc.y, { width: 70 });
        doc.moveDown(0.2);
        for (const page of ctx.topPages) {
            if (doc.y > doc.page.height - 120) doc.addPage();
            doc.fillColor('#334155').text(page.page || '/', 48, doc.y, { width: W - 220 });
            doc.text(fmt(page.pageviews), W - 160, doc.y, { width: 80 });
            doc.text(fmt(page.visitors), W - 70, doc.y, { width: 70 });
            doc.moveDown(0.15);
        }
    }

    if (ctx.usage && ctx.usage.length > 0) {
        doc.moveDown(0.6);
        doc.fontSize(11).fillColor('#0f172a').text('Usage & cost');
        doc.moveDown(0.3);
        doc.fontSize(9).fillColor('#0f172a');
        doc.text(
            `Tracked usage (30 days): ${fmt(ctx.usageTotals?.totalUsage ?? 0)}  ·  Cost: $${(
                ctx.usageTotals?.totalCost ?? 0
            ).toFixed(2)}`
        );
    }

    if (ctx.deployments.length > 0) {
        doc.moveDown(0.6);
        doc.fontSize(11).fillColor('#0f172a').text('Deployments & uptime');
        doc.moveDown(0.3);
        doc.fontSize(8.5).fillColor('#475569');
        doc.text('Name', 48, doc.y, { width: 140 });
        doc.text('Kind', 190, doc.y, { width: 60 });
        doc.text('Status', 250, doc.y, { width: 70 });
        doc.text('Uptime', 320, doc.y, { width: 60 });
        doc.text('URL', 380, doc.y, { width: W - 332 });
        doc.moveDown(0.2);
        for (const d of ctx.deployments) {
            if (doc.y > doc.page.height - 120) doc.addPage();
            doc.fillColor('#334155').text(d.name, 48, doc.y, { width: 140 });
            doc.text(d.kind, 190, doc.y, { width: 60 });
            doc.text(d.status, 250, doc.y, { width: 70 });
            doc.text(d.uptime === null ? '—' : `${d.uptime}%`, 320, doc.y, { width: 60 });
            doc.text(d.url, 380, doc.y, { width: W - 332 });
            doc.moveDown(0.15);
        }
    }

    doc.moveDown(1);
    doc.fontSize(7.5).fillColor('#94a3b8').text(
        `Generated by AI Product Analytics · visitors are estimated from session-based tracking`
    );
    doc.end();
};

// GET /api/reports/:targetType/:targetId?format=pdf|csv&days=30
router.get(
    '/:targetType/:targetId',
    asyncHandler(async (req, res) => {
        const targetType = String(req.params.targetType ?? '');
        const targetId = String(req.params.targetId ?? '');
        if (!(TARGETS as readonly string[]).includes(targetType)) {
            throw new AppError(400, 'Invalid targetType (project, product or apikey)');
        }
        if (!isValidObjectId(targetId)) throw new AppError(400, 'Invalid targetId');

        const format = req.query.format === 'csv' ? 'csv' : 'pdf';
        const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));

        const ctx = await buildContext(targetType as TargetType, targetId, days);
        const filename = `report-${targetType}-${targetId.slice(-6)}-${new Date().toISOString().slice(0, 10)}.${format}`;

        if (format === 'csv') {
            sendCsv(res, filename, ctx);
        } else {
            writePdf(res, filename, ctx);
        }
    })
);

export default router;
