"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { FolderKanban, Pencil, Plus, Search, Trash2 } from "lucide-react";
import Layout from "@/components/Layout";
import { Badge, Button, EmptyState, Field, Input, Modal, Select, Spinner, Textarea } from "@/components/ui";
import ConfirmDialog from "@/components/ConfirmDialog";
import { http } from "@/lib/api";
import { useResourceList } from "@/lib/useResourceList";
import { useAuth } from "@/context/AuthContext";
import type { Project, ProjectStatus } from "@/lib/types";

const STATUSES: ProjectStatus[] = ["active", "on_hold", "completed", "archived"];

const statusTone: Record<ProjectStatus, "blue" | "green" | "amber" | "red"> = {
  active: "green",
  on_hold: "amber",
  completed: "blue",
  archived: "red",
};

interface ProjectForm {
  name: string;
  description: string;
  status: ProjectStatus;
  startDate: string;
  endDate: string;
}

const emptyForm: ProjectForm = { name: "", description: "", status: "active", startDate: "", endDate: "" };

function ProjectModal({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: Project | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ProjectForm>(() =>
    initial
      ? {
          name: initial.name,
          description: initial.description,
          status: initial.status,
          startDate: initial.startDate ? initial.startDate.slice(0, 10) : "",
          endDate: initial.endDate ? initial.endDate.slice(0, 10) : "",
        }
      : emptyForm
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof ProjectForm>(key: K, value: ProjectForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        description: form.description,
        status: form.status,
        ...(form.startDate ? { startDate: form.startDate } : {}),
        ...(form.endDate ? { endDate: form.endDate } : {}),
      };
      if (initial) {
        await http.patch(`/api/projects/${initial._id}`, payload);
      } else {
        await http.post("/api/projects", payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save project");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} title={initial ? "Edit project" : "New project"} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Name">
          <Input
            required
            placeholder="e.g. Customer portal rebuild"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </Field>
        <Field label="Description">
          <Textarea
            placeholder="What is this project about?"
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Status">
            <Select value={form.status} onChange={(e) => set("status", e.target.value as ProjectStatus)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date">
            <Input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
          </Field>
          <Field label="End date">
            <Input type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} />
          </Field>
        </div>
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
            {initial ? "Save changes" : "Create project"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ProjectsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const { items, loading, error, search, setSearch, status, setStatus, refresh } =
    useResourceList<Project>("/api/projects");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalSession, setModalSession] = useState(0);
  const [editing, setEditing] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setModalSession((s) => s + 1);
    setModalOpen(true);
  };
  const openEdit = (p: Project) => {
    setEditing(p);
    setModalSession((s) => s + 1);
    setModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await http.delete(`/api/projects/${deleting._id}`);
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
      title="Projects"
      subtitle={`${items.length} project${items.length === 1 ? "" : "s"} in view`}
      actions=          {isAdmin ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> New project
            </Button>
          ) : undefined}
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Search projects…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["all", ...STATUSES].map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize transition ${
                  status === s
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
                }`}
              >
                {s.replace("_", " ")}
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
        ) : items.length === 0 ? (
          <EmptyState
            icon={<FolderKanban className="h-5 w-5" />}
            title={search || status !== "all" ? "No matching projects" : "No projects yet"}
            hint={
              search || status !== "all"
                ? "Try adjusting your search or filters."
                : "Create your first project to start tracking organizational work."
            }
            action={
              isAdmin ? (
                <Button onClick={openCreate}>
                  <Plus className="h-4 w-4" /> New project
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
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="hidden px-5 py-3 font-semibold md:table-cell">Dates</th>
                    <th className="hidden px-5 py-3 font-semibold lg:table-cell">Owner</th>
                    <th className="px-5 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((p) => (
                    <tr key={p._id} className="transition hover:bg-slate-50/60">
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/projects/${p._id}`}
                          className="font-medium text-slate-900 transition hover:text-blue-600"
                        >
                          {p.name}
                        </Link>
                        {p.description && (
                          <p className="mt-0.5 line-clamp-1 max-w-md text-xs text-slate-500">
                            {p.description}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge tone={statusTone[p.status]}>{p.status.replace("_", " ")}</Badge>
                      </td>
                      <td className="hidden whitespace-nowrap px-5 py-3.5 text-xs text-slate-500 md:table-cell">
                        {p.startDate ? p.startDate.slice(0, 10) : "—"}
                        {p.endDate ? ` → ${p.endDate.slice(0, 10)}` : ""}
                      </td>
                      <td className="hidden px-5 py-3.5 text-xs text-slate-500 lg:table-cell">
                        {p.owner ? p.owner.name : "—"}
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
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <ProjectModal
        key={modalSession}
        open={modalOpen}
        initial={editing}
        onClose={() => setModalOpen(false)}
        onSaved={refresh}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="Delete project"
        message={
          deleting
            ? `Are you sure you want to delete "${deleting.name}"? This cannot be undone.`
            : ""
        }
        loading={deleteLoading}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </Layout>
  );
}

export default ProjectsPage;
