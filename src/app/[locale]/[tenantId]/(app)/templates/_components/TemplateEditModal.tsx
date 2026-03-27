"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2, X } from "lucide-react";
import type { MessageTemplateRecord } from "@/lib/meta/graph";
import {
  buildTemplateComponentsForPatch,
  extractEditableTemplateFields,
} from "@/lib/meta/template-edit-build";
import { useRouter } from "@/i18n/navigation";

type Btn = { type: string; text: string; url?: string };

type Props = {
  template: MessageTemplateRecord | null;
  open: boolean;
  tenantId: string;
  onClose: () => void;
  onSaved: () => void;
};

export function TemplateEditModal({
  template,
  open,
  tenantId,
  onClose,
  onSaved,
}: Props) {
  const t = useTranslations("app.templates");
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const [body, setBody] = useState("");
  const [footer, setFooter] = useState("");
  const [buttons, setButtons] = useState<Btn[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !template) return;
    const parts = extractEditableTemplateFields(template.components);
    setBody(parts.body);
    setFooter(parts.footer);
    setButtons(parts.buttons.map((b) => ({ ...b })));
    setError(null);
  }, [open, template]);

  useEffect(() => {
    if (!open) return;
    const el = panelRef.current?.querySelector<HTMLElement>("textarea");
    el?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !template?.id) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const tpl = template;
    if (!tpl?.id) return;
    setError(null);
    if (!body.trim()) {
      setError(t("edit.bodyRequired"));
      return;
    }

    const cleanedButtons = buttons
      .map((b) => ({
        type: b.type,
        text: b.text.trim(),
        url: b.url?.trim(),
      }))
      .filter((b) => b.text.length > 0);

    for (const b of cleanedButtons) {
      if (b.type === "URL" && !(b.url ?? "").trim()) {
        setError(t("edit.urlRequired"));
        return;
      }
    }

    const components = buildTemplateComponentsForPatch(tpl.components, {
      body,
      footer,
      buttons: cleanedButtons,
    });

    setSaving(true);
    const res = await fetch(
      `/api/t/${tenantId}/templates/${encodeURIComponent(tpl.id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ components }),
      },
    );
    const data = (await res.json()) as { error?: string };
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? t("edit.saveError"));
      return;
    }
    onSaved();
    router.refresh();
    onClose();
  }

  function addButton() {
    setButtons((prev) => [...prev, { type: "QUICK_REPLY", text: "" }]);
  }

  function removeButton(i: number) {
    setButtons((prev) => prev.filter((_, j) => j !== i));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-edit-title"
        className="flex max-h-[min(90vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-lg"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <h2 id="template-edit-title" className="ds-section-title">
            {t("edit.title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-fg-muted hover:bg-neutral-100 hover:text-fg"
            aria-label={t("view.close")}
          >
            <X className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </header>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
            <p className="ds-subtitle">
              {t("edit.hint", { name: template.name ?? "" })}
            </p>

            {error ? <div className="ds-alert-danger">{error}</div> : null}

            <div>
              <label htmlFor="tpl-body" className="ds-label">
                {t("view.body")}
              </label>
              <textarea
                id="tpl-body"
                className="ds-input mt-1.5 min-h-[140px] resize-y py-2"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
              />
            </div>

            <div>
              <label htmlFor="tpl-footer" className="ds-label">
                {t("view.footer")}
              </label>
              <input
                id="tpl-footer"
                className="ds-input"
                value={footer}
                onChange={(e) => setFooter(e.target.value)}
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <span className="ds-label">{t("view.buttons")}</span>
                <button
                  type="button"
                  onClick={addButton}
                  className="ds-btn-ghost ds-btn-sm gap-1"
                >
                  <Plus className="h-4 w-4" strokeWidth={1.5} />
                  {t("edit.addButton")}
                </button>
              </div>
              <ul className="mt-2 space-y-3">
                {buttons.map((b, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-border bg-neutral-50 p-3"
                  >
                    <div className="flex gap-2">
                      <select
                        className="ds-select mt-0 max-w-[140px]"
                        value={b.type}
                        onChange={(e) =>
                          setButtons((prev) =>
                            prev.map((x, j) =>
                              j === i ? { ...x, type: e.target.value } : x,
                            ),
                          )
                        }
                      >
                        <option value="QUICK_REPLY">
                          {t("edit.btnQuickReply")}
                        </option>
                        <option value="URL">{t("edit.btnUrl")}</option>
                      </select>
                      <input
                        className="ds-input mt-0 flex-1"
                        placeholder={t("edit.btnLabelPlaceholder")}
                        value={b.text}
                        onChange={(e) =>
                          setButtons((prev) =>
                            prev.map((x, j) =>
                              j === i ? { ...x, text: e.target.value } : x,
                            ),
                          )
                        }
                      />
                      <button
                        type="button"
                        onClick={() => removeButton(i)}
                        className="mt-0 shrink-0 rounded-lg p-2 text-fg-muted hover:bg-danger-soft hover:text-danger"
                        aria-label={t("edit.removeButton")}
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                      </button>
                    </div>
                    {b.type === "URL" ? (
                      <input
                        className="ds-input mt-2"
                        placeholder="https://"
                        value={b.url ?? ""}
                        onChange={(e) =>
                          setButtons((prev) =>
                            prev.map((x, j) =>
                              j === i ? { ...x, url: e.target.value } : x,
                            ),
                          )
                        }
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <footer className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              className="ds-btn-outline ds-btn-sm"
              disabled={saving}
            >
              {t("edit.cancel")}
            </button>
            <button
              type="submit"
              className="ds-btn-primary ds-btn-sm"
              disabled={saving}
            >
              {saving ? t("edit.saving") : t("edit.save")}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
