"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  Check,
  Copy,
  Pencil,
  Plus,
  Tags as TagsIcon,
  Trash2,
  X,
} from "lucide-react";

type TagRow = {
  id: number;
  name: string;
  slug: string;
  createdAt: string;
};

type ApiPayload = { tags: TagRow[]; role: string };

export default function TagsHub() {
  const params = useParams<{ tenantId: string }>();
  const tenantId = params.tenantId;
  const api = `/api/t/${tenantId}/tags`;
  const t = useTranslations("app.tags");
  const tNav = useTranslations("app.nav");

  const [tags, setTags] = useState<TagRow[]>([]);
  const [readOnly, setReadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [copiedTagId, setCopiedTagId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(api);
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const j = (await res.json()) as ApiPayload;
    setTags(j.tags);
    setReadOnly(j.role === "support");
    setLoading(false);
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createTag(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    setErr(null);
    const n = name.trim();
    if (!n) return;
    setCreateBusy(true);
    const res = await fetch(api, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: n }),
    });
    setCreateBusy(false);
    if (!res.ok) {
      const j = (await res.json()) as { error?: string };
      setErr(j.error ?? t("createError"));
      return;
    }
    setName("");
    await load();
  }

  function startEdit(row: TagRow) {
    setEditingId(row.id);
    setEditName(row.name);
    setErr(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId || readOnly) return;
    const n = editName.trim();
    if (!n) return;
    setSaveBusy(true);
    setErr(null);
    const res = await fetch(`${api}/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: n }),
    });
    setSaveBusy(false);
    if (!res.ok) {
      const j = (await res.json()) as { error?: string };
      setErr(j.error ?? t("saveError"));
      return;
    }
    cancelEdit();
    await load();
  }

  async function confirmDelete() {
    if (!deleteId || readOnly) return;
    setDeleteBusy(true);
    const res = await fetch(`${api}/${deleteId}`, { method: "DELETE" });
    setDeleteBusy(false);
    if (!res.ok) return;
    setDeleteId(null);
    await load();
  }

  async function copyTagId(id: number) {
    try {
      await navigator.clipboard.writeText(String(id));
      setCopiedTagId(id);
      window.setTimeout(() => {
        setCopiedTagId((cur) => (cur === id ? null : cur));
      }, 2000);
    } catch {
      /* clipboard pode falhar fora de HTTPS ou sem permissão */
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center rounded-2xl border border-dashed border-border">
        <p className="text-sm text-fg-muted">{t("loading")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      <header className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-md">
        <div
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{
            backgroundImage: `
              linear-gradient(125deg, rgb(16 185 129 / 0.1) 0%, transparent 42%),
              linear-gradient(300deg, rgb(79 70 229 / 0.06) 0%, transparent 45%)
            `,
          }}
        />
        <div className="relative flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="flex gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg">
              <TagsIcon className="h-7 w-7" strokeWidth={1.5} aria-hidden />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">
                {t("title")}
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-fg-secondary">
                {t("subtitle")}
              </p>
              <p className="mt-2 text-xs text-fg-muted">
                <Link
                  href={`/${tenantId}/contacts`}
                  className="text-primary-600 underline-offset-2 hover:underline"
                >
                  ← {tNav("contacts")}
                </Link>
              </p>
            </div>
          </div>
        </div>
      </header>

      {!readOnly ? (
        <form
          onSubmit={(e) => void createTag(e)}
          className="ds-card flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:p-6"
        >
          <label className="ds-label flex-1">
            {t("newName")}
            <input
              className="ds-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("newPlaceholder")}
              autoComplete="off"
            />
          </label>
          <button
            type="submit"
            className="ds-btn-primary inline-flex shrink-0 items-center gap-2"
            disabled={createBusy || !name.trim()}
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            {createBusy ? t("saving") : t("create")}
          </button>
        </form>
      ) : null}

      {err ? (
        <p className="text-sm text-danger" role="alert">
          {err}
        </p>
      ) : null}

      <div className="hidden lg:block">
        <div className="ds-table-wrap">
          <table className="ds-table min-w-[640px] w-full">
            <thead>
              <tr>
                <th>{t("colName")}</th>
                <th className="hidden lg:table-cell">{t("colId")}</th>
                <th className="text-right">{t("colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {tags.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-10 text-center text-sm text-fg-muted">
                    {t("empty")}
                  </td>
                </tr>
              ) : (
                tags.map((row) => (
                  <tr key={row.id}>
                    <td className="font-medium text-fg">
                      {editingId === row.id ? (
                        <form
                          className="flex flex-wrap items-center gap-2"
                          onSubmit={(e) => void saveEdit(e)}
                        >
                          <input
                            className="ds-input max-w-xs py-1.5 text-sm"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            autoFocus
                          />
                          <button
                            type="submit"
                            className="ds-btn-primary text-xs"
                            disabled={saveBusy || !editName.trim()}
                          >
                            {t("save")}
                          </button>
                          <button
                            type="button"
                            className="ds-btn-ghost p-1.5"
                            onClick={cancelEdit}
                            aria-label={t("cancel")}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </form>
                      ) : (
                        row.name
                      )}
                    </td>
                    <td className="hidden max-w-[200px] font-mono text-[11px] text-fg-muted lg:table-cell">
                      <span className="block truncate" title={String(row.id)}>
                        {row.id}
                      </span>
                    </td>
                    <td className="text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          className="ds-btn-ghost rounded-lg p-2"
                          aria-label={t("copyTagIdAria")}
                          title={
                            copiedTagId === row.id
                              ? t("tagIdCopied")
                              : t("copyTagId")
                          }
                          onClick={() => void copyTagId(row.id)}
                        >
                          {copiedTagId === row.id ? (
                            <Check
                              className="h-4 w-4 text-emerald-600"
                              strokeWidth={2}
                            />
                          ) : (
                            <Copy className="h-4 w-4" strokeWidth={1.5} />
                          )}
                        </button>
                        {!readOnly ? (
                          <>
                            <button
                              type="button"
                              className="ds-btn-ghost rounded-lg p-2"
                              aria-label={t("edit")}
                              onClick={() =>
                                editingId === row.id
                                  ? cancelEdit()
                                  : startEdit(row)
                              }
                            >
                              <Pencil className="h-4 w-4" strokeWidth={1.5} />
                            </button>
                            <button
                              type="button"
                              className="ds-btn-ghost rounded-lg p-2 text-danger hover:bg-danger-soft"
                              aria-label={t("delete")}
                              onClick={() => setDeleteId(row.id)}
                            >
                              <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="flex flex-col gap-3 lg:hidden">
        {tags.length === 0 ? (
          <li className="ds-card p-6 text-center text-sm text-fg-muted">
            {t("empty")}
          </li>
        ) : (
          tags.map((row) => (
            <li key={row.id} className="ds-card space-y-3 p-4">
              {editingId === row.id ? (
                <form
                  className="space-y-3"
                  onSubmit={(e) => void saveEdit(e)}
                >
                  <input
                    className="ds-input w-full"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="ds-btn-primary flex-1"
                      disabled={saveBusy || !editName.trim()}
                    >
                      {t("save")}
                    </button>
                    <button
                      type="button"
                      className="ds-btn-outline flex-1"
                      onClick={cancelEdit}
                    >
                      {t("cancel")}
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-fg">{row.name}</p>
                      <p className="mt-1 truncate font-mono text-[10px] text-fg-muted/90">
                        {t("colId")}: {row.id}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        className="ds-btn-ghost p-2"
                        aria-label={t("copyTagIdAria")}
                        title={
                          copiedTagId === row.id
                            ? t("tagIdCopied")
                            : t("copyTagId")
                        }
                        onClick={() => void copyTagId(row.id)}
                      >
                        {copiedTagId === row.id ? (
                          <Check
                            className="h-4 w-4 text-emerald-600"
                            strokeWidth={2}
                          />
                        ) : (
                          <Copy className="h-4 w-4" strokeWidth={1.5} />
                        )}
                      </button>
                      {!readOnly ? (
                        <>
                          <button
                            type="button"
                            className="ds-btn-ghost p-2"
                            onClick={() => startEdit(row)}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className="ds-btn-ghost p-2 text-danger"
                            onClick={() => setDeleteId(row.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </>
              )}
            </li>
          ))
        )}
      </ul>

      {deleteId ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-fg/30 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => !deleteBusy && setDeleteId(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-display text-lg font-semibold text-fg">
              {t("deleteTitle")}
            </p>
            <p className="mt-2 text-sm text-fg-secondary">
              {t("deleteBody")}
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="ds-btn-outline"
                disabled={deleteBusy}
                onClick={() => setDeleteId(null)}
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-lg bg-danger px-4 text-sm font-semibold text-white hover:bg-red-600"
                disabled={deleteBusy}
                onClick={() => void confirmDelete()}
              >
                {deleteBusy ? t("deleting") : t("deleteConfirm")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
