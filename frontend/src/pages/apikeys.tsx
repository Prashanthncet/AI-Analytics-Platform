"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { KeyRound, Pencil, Plus, Search, Trash2 } from "lucide-react";
import Layout from "@/components/Layout";
import { Badge, Button, EmptyState, Field, Input, Modal, Select, Spinner } from "@/components/ui";
import ConfirmDialog from "@/components/ConfirmDialog";
import { http } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import type { ApiKey, ApiKeyProvider, ApiKeyStatus } from "@/lib/types";

const PROVIDERS: ApiKeyProvider[] = ["openai", "anthropic", "google", "azure", "other"];
const KEY_STATUSES: ApiKeyStatus[] = ["active", "expired", "revoked"];

const providerLabel: Record<ApiKeyProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  azure: "Azure",
  other: "Other",
};

const providerTone: Record<ApiKeyProvider, "green" | "violet" | "blue" | "slate"> = {
  openai: "green",
  anthropic: "violet",
  google: "blue",
  azure: "blue",
  other: "slate",
};

const statusTone: Record<ApiKeyStatus, "green" | "amber" | "red"> = {
  active: "green",
  expired: "amber",
  revoked: "red",
};

interface KeyForm {
  name: string;
  provider: ApiKeyProvider;
  key: string;
  quota: string;
  usage: string;
  costUsd: string;
  expiresAt: string;
}

const emptyForm: KeyForm = {
  name: "",
  provider: "openai",
  key: "",
  quota: "",
  usage: "0",
  costUsd: "0",
  expiresAt: "",
};

