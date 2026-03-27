"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";

type Item = {
  id: string;
  key: string;
  label: string;
  value: string;
  sortOrder: number;
  updatedAt: string;
};

export function TenantFixedFieldsPanel({
  tenantId,
  readOnly = false,
}: {
  tenantId: string;
  readOnly?: boolean;
}) {
  const t = useTranslations("app.contacts.tenantFixedFields");
  const api = `/api/t/${tenantId}/tenant-fixed-fields`;

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newValue, setNewValue] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editValue, setEditValue] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    const res = await fetch(api);
    const data = (await res.json()) as {
      items?: Item[];
      error?: string;
    };
    setLoading(false);
    if (!res.ok) {
      setErr(data.error ?? t("loadError"));
      setItems([]);
      return;
    }
    setItems(data.items ?? []);
  }, [api, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createField(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    const label = newLabel.trim();
    if (!label) return;
    setSaveBusy(true);
    setErr(null);
    const res = await fetch(api, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label,
        value: newValue,
        ...(newKey.trim() ? { key: newKey.trim() } : {}),
      }),
    });
    const data = (await res.json()) as { error?: string; item?: Item };
    setSaveBusy(false);
    if (!res.ok) {
      setErr(data.error ?? t("saveError"));
      return;
    }
    if (data.item) {
      setItems((prev) =>
        [...prev, data.item!].sort((a, b) => a.label.localeCompare(b.label)),
      );
    }
    setNewKey("");
    setNewLabel("");
    setNewValue("");
    setAdding(false);
  }

  function startEdit(row: Item) {
    if (readOnly) return;
    setEditingId(row.id);
    setEditLabel(row.label);
    setEditValue(row.value);
    setErr(null);
  }

  async function saveEdit(id: string) {
    if (readOnly) return;
    setEditBusy(true);
    setErr(null);
    const res = await fetch(`${api}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: editLabel.trim(),
        value: editValue,
      }),
    });
    const data = (await res.json()) as { error?: string; item?: Item };
    setEditBusy(false);
    if (!res.ok) {
      setErr(data.error ?? t("saveError"));
      return;
    }
    if (data.item) {
      setItems((prev) =>
        prev
          .map((x) => (x.id === id ? data.item! : x))
          .sort((a, b) => a.label.localeCompare(b.label)),
      );
    }
    setEditingId(null);
  }

  async function remove(id: string) {
    if (readOnly) return;
    if (!window.confirm(t("deleteConfirm"))) return;
    setErr(null);
    const res = await fetch(`${api}/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setErr(data.error ?? t("deleteError"));
      return;
    }
    setItems((prev) => prev.filter((x) => x.id !== id));
  }

  return (
    <section className="ds-animate-in overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="border-b border-border bg-neutral-50/80 px-6 py-4">
        <h2 className="font-display text-lg font-semibold text-fg">
          {t("title")}
        </h2>
        <p className="mt-0.5 text-sm text-fg-secondary">{t("hint")}</p>
      </div>

      <div className="space-y-4 p-6">
        {readOnly ? (
          <p className="rounded-lg border border-border bg-neutral-50/80 px-3 py-2 text-sm text-fg-secondary">
            {t("readOnlyHint")}
          </p>
        ) : null}

        {err ? (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {err}
          </p>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-fg-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t("loading")}
          </div>
        ) : items.length === 0 && !adding ? (
          <p className="text-sm text-fg-muted">{t("empty")}</p>
        ) : null}

        {!loading && items.length > 0 ? (
          <div className="ds-table-wrap">
            <table className="ds-table min-w-[640px]">
              <thead>
                <tr>
                  <th className="normal-case">{t("colKey")}</th>
                  <th className="normal-case">{t("colLabel")}</th>
                  <th className="normal-case">{t("colValue")}</th>
                  {!readOnly ? (
                    <th className="normal-case">{t("colActions")}</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {items.map((row) =>
                  editingId === row.id && !readOnly ? (
                    <tr key={row.id}>
                      <td>
                        <code className="text-xs text-fg-secondary">{row.key}</code>
                      </td>
                      <td>
                        <input
                          className="ds-input mt-0 text-sm"
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                        />
                      </td>
                      <td>
                        <textarea
                          className="ds-input mt-0 min-h-[72px] resize-y py-2 text-sm"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                        />
                      </td>
                      <td>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={editBusy || !editLabel.trim()}
                            className="ds-btn-primary ds-btn-sm inline-flex items-center gap-2"
                            onClick={() => void saveEdit(row.id)}
                          >
                            {editBusy ? (
                              <>
                                <Loader2 className="size-4 animate-spin" aria-hidden />
                                {t("saving")}
                              </>
                            ) : (
                              t("save")
                            )}
                          </button>
                          <button
                            type="button"
                            disabled={editBusy}
                            className="ds-btn-ghost ds-btn-sm text-fg-secondary"
                            onClick={() => setEditingId(null)}
                          >
                            {t("cancel")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={row.id}>
                      <td>
                        <code className="text-xs text-primary-700">{`{{${row.key}}}`}</code>
                      </td>
                      <td className="font-medium">{row.label}</td>
                      <td
                        className="max-w-[240px] truncate text-sm text-fg-secondary"
                        title={row.value}
                      >
                        {row.value || "—"}
                      </td>
                      {!readOnly ? (
                        <td>
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              className="rounded-lg p-2 text-fg-muted hover:bg-neutral-100"
                              title={t("edit")}
                              onClick={() => startEdit(row)}
                            >
                              <Pencil className="size-4" strokeWidth={1.5} />
                            </button>
                            <button
                              type="button"
                              className="rounded-lg p-2 text-fg-muted hover:bg-danger-soft hover:text-danger"
                              title={t("delete")}
                              onClick={() => void remove(row.id)}
                            >
                              <Trash2 className="size-4" strokeWidth={1.5} />
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        ) : null}

        {!readOnly && adding ? (
          <form
            onSubmit={(e) => void createField(e)}
            className="space-y-3 rounded-xl border border-border bg-neutral-50/60 p-4"
          >
            <p className="text-sm font-medium text-fg">{t("formTitle")}</p>
            <label className="ds-label">
              {t("fieldLabel")}
              <input
                className="ds-input mt-1"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                required
              />
            </label>
            <label className="ds-label">
              {t("fieldKeyOptional")}
              <input
                className="ds-input mt-1 font-mono text-sm"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder={t("fieldKeyPlaceholder")}
              />
            </label>
            <label className="ds-label">
              {t("fieldValue")}
              <textarea
                className="ds-input mt-1 min-h-[80px] resize-y py-2"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={saveBusy}
                className="ds-btn-primary ds-btn-sm"
              >
                {saveBusy ? t("saving") : t("create")}
              </button>
              <button
                type="button"
                className="ds-btn-outline ds-btn-sm"
                disabled={saveBusy}
                onClick={() => {
                  setAdding(false);
                  setNewKey("");
                  setNewLabel("");
                  setNewValue("");
                }}
              >
                {t("cancel")}
              </button>
            </div>
          </form>
        ) : null}

        {!readOnly && !adding ? (
          <button
            type="button"
            className="ds-btn-secondary ds-btn-sm inline-flex items-center gap-1.5"
            onClick={() => {
              setAdding(true);
              setErr(null);
            }}
          >
            <Plus className="size-4" strokeWidth={1.5} aria-hidden />
            {t("add")}
          </button>
        ) : null}
      </div>
    </section>
  );
}
