"use client";

import { useCallback, useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { DeleteConfirmDialog } from "../../contacts/_components/DeleteConfirmDialog";

export type SerializedListRow = {
  id: number;
  name: string;
  createdAt: string;
  memberCount: number;
};

type Props = {
  tenantId: string;
  role: string;
  initialLists: SerializedListRow[];
};

export function ListsPageClient({
  tenantId,
  role,
  initialLists,
}: Props) {
  const t = useTranslations("app.lists");
  const tNav = useTranslations("app.nav");
  const format = useFormatter();
  const readOnly = role === "support";
  const api = `/api/t/${tenantId}/lists`;

  const [lists, setLists] = useState<SerializedListRow[]>(initialLists);
  const [name, setName] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    setLists(initialLists);
  }, [initialLists]);

  function formatCreatedAt(iso: string) {
    try {
      return format.dateTime(new Date(iso), {
        dateStyle: "short",
        timeStyle: "short",
      });
    } catch {
      return "—";
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    const n = name.trim();
    if (!n) return;
    setErr(null);
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
    const j = (await res.json()) as { list: SerializedListRow };
    setName("");
    setLists((prev) => {
      const next = [j.list, ...prev.filter((x) => x.id !== j.list.id)];
      return next.sort((a, b) => a.name.localeCompare(b.name));
    });
  }

  function startEdit(row: SerializedListRow) {
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
    const j = (await res.json()) as { list: SerializedListRow | null };
    cancelEdit();
    if (j.list) {
      setLists((prev) => {
        const next = prev.map((x) => (x.id === j.list!.id ? j.list! : x));
        return next.sort((a, b) => a.name.localeCompare(b.name));
      });
    }
  }

  const confirmDelete = useCallback(async () => {
    const idToRemove = deleteId;
    if (idToRemove === null || readOnly) return;
    setDeleteBusy(true);
    const res = await fetch(`${api}/${idToRemove}`, { method: "DELETE" });
    setDeleteBusy(false);
    if (!res.ok) return;
    setDeleteId(null);
    setLists((prev) => prev.filter((x) => x.id !== idToRemove));
  }, [api, deleteId, readOnly]);

  return (
    <div className="space-y-8 pb-10">
      <header className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-md">
        <div
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{
            backgroundImage: `
              linear-gradient(125deg, rgb(59 130 246 / 0.08) 0%, transparent 42%),
              linear-gradient(300deg, rgb(14 165 233 / 0.06) 0%, transparent 45%)
            `,
          }}
        />
        <div className="relative flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
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
      </header>

      {err ? (
        <p className="text-sm text-danger" role="alert">
          {err}
        </p>
      ) : null}

      {!readOnly ? (
        <form
          onSubmit={(e) => void create(e)}
          className="ds-card flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:p-6"
        >
          <label className="ds-label flex-1">
            {t("newNameLabel")}
            <input
              name="list-name"
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="ds-input"
              placeholder={t("newNamePlaceholder")}
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

      <div className="hidden lg:block">
        <div className="ds-table-wrap">
          <table className="ds-table min-w-[720px] w-full">
            <thead>
              <tr>
                <th>{t("colName")}</th>
                <th className="whitespace-nowrap">{t("colMemberCount")}</th>
                <th className="whitespace-nowrap">{t("colCreatedAt")}</th>
                <th className="text-right">{t("colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {lists.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="py-10 text-center text-sm text-fg-muted"
                  >
                    {t("empty")}
                  </td>
                </tr>
              ) : (
                lists.map((row) => (
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
                    <td className="tabular-nums text-fg-secondary">
                      {format.number(row.memberCount)}
                    </td>
                    <td className="whitespace-nowrap text-sm text-fg-secondary">
                      {formatCreatedAt(row.createdAt)}
                    </td>
                    <td className="text-right">
                      {!readOnly ? (
                        <div className="flex justify-end gap-1">
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
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="flex flex-col gap-3 lg:hidden">
        {lists.length === 0 ? (
          <li className="ds-card p-6 text-center text-sm text-fg-muted">
            {t("empty")}
          </li>
        ) : (
          lists.map((row) => (
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
                      <p className="mt-1 text-sm text-fg-secondary">
                        {t("colMemberCount")}:{" "}
                        {format.number(row.memberCount)}
                      </p>
                      <p className="mt-0.5 text-xs text-fg-muted">
                        {t("colCreatedAt")}: {formatCreatedAt(row.createdAt)}
                      </p>
                    </div>
                    {!readOnly ? (
                      <div className="flex shrink-0 gap-1">
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
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </li>
          ))
        )}
      </ul>

      {deleteId !== null ? (
        <DeleteConfirmDialog
          title={t("deleteTitle")}
          body={t("deleteBody")}
          confirmLabel={deleteBusy ? t("deleting") : t("deleteConfirm")}
          cancelLabel={t("cancel")}
          busy={deleteBusy}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleteId(null)}
        />
      ) : null}
    </div>
  );
}
