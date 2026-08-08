"use client";

import { useState, type FormEvent } from "react";
import { Boxes, CalendarClock, KeyRound, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import Layout from "@/components/Layout";
import { Badge, Button, EmptyState, Field, Input, Modal, ProgressBar, Select, Spinner, Textarea } from "@/components/ui";
import ConfirmDialog from "@/components/ConfirmDialog";
import { http } from "@/lib/api";
import { useResourceList } from "@/lib/useResourceList";
import { useAuth } from "@/context/AuthContext";
import type { Product, ProductCategory, ProductStatus, ProductType } from "@/lib/types";

const TYPES: ProductType[] = ["web", "mobile", "desktop"];
const CATEGORIES: ProductCategory[] = ["ai_tool", "software"];
const STATUSES: ProductStatus[] = ["active", "trial", "deprecated"];

const typeTone: Record<ProductType, "blue" | "violet" | "slate"> = {
  web: "blue",
  mobile: "violet",
  desktop: "slate",
};
const statusTone: Record<ProductStatus, "green" | "amber" | "red"> = {
  active: "green",
  trial: "amber",
  deprecated: "red",
};

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function fmtExpiry(value: string | null | undefined): { text: string; tone: "red" | "amber" | "slate" } {
  if (!value) return { text: "—", tone: "slate" };
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return { text: "—", tone: "slate" };
  const days = Math.ceil((d.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { text: `Expired ${fmtDate(value)}`, tone: "red" };
  if (days <= 60) return { text: `${fmtDate(value)} · ${days}d left`, tone: "amber" };
  return { text: fmtDate(value), tone: "slate" };
}

interface ProductForm {
  name: string;
  description: string;
  vendor: string;
  type: ProductType;
  category: ProductCategory;
  status: ProductStatus;
  quota: string;
  usage: string;
  costUsd: string;
  licenseKey: string;
  licenseSeats: string;
  licenseExpiresAt: string;
}

const emptyForm: ProductForm = {
  name: "",
  description: "",
  vendor: "",
  type: "web",
  category: "ai_tool",
  status: "active",
  quota: "0",
  usage: "0",
  costUsd: "0",
  licenseKey: "",
  licenseSeats: "1",
  licenseExpiresAt: "",
};

function ProductModal({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: Product | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ProductForm>(() =>
    initial
      ? {
          name: initial.name,
          description: initial.description,
          vendor: initial.vendor,
          type: initial.type,
          category: initial.category,
          status: initial.status,
          quota: String(initial.quota ?? 0),
          usage: String(initial.usage ?? 0),
          costUsd: String(initial.costUsd ?? 0),
          licenseKey: "",
          licenseSeats: String(initial.licenseSeats ?? 1),
          licenseExpiresAt: initial.licenseExpiresAt
            ? initial.licenseExpiresAt.slice(0, 10)
            : "",
        }
      : emptyForm
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof ProductForm>(key: K, value: ProductForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const isSoftware = form.category === "software";

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        description: form.description,
        vendor: form.vendor,
        type: form.type,
        category: form.category,
        status: form.status,
      };
      if (isSoftware) {
        payload.licenseKey = form.licenseKey || undefined;
        payload.licenseSeats = Number(form.licenseSeats) || 1;
        payload.licenseExpiresAt = form.licenseExpiresAt || null;
      } else {
        payload.quota = Number(form.quota) || 0;
        payload.usage = Number(form.usage) || 0;
        payload.costUsd = Number(form.costUsd) || 0;
      }
      if (initial) {
        await http.patch(`/api/products/${initial._id}`, payload);
      } else {
        await http.post("/api/products", payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save product");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} title={initial ? "Edit product" : "New product"} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Name">
          <Input
            required
            placeholder="e.g. OpenAI GPT-4o or Adobe Photoshop CC"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Vendor">
            <Input
              placeholder="e.g. OpenAI / Adobe"
              value={form.vendor}
              onChange={(e) => set("vendor", e.target.value)}
            />
          </Field>
          <Field label="Category">
            <Select
              value={form.category}
              onChange={(e) => set("category", e.target.value as ProductCategory)}
            >
              <option value="ai_tool">AI Tool</option>
              <option value="software">Licensed Software</option>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Platform">
            <Select value={form.type} onChange={(e) => set("type", e.target.value as ProductType)}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => set("status", e.target.value as ProductStatus)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Description">
          <Textarea
            placeholder="What does this product do?"
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>

        {isSoftware ? (
          <div className="grid grid-cols-2 gap-3 rounded-xl bg-violet-50/60 p-3 ring-1 ring-inset ring-violet-200/60">
            <Field label="License key">
              <Input
                placeholder={initial?.licenseKeyMasked ? `Current: ${initial.licenseKeyMasked}` : "e.g. PSD-XXXX-XXXX"}
                value={form.licenseKey}
                onChange={(e) => set("licenseKey", e.target.value)}
              />
            </Field>
            <Field label="Seats">
              <Input
                type="number"
                min={1}
                value={form.licenseSeats}
                onChange={(e) => set("licenseSeats", e.target.value)}
              />
            </Field>
            <Field label="License expires">
              <Input
                type="date"
                value={form.licenseExpiresAt}
                onChange={(e) => set("licenseExpiresAt", e.target.value)}
              />
            </Field>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 rounded-xl bg-blue-50/60 p-3 ring-1 ring-inset ring-blue-200/60">
            <Field label="Quota (requests)">
              <Input
                type="number"
                min={0}
                placeholder="0 = unlimited"
                value={form.quota}
                onChange={(e) => set("quota", e.target.value)}
              />
            </Field>
            <Field label="Used">
              <Input
                type="number"
                min={0}
                value={form.usage}
                onChange={(e) => set("usage", e.target.value)}
              />
            </Field>
            <Field label="Monthly cost ($)">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.costUsd}
                onChange={(e) => set("costUsd", e.target.value)}
              />
            </Field>
          </div>
        )}

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
            {initial ? "Save changes" : "Create product"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function FilterTabs<T extends string>({
  options,
  value,
  onChange,
  labels,
}: {
  options: (T | "all")[];
  value: string;
  onChange: (v: string) => void;
  labels?: Record<string, string>;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
            value === o
              ? "bg-slate-900 text-white"
              : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
          }`}
        >
          {labels?.[o] ?? (o === "all" ? "All" : o.replace("_", " "))}
        </button>
      ))}
    </div>
  );
}

function ProductsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [category, setCategory] = useState("all");
  const [type, setType] = useState("all");

  const { items, loading, error, search, setSearch, refresh } = useResourceList<Product>(
    "/api/products",
    { category: category === "all" ? undefined : category, type: type === "all" ? undefined : type }
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [modalSession, setModalSession] = useState(0);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setModalSession((s) => s + 1);
    setModalOpen(true);
  };
  const openEdit = (p: Product) => {
    setEditing(p);
    setModalSession((s) => s + 1);
    setModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await http.delete(`/api/products/${deleting._id}`);
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
      title="Products"
      subtitle={`${items.length} product${items.length === 1 ? "" : "s"} in view`}
      actions={
        isAdmin ? (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> New product
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Search products, tools or vendors…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <FilterTabs options={["all", ...CATEGORIES]} value={category} onChange={setCategory} labels={{ ai_tool: "AI Tools", software: "Licensed Software" }} />
            <span className="hidden h-5 w-px bg-slate-200 sm:block" />
            <FilterTabs options={["all", ...TYPES]} value={type} onChange={setType} />
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
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Boxes className="h-5 w-5" />}
            title={search || category !== "all" || type !== "all" ? "No matching products" : "No products yet"}
            hint={
              search || category !== "all" || type !== "all"
                ? "Try adjusting your search or filters."
                : "Add the AI tools and licensed software your organization uses."
            }
            action={
              isAdmin ? (
                <Button onClick={openCreate}>
                  <Plus className="h-4 w-4" /> New product
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-3 font-semibold">Name</th>
                    <th className="px-5 py-3 font-semibold">Platform</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">{category === "software" ? "License" : category === "ai_tool" ? "Usage" : "Usage / License"}</th>
                    <th className="hidden px-5 py-3 font-semibold md:table-cell">Vendor</th>
                    <th className="px-5 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((p) => {
                    const expiry = fmtExpiry(p.licenseExpiresAt);
                    const isSoft = p.category === "software";
                    return (
                      <tr key={p._id} className="transition hover:bg-slate-50/60">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-slate-900">{p.name}</p>
                            <Badge tone={isSoft ? "violet" : "blue"}>
                              {isSoft ? "Software" : "AI Tool"}
                            </Badge>
                          </div>
                          {p.description && (
                            <p className="mt-0.5 line-clamp-1 max-w-md text-xs text-slate-500">
                              {p.description}
                            </p>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <Badge tone={typeTone[p.type]}>{p.type}</Badge>
                        </td>
                        <td className="px-5 py-3.5">
                          <Badge tone={statusTone[p.status]}>{p.status}</Badge>
                        </td>
                        <td className="px-5 py-3.5">
                          {isSoft ? (
                            <div className="flex max-w-[240px] flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                              <span className="inline-flex items-center gap-1">
                                <Users className="h-3.5 w-3.5 text-slate-400" />
                                {p.licenseSeats ?? 1} seats
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <KeyRound className="h-3.5 w-3.5 text-slate-400" />
                                {p.licenseKeyMasked || "—"}
                              </span>
                              <span
                                className={`inline-flex items-center gap-1 ${
                                  expiry.tone === "red"
                                    ? "text-red-600"
                                    : expiry.tone === "amber"
                                      ? "text-amber-600"
                                      : "text-slate-500"
                                }`}
                              >
                                <CalendarClock className="h-3.5 w-3.5" />
                                {expiry.text}
                              </span>
                            </div>
                          ) : (
                            <div className="max-w-[220px]">
                              <ProgressBar usage={p.usage} quota={p.quota} />
                              {p.costUsd > 0 && (
                                <p className="mt-0.5 text-[11px] text-slate-400">
                                  ${Number(p.costUsd).toFixed(2)}/mo
                                </p>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="hidden px-5 py-3.5 text-xs text-slate-500 md:table-cell">
                          {p.vendor || "—"}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex justify-end gap-1">
                            {isAdmin && (
                              <>
                                <button
                                  onClick={() => openEdit(p)}
                                  title="Edit"
                                  className="rounded-lg p-2 text-slate-400 transition hover:bg-blue-50 hover:text-blue-600"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => setDeleting(p)}
                                  title="Delete"
                                  className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <ProductModal
        key={modalSession}
        open={modalOpen}
        initial={editing}
        onClose={() => setModalOpen(false)}
        onSaved={refresh}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="Delete product"
        message={deleting ? `Are you sure you want to delete "${deleting.name}"? This cannot be undone.` : ""}
        loading={deleteLoading}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </Layout>
  );
}

export default ProductsPage;