function KeyModal({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: ApiKey | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<KeyForm>(() =>
    initial
      ? {
          name: initial.name,
          provider: initial.provider,
          key: "",
          quota: initial.quota > 0 ? String(initial.quota) : "",
          usage: String(initial.usage),
          costUsd: String(initial.costUsd),
          expiresAt: initial.expiresAt ? initial.expiresAt.slice(0, 10) : "",
        }
      : emptyForm
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof KeyForm>(key: K, value: KeyForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        provider: form.provider,
        quota: form.quota === "" ? 0 : Number(form.quota),
        usage: Number(form.usage) || 0,
        costUsd: Number(form.costUsd) || 0,
        ...(form.expiresAt ? { expiresAt: form.expiresAt } : {}),
      };
      if (!initial) {
        payload.key = form.key;
      } else if (form.key.trim()) {
        payload.key = form.key.trim();
      }
      if (initial) {
        await http.patch(`/api/apikeys/${initial._id}`, payload);
      } else {
        await http.post("/api/apikeys", payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save API key");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} title={initial ? "Edit API key" : "Add API key"} onClose={onClose} wide>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input
              required
              placeholder="e.g. Production GPT-4o"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>
          <Field label="Provider">
            <Select
              value={form.provider}
              onChange={(e) => set("provider", e.target.value as ApiKeyProvider)}
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {providerLabel[p]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label={initial ? "New key (optional — leave blank to keep current)" : "API key"}>
          <Input
            required={!initial}
            type="password"
            autoComplete="off"
            placeholder={initial ? "••••••••••••" : "sk-…"}
            value={form.key}
            onChange={(e) => set("key", e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Quota (0 = unlimited)">
            <Input
              type="number"
              min={0}
              placeholder="1000000"
              value={form.quota}
              onChange={(e) => set("quota", e.target.value)}
            />
          </Field>
          <Field label="Usage">
            <Input
              type="number"
              min={0}
              value={form.usage}
              onChange={(e) => set("usage", e.target.value)}
            />
          </Field>
          <Field label="Cost (USD)">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.costUsd}
              onChange={(e) => set("costUsd", e.target.value)}
            />
          </Field>
        </div>

        <Field label="Expires at">
          <Input type="date" value={form.expiresAt} onChange={(e) => set("expiresAt", e.target.value)} />
        </Field>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-600/20">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {initial ? "Save changes" : "Add key"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function UsageBar({ keyItem }: { keyItem: ApiKey }) {
  if (keyItem.quota <= 0) {
    return <span className="text-xs text-slate-400">unlimited</span>;
  }
  const pct = Math.min(100, Math.round((keyItem.usage / keyItem.quota) * 100));
  const color = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-slate-500">
        {keyItem.usage.toLocaleString()}/{keyItem.quota.toLocaleString()}
      </span>
    </div>
  );
}

function ApiKeysPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (filter !== "all") params.set("status", filter);
    Promise.resolve()
      .then(() => {
        if (cancelled) return;
        setLoading(true);
        setError(null);
        return http.get<ApiKey[]>(`/api/apikeys?${params.toString()}`);
      })
      .then((data) => {
        if (cancelled || !data) return;
        const q = search.trim().toLowerCase();
        setKeys(q ? data.filter((k) => k.name.toLowerCase().includes(q)) : data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load API keys");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, filter, search, refreshKey]);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalSession, setModalSession] = useState(0);
  const [editing, setEditing] = useState<ApiKey | null>(null);
  const [deleting, setDeleting] = useState<ApiKey | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setModalSession((s) => s + 1);
    setModalOpen(true);
  };
  const openEdit = (k: ApiKey) => {
    setEditing(k);
    setModalSession((s) => s + 1);
    setModalOpen(true);
  };

  const toggleRevoke = async (k: ApiKey) => {
    try {
      await http.patch(`/api/apikeys/${k._id}`, {
        status: k.status === "revoked" ? "active" : "revoked",
      });
      refresh();
    } catch {
      /* silently ignore */
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await http.delete(`/api/apikeys/${deleting._id}`);
      setDeleting(null);
      refresh();
    } catch {
      setDeleting(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <Layout
      title="API Keys"
      subtitle={isAdmin ? "All keys across the organization" : "Your API keys"}
      actions={
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Add key
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Search keys…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["all", ...KEY_STATUSES].map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize transition ${
                  filter === s
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-600/20">
            {error}
          </p>
        )}

        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <Spinner className="h-6 w-6" />
          </div>
        ) : keys.length === 0 ? (
          <EmptyState
            icon={<KeyRound className="h-5 w-5" />}
            title={search || filter !== "all" ? "No matching API keys" : "No API keys yet"}
            hint={
              search || filter !== "all"
                ? "Try adjusting your search or filters."
                : "Track provider keys, quotas, usage and spend. Keys are encrypted at rest and never shown in full."
            }
            action={
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" /> Add key
              </Button>
            }
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-3 font-semibold">Key</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">Usage / Remaining</th>
                    <th className="hidden px-5 py-3 font-semibold sm:table-cell">Cost</th>
                    <th className="hidden px-5 py-3 font-semibold md:table-cell">Expires</th>
                    <th className="px-5 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {keys.map((k) => (
                    <tr key={k._id} className="transition hover:bg-slate-50/60">
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-slate-900">{k.name}</p>
                        <div className="mt-0.5 flex items-center gap-2">
                          <Badge tone={providerTone[k.provider]}>{providerLabel[k.provider]}</Badge>
                          <span className="font-mono text-[11px] text-slate-400">{k.keyMasked}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge tone={statusTone[k.status]}>{k.status}</Badge>
                      </td>
                      <td className="px-5 py-3.5">
                        <UsageBar keyItem={k} />
                      </td>
                      <td className="hidden whitespace-nowrap px-5 py-3.5 tabular-nums text-slate-700 sm:table-cell">
                        ${k.costUsd.toFixed(2)}
                      </td>
                      <td className="hidden whitespace-nowrap px-5 py-3.5 text-xs text-slate-500 md:table-cell">
                        {k.expiresAt ? k.expiresAt.slice(0, 10) : "Never"}
                      </td>
                      {isAdmin && (
                        <td className="hidden px-5 py-3.5 text-xs text-slate-500 lg:table-cell">
                          {typeof k.owner === "object" && k.owner ? k.owner.name : "—"}
                        </td>
                      )}
                      <td className="px-5 py-3.5">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => toggleRevoke(k)}
                            title={k.status === "revoked" ? "Reactivate" : "Revoke"}
                            className={`rounded-lg px-2 py-1.5 text-xs font-medium transition ${
                              k.status === "revoked"
                                ? "text-emerald-600 hover:bg-emerald-50"
                                : "text-amber-600 hover:bg-amber-50"
                            }`}
                          >
                            {k.status === "revoked" ? "Reactivate" : "Revoke"}
                          </button>
                          <button
                            onClick={() => openEdit(k)}
                            title="Edit"
                            className="rounded-lg p-2 text-slate-400 transition hover:bg-blue-50 hover:text-blue-600"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setDeleting(k)}
                            title="Delete"
                            className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <KeyModal
        key={modalSession}
        open={modalOpen}
        initial={editing}
        onClose={() => setModalOpen(false)}
        onSaved={refresh}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="Delete API key"
        message={deleting ? `Delete "${deleting.name}"? This cannot be undone.` : ""}
        loading={deleteLoading}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </Layout>
  );
}

export default ApiKeysPage;
