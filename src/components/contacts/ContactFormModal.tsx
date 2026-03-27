"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";

export type TagDto = { id: string; name: string; slug: string };
export type DefDto = {
  id: string;
  key: string;
  label: string;
  fieldType: string;
  config: { options?: { value: string; label: string }[] } | null;
  defaultValue?: unknown;
};

export type ContactDto = {
  id: string;
  phoneE164: string;
  name: string | null;
  email: string | null;
  tags: TagDto[];
  customValues: Record<string, unknown>;
};

function valueToFormString(value: unknown, fieldType: string): string {
  if (value === null || value === undefined) return "";
  if (fieldType === "boolean") {
    if (value === true) return "true";
    if (value === false) return "false";
    return "";
  }
  return String(value);
}

type Props = {
  tenantId: string;
  open: boolean;
  mode: "create" | "edit";
  contact: ContactDto | null;
  allTags: TagDto[];
  definitions: DefDto[];
  readOnly: boolean;
  onClose: () => void;
  onSaved: () => void;
};

export function ContactFormModal({
  tenantId,
  open,
  mode,
  contact,
  allTags,
  definitions,
  readOnly,
  onClose,
  onSaved,
}: Props) {
  const t = useTranslations("app.contacts");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [newTagsText, setNewTagsText] = useState("");
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    if (mode === "edit" && contact) {
      setPhone(contact.phoneE164);
      setName(contact.name ?? "");
      setEmail(contact.email ?? "");
      setSelectedTagIds(new Set(contact.tags.map((x) => x.id)));
      setNewTagsText("");
      const c: Record<string, string> = {};
      for (const d of definitions) {
        let effective: unknown;
        if (d.id in contact.customValues) {
          effective = contact.customValues[d.id];
        } else {
          effective = d.defaultValue ?? null;
        }
        c[d.id] = valueToFormString(effective, d.fieldType);
      }
      setCustom(c);
    } else {
      setPhone("");
      setName("");
      setEmail("");
      setSelectedTagIds(new Set());
      setNewTagsText("");
      const c: Record<string, string> = {};
      for (const d of definitions) {
        c[d.id] = valueToFormString(d.defaultValue ?? null, d.fieldType);
      }
      setCustom(c);
    }
  }, [open, mode, contact, definitions]);

  const sortedDefs = useMemo(
    () => [...definitions].sort((a, b) => a.label.localeCompare(b.label)),
    [definitions],
  );

  function toggleTag(id: string) {
    setSelectedTagIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    setErr(null);
    setSaving(true);
    const newTagNames = newTagsText
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const customValues: Record<string, unknown> = {};
    for (const d of definitions) {
      const raw = custom[d.id]?.trim() ?? "";
      if (raw === "") {
        customValues[d.id] = null;
      } else if (d.fieldType === "boolean") {
        customValues[d.id] = raw === "true";
      } else if (d.fieldType === "number") {
        customValues[d.id] = Number.parseFloat(raw);
      } else {
        customValues[d.id] = raw;
      }
    }

    const payload = {
      phone,
      name: name || null,
      email: email || null,
      tagIds: [...selectedTagIds],
      newTagNames,
      customValues,
    };

    const base = `/api/t/${tenantId}/contacts`;
    const url =
      mode === "create" ? base : `${base}/${contact!.id}`;
    const res = await fetch(url, {
      method: mode === "create" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      const j = (await res.json()) as { error?: string };
      setErr(j.error ?? t("saveError"));
      return;
    }
    onSaved();
    onClose();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-fg/35 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-form-title"
      onClick={() => !saving && onClose()}
    >
      <div
        className="flex max-h-[min(100dvh,720px)] w-full max-w-lg flex-col rounded-t-2xl border border-border bg-card shadow-2xl sm:max-h-[90vh] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-6">
          <h2
            id="contact-form-title"
            className="font-display text-lg font-semibold text-fg"
          >
            {mode === "create" ? t("newContact") : t("editContact")}
          </h2>
          <button
            type="button"
            onClick={() => !saving && onClose()}
            className="rounded-lg p-2 text-fg-muted hover:bg-neutral-100 hover:text-fg"
            aria-label={t("close")}
          >
            <X className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </div>

        <form
          onSubmit={(e) => void submit(e)}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
            <div className="rounded-xl border border-primary-100 bg-primary-50/50 px-3 py-2 text-xs text-fg-secondary">
              {t("contactBaseHint")}
            </div>

            <label className="ds-label">
              {t("systemPhone")} *
              <input
                className="ds-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                disabled={readOnly}
                placeholder="+5511999999999"
              />
            </label>
            <label className="ds-label">
              {t("systemName")}
              <input
                className="ds-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={readOnly}
              />
            </label>
            <label className="ds-label">
              {t("systemEmail")}
              <input
                type="email"
                className="ds-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={readOnly}
              />
            </label>

            <div>
              <span className="ds-label">{t("tagsLabel")}</span>
              <div className="mt-2 flex max-h-32 flex-wrap gap-2 overflow-y-auto rounded-xl border border-border bg-neutral-50/80 p-3">
                {allTags.map((tg) => (
                  <label
                    key={tg.id}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-fg-secondary has-[:checked]:border-primary-300 has-[:checked]:bg-primary-50 has-[:checked]:text-primary-700"
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={selectedTagIds.has(tg.id)}
                      onChange={() => toggleTag(tg.id)}
                      disabled={readOnly}
                    />
                    {tg.name}
                  </label>
                ))}
                {allTags.length === 0 ? (
                  <span className="text-xs text-fg-muted">{t("noTagsYet")}</span>
                ) : null}
              </div>
              {!readOnly ? (
                <label className="ds-label mt-3">
                  {t("newTagsHint")}
                  <input
                    className="ds-input"
                    value={newTagsText}
                    onChange={(e) => setNewTagsText(e.target.value)}
                    placeholder={t("newTagsPlaceholder")}
                  />
                </label>
              ) : null}
            </div>

            {sortedDefs.length > 0 ? (
              <div className="space-y-3 border-t border-border pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                  {t("systemCustomFieldsSection")}
                </p>
                {sortedDefs.map((d) => (
                  <div key={d.id}>
                    <label className="ds-label">
                      {d.label}
                      <span className="ml-1 text-fg-muted">({d.fieldType})</span>
                    </label>
                    {d.fieldType === "boolean" ? (
                      <select
                        className="ds-select !mt-1.5"
                        value={custom[d.id] ?? ""}
                        onChange={(e) =>
                          setCustom((s) => ({ ...s, [d.id]: e.target.value }))
                        }
                        disabled={readOnly}
                      >
                        <option value="">{t("emptyOption")}</option>
                        <option value="true">{t("yes")}</option>
                        <option value="false">{t("no")}</option>
                      </select>
                    ) : d.fieldType === "select" ? (
                      <select
                        className="ds-select !mt-1.5"
                        value={custom[d.id] ?? ""}
                        onChange={(e) =>
                          setCustom((s) => ({ ...s, [d.id]: e.target.value }))
                        }
                        disabled={readOnly}
                      >
                        <option value="">{t("emptyOption")}</option>
                        {(d.config?.options ?? []).map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : d.fieldType === "date" ? (
                      <input
                        type="date"
                        className="ds-input !mt-1.5"
                        value={custom[d.id] ?? ""}
                        onChange={(e) =>
                          setCustom((s) => ({ ...s, [d.id]: e.target.value }))
                        }
                        disabled={readOnly}
                      />
                    ) : d.fieldType === "number" ? (
                      <input
                        type="number"
                        step="any"
                        className="ds-input !mt-1.5"
                        value={custom[d.id] ?? ""}
                        onChange={(e) =>
                          setCustom((s) => ({ ...s, [d.id]: e.target.value }))
                        }
                        disabled={readOnly}
                      />
                    ) : (
                      <input
                        className="ds-input !mt-1.5"
                        value={custom[d.id] ?? ""}
                        onChange={(e) =>
                          setCustom((s) => ({ ...s, [d.id]: e.target.value }))
                        }
                        disabled={readOnly}
                      />
                    )}
                  </div>
                ))}
              </div>
            ) : null}

            {err ? (
              <p className="text-sm text-danger" role="alert">
                {err}
              </p>
            ) : null}
          </div>

          {!readOnly ? (
            <div className="flex gap-2 border-t border-border bg-neutral-50/80 px-5 py-4 sm:px-6">
              <button
                type="button"
                className="ds-btn-outline flex-1"
                onClick={onClose}
                disabled={saving}
              >
                {t("cancel")}
              </button>
              <button type="submit" className="ds-btn-primary flex-1" disabled={saving}>
                {saving ? t("saving") : t("save")}
              </button>
            </div>
          ) : null}
        </form>
      </div>
    </div>
  );
}
