"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import type { MessageTemplateRecord } from "@/lib/meta/graph";
import { parseTemplatePreviewModel } from "@/lib/meta/template-preview-model";
import {
  extractEditableTemplateFields,
  extractHeaderTextForPreview,
  templateHasUnsupportedEditTypes,
} from "@/lib/meta/template-edit-build";
import { WhatsAppTemplatePhonePreview } from "./WhatsAppTemplatePhonePreview";

type Props = {
  template: MessageTemplateRecord | null;
  open: boolean;
  onClose: () => void;
};

function formatLanguageTag(lang: string | undefined): string {
  if (!lang?.trim()) return "—";
  try {
    const norm = lang.replace(/_/g, "-");
    return new Intl.DisplayNames(["pt-BR"], { type: "language" }).of(norm) ?? lang;
  } catch {
    return lang;
  }
}

function categoryLabel(cat: string | undefined): string {
  if (!cat?.trim()) return "—";
  const u = cat.toUpperCase();
  if (u === "MARKETING") return "Marketing";
  if (u === "UTILITY" || u === "TRANSACTIONAL") return "Utilidade";
  if (u === "AUTHENTICATION") return "Autenticação";
  return cat;
}

export function TemplateViewModal({ template, open, onClose }: Props) {
  const t = useTranslations("app.templates");
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const el = panelRef.current?.querySelector<HTMLElement>(
      "button[data-close-modal]",
    );
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

  if (!open || !template) return null;

  const components = Array.isArray(template.components)
    ? template.components
    : [];
  const header = extractHeaderTextForPreview(components);
  const { body, footer, buttons } = extractEditableTemplateFields(components);
  const previewModel = parseTemplatePreviewModel(components);
  const complex = templateHasUnsupportedEditTypes(components);
  const templateKind = complex
    ? t("view.kindOther")
    : t("view.kindStandard");

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
        aria-labelledby="template-view-title"
        className="flex max-h-[min(90vh,880px)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-lg"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <h2 id="template-view-title" className="ds-section-title">
            {t("view.title")}
          </h2>
          <button
            type="button"
            data-close-modal
            onClick={onClose}
            className="rounded-lg p-2 text-fg-muted hover:bg-neutral-100 hover:text-fg"
            aria-label={t("view.close")}
          >
            <X className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="min-h-0 flex-1 overflow-y-auto border-b border-border p-5 lg:border-b-0 lg:border-r">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="ds-label">{t("col.name")}</p>
                <input
                  readOnly
                  className="ds-input mt-1 cursor-default bg-neutral-50"
                  value={template.name ?? ""}
                />
              </div>
              <div>
                <p className="ds-label">{t("col.category")}</p>
                <input
                  readOnly
                  className="ds-input mt-1 cursor-default bg-neutral-50"
                  value={categoryLabel(template.category)}
                />
              </div>
              <div>
                <p className="ds-label">{t("col.language")}</p>
                <input
                  readOnly
                  className="ds-input mt-1 cursor-default bg-neutral-50"
                  value={formatLanguageTag(template.language)}
                />
              </div>
            </div>

            <div className="mt-6">
              <p className="ds-label">{t("view.templateKind")}</p>
              <p className="mt-2 text-sm font-medium text-fg">{templateKind}</p>
              {complex ? (
                <p className="ds-subtitle mt-1">{t("view.previewLimited")}</p>
              ) : null}
            </div>

            {header ? (
              <div className="mt-6">
                <p className="ds-label">{t("view.header")}</p>
                <div className="mt-1.5 rounded-lg border border-border bg-neutral-50 px-3 py-2 text-sm text-fg">
                  {header}
                </div>
              </div>
            ) : null}

            <div className="mt-6">
              <p className="ds-label">{t("view.body")}</p>
              <div className="mt-1.5 min-h-[120px] rounded-lg border border-border bg-neutral-50 px-3 py-2 text-sm text-fg whitespace-pre-wrap">
                {body || "—"}
              </div>
            </div>

            {footer ? (
              <div className="mt-6">
                <p className="ds-label">{t("view.footer")}</p>
                <div className="mt-1.5 rounded-lg border border-border bg-neutral-50 px-3 py-2 text-sm text-fg">
                  {footer}
                </div>
              </div>
            ) : null}

            {buttons.length > 0 ? (
              <div className="mt-6">
                <p className="ds-label">{t("view.buttons")}</p>
                <ul className="mt-2 space-y-2 text-sm text-fg-secondary">
                  {buttons.map((b, i) => (
                    <li
                      key={`${b.type}-${b.text}-${i}`}
                      className="rounded-lg border border-border bg-neutral-50 px-3 py-2"
                    >
                      <span className="font-medium text-fg">{b.text}</span>
                      <span className="text-fg-muted"> · {b.type}</span>
                      {b.url ? (
                        <div className="mt-0.5 truncate text-xs text-primary-600">
                          {b.url}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div className="flex w-full shrink-0 flex-col items-center bg-page p-5 lg:w-[min(100%,360px)]">
            <p className="text-center text-xs font-semibold uppercase tracking-wide text-fg-muted">
              {t("view.preview")}
            </p>
            <div className="mt-4">
              <WhatsAppTemplatePhonePreview model={previewModel} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
