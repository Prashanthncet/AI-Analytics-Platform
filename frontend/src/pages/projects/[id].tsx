"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { ArrowLeft, Check, Code2, Copy, Download, ExternalLink, Plus, Zap } from "lucide-react";
import Layout from "@/components/Layout";
import { Badge, Button, EmptyState, LiveBadge, Modal, Spinner, Field, Input, Select } from "@/components/ui";
import { LineChart } from "@/components/Chart";
import { http, downloadFile } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import type {
  Project,
  Deployment,
  DeploymentStatus,
  DeploymentKind,
  DeploymentTargetType,
  VisitorSummary,
} from "@/lib/types";

const statusTone: Record<string, "blue" | "green" | "amber" | "red"> = {
  active: "green",
  on_hold: "amber",
  completed: "blue",
  archived: "red",
};

function ProjectDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [project, setProject] = useState<Project | null>(null);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [visitors, setVisitors] = useState<VisitorSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tracking snippet modal
  const [trackModal, setTrackModal] = useState(false);
  const [copied, setCopied] = useState(false);

  // Deployment modal
  const [depModal, setDepModal] = useState(false);
  const [depForm, setDepForm] = useState({
    name: "",
    targetType: "project" as DeploymentTargetType,
    kind: "web" as DeploymentKind,
    displayUrl: "",
    checkUrl: "",
  });
  const [depSaving, setDepSaving] = useState(false);

  useEffect(() => {
    if (!id || typeof id !== "string") return;
    let cancelled = false;

    const load = async (initial = false) => {
      if (initial) setLoading(true);
      setError(null);
      try {
        const [proj, deps, vis] = await Promise.all([
          http.get<Project>(`/api/projects/${id}`),
          http.get<Deployment[]>(`/api/deployments?targetType=project&targetId=${id}`),
          http.get<VisitorSummary>(`/api/visitors/project/${id}?days=30`),
        ]);
        if (cancelled) return;
        setProject(proj);
        setDeployments(Array.isArray(deps) ? deps : []);
        setVisitors(vis);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load project");
      } finally {
        if (!cancelled && initial) setLoading(false);
      }
    };

    load(true);
    // Live monitoring: refresh deployment status every 30s so LIVE/OFFLINE stays current.
    const poll = setInterval(() => void load(), 30_000);
    return () => { cancelled = true; clearInterval(poll); };
  }, [id]);

  const createDeployment = async () => {
    setDepSaving(true);
    try {
      const dep = await http.post<Deployment>("/api/deployments", {
        ...depForm,
        targetId: id,
      });
      setDeployments((prev) => [dep, ...prev]);
      setDepModal(false);
      setDepForm({ name: "", targetType: "project", kind: "web", displayUrl: "", checkUrl: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create deployment");
    } finally {
      setDepSaving(false);
    }
  };

  const downloadReport = async (format: "pdf" | "csv") => {
    try {
      await downloadFile(`/api/reports/project/${id}?format=${format}`, `report-${id?.toString().slice(-6)}.${format}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download report");
    }
  };

  const trackingSnippet =
    `<script src="${typeof window !== "undefined" ? window.location.origin : ""}/t.js" data-site="${id ?? ""}" data-site-type="project"></script>`;

  const copySnippet = async () => {
    try {
      await navigator.clipboard.writeText(trackingSnippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  if (loading) {
    return (
      <Layout title="Project">
        <div className="flex h-64 items-center justify-center">
          <Spinner className="h-7 w-7" />
        </div>
      </Layout>
    );
  }

  if (error || !project) {
    return (
      <Layout title="Project">
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-600/20">
          {error || "Project not found"}
        </p>
      </Layout>
    );
  }

  const visitorSeries = visitors?.series ?? [];
  const visTotal = visitors?.totals;

  return (
    <Layout
      title={project.name}
      subtitle={project.description || project.status.replace("_", " ")}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setTrackModal(true)}>
            <Code2 className="h-4 w-4" /> Tracking code
          </Button>
          <Button variant="secondary" onClick={() => router.push("/projects")}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          {isAdmin && (
            <>
              <Button variant="secondary" onClick={() => downloadReport("pdf")}>
                <Download className="h-4 w-4" /> PDF
              </Button>
              <Button variant="secondary" onClick={() => downloadReport("csv")}>
                <Download className="h-4 w-4" /> CSV
              </Button>
            </>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        {/* Project meta */}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <Badge tone={statusTone[project.status]}>{project.status.replace("_", " ")}</Badge>
          {project.startDate && (
            <span className="text-xs text-slate-500">
              Started {new Date(project.startDate).toLocaleDateString()}
            </span>
          )}
          {project.endDate && (
            <span className="text-xs text-slate-500">
              · Ended {new Date(project.endDate).toLocaleDateString()}
            </span>
          )}
        </div>

        {/* Deployments */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              Deployments ({deployments.length})
            </h2>
            {isAdmin && (
              <Button onClick={() => setDepModal(true)}>
                <Plus className="h-4 w-4" /> Add deployment
              </Button>
            )}
          </div>

          {deployments.length === 0 ? (
            <EmptyState
              icon={<Zap className="h-5 w-5" />}
              title="No deployments"
              hint="Add a deployment to monitor its live status and uptime."
            />
          ) : (
            <div className="divide-y divide-slate-100">
              {deployments.map((d) => (
                <div key={d._id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900">{d.name}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <Badge tone="slate">{d.kind}</Badge>
                      {d.displayUrl && (
                        <a href={d.displayUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline">
                          {d.displayUrl} <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {d.lastResponseMs !== null && (
                        <span>{d.lastResponseMs}ms</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    {d.uptimePercent !== null && (
                      <div className="text-right">
                        <p className="text-sm font-semibold tabular-nums text-slate-900">
                          {d.uptimePercent}%
                        </p>
                        <p className="text-[10px] text-slate-400">uptime</p>
                      </div>
                    )}
                    <LiveBadge status={d.status as DeploymentStatus} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Visitor analytics */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Visitor analytics</h2>
          {visTotal && (
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                { label: "Today", pv: visTotal.today.pageviews, vis: visTotal.today.visitors },
                { label: "This week", pv: visTotal.thisWeek.pageviews, vis: visTotal.thisWeek.visitors },
                { label: "This month", pv: visTotal.thisMonth.pageviews, vis: visTotal.thisMonth.visitors },
                { label: "This year", pv: visTotal.thisYear.pageviews, vis: visTotal.thisYear.visitors },
                { label: "All time", pv: visTotal.allTime.pageviews, vis: visTotal.allTime.visitors },
              ].map((s) => (
                <div key={s.label} className="rounded-xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-200">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                    {s.label}
                  </p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">{s.vis}</p>
                  <p className="text-[11px] tabular-nums text-slate-400">{s.pv} pageviews</p>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium text-slate-500">Visitors (daily, 30 days)</p>
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-2">
                <LineChart
                  data={visitorSeries.map((s) => ({ date: s.date, value: s.visitors }))}
                  name="Visitors"
                  color="#8b5cf6"
                />
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-500">Pageviews (daily, 30 days)</p>
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-2">
                <LineChart
                  data={visitorSeries.map((s) => ({ date: s.date, value: s.pageviews }))}
                  name="Pageviews"
                  color="#3b82f6"
                />
              </div>
            </div>
          </div>

          {visitors && visitors.topPages.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium text-slate-500">Top pages (30 days)</p>
              <div className="overflow-hidden rounded-xl border border-slate-100">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2 font-semibold">Page</th>
                      <th className="px-3 py-2 text-right font-semibold">Pageviews</th>
                      <th className="px-3 py-2 text-right font-semibold">Visitors</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visitors.topPages.map((p) => (
                      <tr key={p.page} className="hover:bg-slate-50/60">
                        <td className="px-3 py-2 font-mono text-slate-700">{p.page}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-600">{p.pageviews}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-600">{p.visitors}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tracking code modal */}
      <Modal open={trackModal} title="Tracking code" onClose={() => setTrackModal(false)}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Paste this one line into <strong>{project.name}</strong> before the closing{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">&lt;/body&gt;</code> tag (or the
            head of your app shell). Every page load is counted as a pageview.
          </p>
          <pre className="overflow-x-auto rounded-xl bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
            <code>{trackingSnippet}</code>
          </pre>
          <p className="text-xs text-slate-400">
            Visitors are estimated from session tracking — no cookies, no cross-site identity.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setTrackModal(false)}>
              Close
            </Button>
            <Button onClick={() => void copySnippet()}>
              {copied ? (
                <>
                  <Check className="h-4 w-4" /> Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" /> Copy snippet
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add deployment modal */}
      <Modal open={depModal} title="Add deployment" onClose={() => setDepModal(false)}>
        <div className="space-y-4">
          <Field label="Name">
            <Input
              required
              placeholder="e.g. Production web"
              value={depForm.name}
              onChange={(e) => setDepForm((f) => ({ ...f, name: e.target.value }))}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select
                value={depForm.kind}
                onChange={(e) => setDepForm((f) => ({ ...f, kind: e.target.value as DeploymentKind }))}
              >
                <option value="web">Web</option>
                <option value="app">App</option>
                <option value="desktop">Desktop</option>
                <option value="api">API</option>
              </Select>
            </Field>
          </div>
          <Field label="Display URL">
            <Input
              placeholder="https://example.com"
              value={depForm.displayUrl}
              onChange={(e) => setDepForm((f) => ({ ...f, displayUrl: e.target.value }))}
            />
          </Field>
          <Field label="Check URL (the monitor will probe this endpoint)">
            <Input
              placeholder="https://example.com/health"
              value={depForm.checkUrl}
              onChange={(e) => setDepForm((f) => ({ ...f, checkUrl: e.target.value }))}
            />
          </Field>
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setDepModal(false)}>
              Cancel
            </Button>
            <Button loading={depSaving} onClick={createDeployment}>
              Add deployment
            </Button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
}

export default ProjectDetailPage;