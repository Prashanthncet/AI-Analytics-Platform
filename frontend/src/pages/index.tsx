"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Boxes,
  CircleDollarSign,
  FolderKanban,
  Gauge,
  KeyRound,
  LayoutDashboard,
  Radio,
  ShieldCheck,
  Users,
  Zap,
} from "lucide-react";
import Layout from "@/components/Layout";
import { Badge, EmptyState, LiveBadge, ProgressBar, Spinner, type LiveStatus } from "@/components/ui";
import { LineChart } from "@/components/Chart";
import { http } from "@/lib/api";
import type { DashboardStats, Deployment, Product, ProjectStatus } from "@/lib/types";

const statusTone: Record<ProjectStatus, "blue" | "green" | "amber" | "red"> = {
  active: "green",
  on_hold: "amber",
  completed: "blue",
  archived: "red",
};

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
  href,
}: {
  label: string;
  value: number;
  sub?: string;
  icon: typeof Boxes;
  accent: string;
  href?: string;
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${accent}`}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      <p className="mt-3 text-3xl font-bold tabular-nums tracking-tight text-slate-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </>
  );

  const classes =
    "block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md";

  return href ? (
    <Link href={href} className={`group ${classes}`}>
      {inner}
    </Link>
  ) : (
    <div className={classes}>{inner}</div>
  );
}

function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Ticking clock so license countdowns recompute without calling Date.now() in render.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      Promise.all([
        http.get<DashboardStats>("/api/dashboard/stats"),
        http.get<Deployment[]>("/api/deployments?status=live,offline,unknown,paused").catch(() => [] as Deployment[]),
        http.get<Product[]>("/api/products").catch(() => [] as Product[]),
      ])
        .then(([s, deps, prods]) => {
          if (cancelled) return;
          setError(null);
          setStats(s);
          setDeployments(Array.isArray(deps) ? deps : []);
          setProducts(Array.isArray(prods) ? prods : []);
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load dashboard");
        });
    };
    load();
    // Live monitoring: refresh deployment health every 30s.
    const poll = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, []);

  if (error) {
    return (
      <Layout title="Dashboard">
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-600/20">{error}</p>
      </Layout>
    );
  }

  if (!stats) {
    return (
      <Layout title="Dashboard">
        <div className="flex h-64 items-center justify-center">
          <Spinner className="h-7 w-7" />
        </div>
      </Layout>
    );
  }

  const { counts } = stats;
  const aiTools = stats.productsByCategory.find((c) => c.category === "ai_tool")?.count ?? 0;
  const software = stats.productsByCategory.find((c) => c.category === "software")?.count ?? 0;
  const vis = stats.visitors;
  const visSeries = vis.series ?? [];
  const liveDeps = deployments.filter((d) => d.status === "live");
  const offlineDeps = deployments.filter((d) => d.status === "offline");
  const topTools = products.filter((p) => p.category === "ai_tool").slice(0, 5);

  return (
    <Layout
      title="Dashboard"
      subtitle="Live monitoring, visitor analytics and API usage at a glance"
      actions={
        <span className="hidden items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20 sm:inline-flex">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Monitoring live
        </span>
      }
    >
      <div className="space-y-6">
        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatCard label="Projects" value={counts.projects} sub={`${stats.projectsByStatus.find((s) => s.status === "active")?.count ?? 0} active`} icon={FolderKanban} accent="bg-blue-50 text-blue-600" href="/projects" />
          <StatCard label="AI Tools" value={aiTools} sub="API usage tracked" icon={Zap} accent="bg-violet-50 text-violet-600" href="/products" />
          <StatCard label="Software" value={software} sub="licenses managed" icon={ShieldCheck} accent="bg-amber-50 text-amber-600" href="/products" />
          <StatCard label="API Keys" value={counts.apiKeys} sub={`$${stats.apiKeyTotals.costUsd.toFixed(2)} spend`} icon={KeyRound} accent="bg-emerald-50 text-emerald-600" href="/apikeys" />
          <StatCard
            label="Deployments"
            value={counts.deployments}
            sub={`${liveDeps.length} live · ${offlineDeps.length} offline`}
            icon={Radio}
            accent="bg-rose-50 text-rose-600"
          />
        </div>

        {/* Row: visitor analytics + deployment health */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-violet-500" />
                <h2 className="text-sm font-semibold text-slate-900">Visitor analytics</h2>
              </div>
              <span className="text-[11px] text-slate-400">estimated · across all tracked sites</span>
            </div>
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                { label: "Today", v: vis.totals.today.visitors, pv: vis.totals.today.pageviews },
                { label: "This week", v: vis.totals.thisWeek.visitors, pv: vis.totals.thisWeek.pageviews },
                { label: "This month", v: vis.totals.thisMonth.visitors, pv: vis.totals.thisMonth.pageviews },
                { label: "This year", v: vis.totals.thisYear.visitors, pv: vis.totals.thisYear.pageviews },
                { label: "All time", v: vis.totals.allTime.visitors, pv: vis.totals.allTime.pageviews },
              ].map((s) => (
                <div key={s.label} className="rounded-xl bg-violet-50/60 p-2.5 ring-1 ring-inset ring-violet-100">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-500">{s.label}</p>
                  <p className="mt-0.5 text-xl font-bold tabular-nums text-slate-900">{s.v.toLocaleString()}</p>
                  <p className="text-[10px] tabular-nums text-slate-400">{s.pv.toLocaleString()} views</p>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-2">
              <p className="mb-1 px-1 text-xs font-medium text-slate-500">Visitors · last 30 days</p>
              <LineChart data={visSeries.map((d) => ({ date: d.date, value: d.visitors }))} name="Visitors" color="#8b5cf6" height={220} />
            </div>
          </div>

          {/* Deployment health */}
          <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-rose-500" />
                <h2 className="text-sm font-semibold text-slate-900">Deployment health</h2>
              </div>
              <Link href="/projects" className="text-xs font-medium text-blue-600 hover:text-blue-700">
                View all
              </Link>
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              <LiveBadge status="live" /> <span className="text-sm font-semibold tabular-nums text-slate-700">{liveDeps.length}</span>
              <span className="mx-1 text-slate-200">|</span>
              <LiveBadge status="offline" /> <span className="text-sm font-semibold tabular-nums text-slate-700">{offlineDeps.length}</span>
              <span className="mx-1 text-slate-200">|</span>
              <LiveBadge status="unknown" /> <span className="text-sm font-semibold tabular-nums text-slate-700">{deployments.filter((d) => d.status === "unknown").length}</span>
            </div>
            {offlineDeps.length > 0 && (
              <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/20">
                ⚠ {offlineDeps.length} deployment(s) offline right now
              </div>
            )}
            <div className="flex-1 space-y-2 overflow-auto">
              {deployments.length === 0 ? (
                <EmptyState icon={<Radio className="h-5 w-5" />} title="No deployments" hint="Add check URLs to start monitoring." />
              ) : (
                deployments.slice(0, 12).map((d) => (
                  <div key={d._id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-inset ring-slate-100">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-slate-800">{d.name}</p>
                      <p className="text-[10px] tabular-nums text-slate-400">
                        {d.uptimePercent !== null && d.uptimePercent !== undefined ? `${d.uptimePercent}% uptime` : "probing…"}
                        {d.lastResponseMs != null ? ` · ${d.lastResponseMs}ms` : ""}
                      </p>
                    </div>
                    <LiveBadge status={(d.status ?? "unknown") as LiveStatus} />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Row: cost + AI tool usage + software licenses */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <CircleDollarSign className="h-4 w-4 text-emerald-500" />
              <h2 className="text-sm font-semibold text-slate-900">API spend & usage</h2>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-xl bg-emerald-50/60 p-3.5 ring-1 ring-inset ring-emerald-100">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <CircleDollarSign className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-lg font-bold tabular-nums leading-tight text-slate-900">${stats.apiKeyTotals.costUsd.toFixed(2)}</p>
                  <p className="text-xs text-slate-500">total tracked spend</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl bg-blue-50/60 p-3.5 ring-1 ring-inset ring-blue-100">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <Gauge className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-lg font-bold tabular-nums leading-tight text-slate-900">{stats.apiKeyTotals.usage.toLocaleString()}</p>
                  <p className="text-xs text-slate-500">total tokens / calls tracked</p>
                </div>
              </div>
              {(stats.apiKeyTotals.expiringSoon > 0 || stats.apiKeyTotals.expiringSoftware > 0) && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
                  ⚠ {stats.apiKeyTotals.expiringSoon} API key(s) + {stats.apiKeyTotals.expiringSoftware} license(s) expire within 30 days
                </p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-violet-500" />
                <h2 className="text-sm font-semibold text-slate-900">AI tool usage</h2>
              </div>
              <Link href="/products" className="text-xs font-medium text-blue-600 hover:text-blue-700">
                View all
              </Link>
            </div>
            <div className="space-y-3.5">
              {topTools.length === 0 ? (
                <EmptyState icon={<Zap className="h-5 w-5" />} title="No AI tools yet" hint="Add AI tools to track quota usage." />
              ) : (
                topTools.map((p) => (
                  <div key={p._id}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-800">{p.name}</span>
                      <span className="text-xs tabular-nums text-slate-400">${p.costUsd.toFixed(2)}</span>
                    </div>
                    <ProgressBar usage={p.usage} quota={p.quota} />
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-amber-500" />
                <h2 className="text-sm font-semibold text-slate-900">Software licenses</h2>
              </div>
              <Link href="/products" className="text-xs font-medium text-blue-600 hover:text-blue-700">
                View all
              </Link>
            </div>
            <div className="space-y-2">
              {stats.software.length === 0 ? (
                <EmptyState icon={<ShieldCheck className="h-5 w-5" />} title="No licensed software" hint="Track Photoshop-style licenses with seats and expiry." />
              ) : (
                stats.software.map((s) => {
                  const daysLeft = s.licenseExpiresAt
                    ? Math.max(0, Math.ceil((new Date(s.licenseExpiresAt).getTime() - now) / 86400000))
                    : null;
                  return (
                    <div key={s._id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-inset ring-slate-100">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-slate-800">{s.name}</p>
                        <p className="text-[10px] text-slate-400">
                          {s.vendor || "—"} · {s.licenseSeats} seat{s.licenseSeats === 1 ? "" : "s"}
                        </p>
                      </div>
                      {daysLeft !== null ? (
                        <Badge tone={daysLeft <= 30 ? "red" : daysLeft <= 90 ? "amber" : "green"}>
                          {daysLeft} days left
                        </Badge>
                      ) : (
                        <Badge tone="slate">No expiry</Badge>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Row: recent */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Recent projects</h2>
              <Link href="/projects" className="text-xs font-medium text-blue-600 hover:text-blue-700">
                View all
              </Link>
            </div>
            {stats.recentProjects.length === 0 ? (
              <EmptyState icon={<FolderKanban className="h-5 w-5" />} title="No projects yet" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {stats.recentProjects.map((p) => (
                  <li key={p._id} className="flex items-center justify-between py-2.5">
                    <Link href={`/projects/${p._id}`} className="group flex items-center gap-1 truncate text-sm font-medium text-slate-800 hover:text-blue-600">
                      <span className="truncate">{p.name}</span>
                      <ArrowRight className="h-3 w-3 opacity-0 transition group-hover:opacity-100" />
                    </Link>
                    <Badge tone={statusTone[p.status]}>{p.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Recent products</h2>
              <Link href="/products" className="text-xs font-medium text-blue-600 hover:text-blue-700">
                View all
              </Link>
            </div>
            {stats.recentProducts.length === 0 ? (
              <EmptyState icon={<Boxes className="h-5 w-5" />} title="No products yet" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {stats.recentProducts.map((p) => (
                  <li key={p._id} className="flex items-center justify-between py-2.5">
                    <span className="truncate pr-3 text-sm font-medium text-slate-800">{p.name}</span>
                    <Badge tone="slate">{p.category === "software" ? "license" : "ai tool"}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Recent API keys</h2>
              <Link href="/apikeys" className="text-xs font-medium text-blue-600 hover:text-blue-700">
                View all
              </Link>
            </div>
            {stats.recentApiKeys.length === 0 ? (
              <EmptyState icon={<KeyRound className="h-5 w-5" />} title="No API keys yet" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {stats.recentApiKeys.map((k) => (
                  <li key={k._id} className="flex items-center justify-between py-2.5">
                    <div className="min-w-0 pr-3">
                      <p className="truncate text-sm font-medium text-slate-800">{k.name}</p>
                      <p className="font-mono text-[11px] text-slate-400">{k.keyMasked}</p>
                    </div>
                    <span className="shrink-0 text-sm font-medium tabular-nums text-slate-600">${k.costUsd.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* bottom hint */}
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white/60 px-4 py-3 text-xs text-slate-500">
          <LayoutDashboard className="h-4 w-4 shrink-0 text-slate-400" />
          Visitor numbers are estimates from session tracking. Embed the tracking snippet in your sites to count real visits — the project page has a “Tracking code” button.
        </div>
      </div>
    </Layout>
  );
}

export default DashboardPage;
