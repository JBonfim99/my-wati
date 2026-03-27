"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Copy, Pencil, Plus, Search, Trash2 } from "lucide-react";
import type { MessageTemplateRecord } from "@/lib/meta/graph";
import { isMessageTemplateEditableByMeta } from "@/lib/meta/template-editable";
import { templateHasUnsupportedEditTypes } from "@/lib/meta/template-edit-build";
import {
  DB_TEMPLATE_DRAFT_STATUS,
  isDbTemplateDraft,
  parseDraftUuidFromTemplateId,
  parseTemplateFormPayload,
  serializeDraftPayload,
  templateRecordToFormStateForDuplicate,
} from "@/lib/meta/template-create-payload";
import { suggestDuplicateTemplateName } from "@/lib/meta/template-components";
import { TemplateViewModal } from "./TemplateViewModal";
import { TemplateEditModal } from "./TemplateEditModal";

type SortKey = "recent" | "nameAsc" | "nameDesc";

export type DraftSnapshot = {
  id: string;
  payload: Record<string, unknown>;
};

type Props = {
  tenantId: string;
  initialTemplates: MessageTemplateRecord[];
  initialDraftSnapshots: DraftSnapshot[];
  initialError: string | null;
  integrationConfigured: boolean;
  canManageMetaTemplates: boolean;
  canSendCampaignFromTemplate: boolean;
};

function formatLanguageDisplay(lang: string | undefined): string {
  if (!lang?.trim()) return "—";
  try {
    const norm = lang.replace(/_/g, "-");
    return new Intl.DisplayNames(["pt-BR"], { type: "language" }).of(norm) ?? lang;
  } catch {
    return lang;
  }
}

function formatCategoryDisplay(
  cat: string | undefined,
  translate: (key: string) => string,
): string {
  if (!cat?.trim()) return "—";
  const u = cat.toUpperCase();
  if (u === "MARKETING") return translate("category.marketing");
  if (u === "UTILITY" || u === "TRANSACTIONAL")
    return translate("category.utility");
  if (u === "AUTHENTICATION") return translate("category.authentication");
  return cat;
}

function formatUpdatedAt(raw: string | undefined): string {
  if (!raw?.trim()) return "—";
  const n = Number(raw);
  let d: Date;
  if (!Number.isNaN(n) && n > 1e12) d = new Date(n);
  else if (!Number.isNaN(n) && n > 1e8) d = new Date(n * 1000);
  else d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

function statusPillClass(status: string | undefined): string {
  const s = (status ?? "").toUpperCase();
  if (s === DB_TEMPLATE_DRAFT_STATUS) {
    return "bg-primary-50 text-primary-700 border border-primary-100";
  }
  if (s === "APPROVED") return "bg-success-soft text-green-800";
  if (s === "PENDING") return "bg-warning-soft text-amber-900";
  if (s === "REJECTED") return "bg-danger-soft text-red-800";
  return "bg-neutral-100 text-fg-secondary";
}

function rowKey(t: MessageTemplateRecord): string {
  return `${t.id ?? t.name ?? "?"}-${t.language ?? ""}`;
}

function statusLabel(
  code: string | undefined,
  translate: (key: string) => string,
): string {
  if (!code?.trim()) return "—";
  const u = code.toUpperCase();
  const known = new Set([
    DB_TEMPLATE_DRAFT_STATUS,
    "APPROVED",
    "PENDING",
    "REJECTED",
    "IN_APPEAL",
    "PENDING_DELETION",
    "DELETED",
    "DISABLED",
    "PAUSED",
    "LIMIT_EXCEEDED",
    "UNKNOWN",
  ]);
  if (known.has(u)) return translate(`status.${u}`);
  return code?.trim() || "—";
}

export function TemplatesPageClient({
  tenantId,
  initialTemplates,
  initialDraftSnapshots,
  initialError,
  integrationConfigured,
  canManageMetaTemplates,
  canSendCampaignFromTemplate,
}: Props) {
  const t = useTranslations("app.templates");
  const router = useRouter();
  const manage = canManageMetaTemplates;
  const canCampaign = canSendCampaignFromTemplate;

  const [rows, setRows] = useState(initialTemplates);
  const [draftSnapshots, setDraftSnapshots] = useState(initialDraftSnapshots);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [viewOpen, setViewOpen] = useState<MessageTemplateRecord | null>(null);
  const [editOpen, setEditOpen] = useState<MessageTemplateRecord | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const snapshotById = useMemo(() => {
    const m = new Map<string, DraftSnapshot>();
    for (const s of draftSnapshots) m.set(s.id, s);
    return m;
  }, [draftSnapshots]);

  useEffect(() => {
    setRows(initialTemplates);
  }, [initialTemplates]);

  useEffect(() => {
    setDraftSnapshots(initialDraftSnapshots);
  }, [initialDraftSnapshots]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows;
    if (q) {
      list = rows.filter((r) => {
        const blob = [r.name, r.category, r.language, r.status, r.id]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return blob.includes(q);
      });
    }
    const out = [...list];
    if (sort === "nameAsc") {
      out.sort((a, b) =>
        (a.name ?? "").localeCompare(b.name ?? "", "pt-BR", {
          sensitivity: "base",
        }),
      );
    } else if (sort === "nameDesc") {
      out.sort((a, b) =>
        (b.name ?? "").localeCompare(a.name ?? "", "pt-BR", {
          sensitivity: "base",
        }),
      );
    } else {
      out.sort((a, b) => {
        const ta = Number(a.last_updated_time ?? 0);
        const tb = Number(b.last_updated_time ?? 0);
        if (ta !== tb) return tb - ta;
        return (a.name ?? "").localeCompare(b.name ?? "", "pt-BR");
      });
    }
    return out;
  }, [rows, query, sort]);

  function showBanner(msg: string) {
    setBanner(msg);
    window.setTimeout(() => setBanner(null), 6000);
  }

  async function duplicateTemplate(tpl: MessageTemplateRecord) {
    if (!manage) return;
    setBanner(null);
    setActionId(tpl.id ?? "dup");

    let formPayload: Record<string, unknown>;
    if (isDbTemplateDraft(tpl)) {
      const uuid = parseDraftUuidFromTemplateId(tpl.id);
      if (!uuid) {
        setActionId(null);
        return;
      }
      const snap = snapshotById.get(uuid);
      if (!snap) {
        showBanner(t("duplicateSnapshotMissing"));
        setActionId(null);
        return;
      }
      const st = parseTemplateFormPayload(snap.payload);
      st.name = suggestDuplicateTemplateName(st.name || "template");
      formPayload = serializeDraftPayload(st);
    } else {
      if (!tpl.id?.trim()) {
        setActionId(null);
        return;
      }
      const st = templateRecordToFormStateForDuplicate(tpl);
      formPayload = serializeDraftPayload(st);
    }

    const res = await fetch(`/api/t/${tenantId}/templates/drafts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: formPayload }),
    });
    const data = (await res.json()) as { error?: string };
    setActionId(null);
    if (!res.ok) {
      showBanner(data.error ?? t("duplicateError"));
      return;
    }
    showBanner(t("duplicateOk"));
    router.refresh();
  }

  async function deleteTemplate(tpl: MessageTemplateRecord) {
    if (!tpl.id) return;
    const dbDraft = isDbTemplateDraft(tpl);
    const ok = window.confirm(
      t(dbDraft ? "deleteConfirmDraft" : "deleteConfirm", {
        name: tpl.name ?? tpl.id,
      }),
    );
    if (!ok) return;

    if (dbDraft) {
      const uuid = parseDraftUuidFromTemplateId(tpl.id);
      if (!uuid) return;
      setActionId(tpl.id);
      setBanner(null);
      const res = await fetch(
        `/api/t/${tenantId}/templates/drafts/${encodeURIComponent(uuid)}`,
        { method: "DELETE" },
      );
      const data = (await res.json()) as { error?: string };
      setActionId(null);
      if (!res.ok) {
        showBanner(data.error ?? t("deleteError"));
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== tpl.id));
      showBanner(t("deleteOkDraft"));
      router.refresh();
      return;
    }

    setActionId(tpl.id);
    setBanner(null);
    const res = await fetch(
      `/api/t/${tenantId}/templates/${encodeURIComponent(tpl.id)}`,
      { method: "DELETE" },
    );
    const data = (await res.json()) as { error?: string };
    setActionId(null);
    if (!res.ok) {
      showBanner(data.error ?? t("deleteError"));
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== tpl.id));
    showBanner(t("deleteOk"));
    router.refresh();
  }

  function campaignHref(tpl: MessageTemplateRecord): string {
    const payload = encodeURIComponent(
      JSON.stringify({
        name: tpl.name ?? "",
        language: tpl.language ?? "",
      }),
    );
    return `/${tenantId}/campaigns/new?template=${payload}`;
  }

  function openEdit(tpl: MessageTemplateRecord) {
    if (isDbTemplateDraft(tpl)) {
      const uuid = parseDraftUuidFromTemplateId(tpl.id);
      if (uuid) {
        router.push(`/${tenantId}/templates/new?draftId=${encodeURIComponent(uuid)}`);
      }
      return;
    }
    setEditOpen(tpl);
  }

  const showError = initialError ?? (!integrationConfigured ? t("noIntegration") : null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="ds-page-title">{t("title")}</h1>
        <p className="ds-subtitle mt-1">{t("subtitle")}</p>
      </div>

      {showError ? <div className="ds-alert-warning">{showError}</div> : null}
      {banner ? <div className="ds-alert-warning">{banner}</div> : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="relative min-w-[200px] max-w-md flex-1">
          <Search
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted"
            strokeWidth={1.5}
            aria-hidden
          />
          <input
            type="search"
            className="ds-input pr-10"
            placeholder={t("searchPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t("searchPlaceholder")}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {manage ? (
            <Link
              href={`/${tenantId}/templates/new`}
              className="ds-btn-primary ds-btn-sm inline-flex items-center gap-1.5"
            >
              <Plus className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              {t("createTemplate")}
            </Link>
          ) : null}
          <label className="flex items-center gap-2 text-sm text-fg-secondary">
            <span>{t("sortLabel")}</span>
            <select
              className="ds-select mt-0 h-9 min-w-[160px]"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
            >
              <option value="recent">{t("sortRecent")}</option>
              <option value="nameAsc">{t("sortNameAsc")}</option>
              <option value="nameDesc">{t("sortNameDesc")}</option>
            </select>
          </label>
        </div>
      </div>

      {!showError && filtered.length === 0 ? (
        <p className="ds-subtitle">{t("empty")}</p>
      ) : null}

      {filtered.length > 0 ? (
        <div className="ds-table-wrap">
          <table className="ds-table min-w-[880px]">
            <thead>
              <tr>
                <th className="normal-case">{t("col.name")}</th>
                <th className="normal-case">{t("col.category")}</th>
                <th className="normal-case">{t("col.status")}</th>
                <th className="normal-case">{t("col.language")}</th>
                <th className="normal-case">{t("col.updated")}</th>
                <th className="normal-case">{t("col.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((tpl) => {
                const id = tpl.id;
                const busy = Boolean(id && actionId === id);
                const dbDraft = isDbTemplateDraft(tpl);
                const approved =
                  (tpl.status ?? "").toUpperCase() === "APPROVED";
                const unsupported = templateHasUnsupportedEditTypes(
                  tpl.components,
                );
                const editable =
                  manage &&
                  !unsupported &&
                  (dbDraft || isMessageTemplateEditableByMeta(tpl.status));
                return (
                  <tr key={rowKey(tpl)}>
                    <td>
                      <button
                        type="button"
                        onClick={() => setViewOpen(tpl)}
                        className="text-left font-medium text-primary-600 hover:underline"
                      >
                        {tpl.name ?? "—"}
                      </button>
                    </td>
                    <td>
                      {formatCategoryDisplay(
                        tpl.category,
                        t as (key: string) => string,
                      )}
                    </td>
                    <td>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusPillClass(tpl.status)}`}
                      >
                        {statusLabel(tpl.status, t as (key: string) => string)}
                      </span>
                    </td>
                    <td>{formatLanguageDisplay(tpl.language)}</td>
                    <td className="text-fg-secondary">
                      {formatUpdatedAt(tpl.last_updated_time)}
                    </td>
                    <td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {manage ? (
                          <>
                            <button
                              type="button"
                              disabled={busy || (!dbDraft && !id)}
                              onClick={() => void duplicateTemplate(tpl)}
                              className="rounded-lg p-2 text-fg-muted hover:bg-neutral-100 hover:text-fg disabled:opacity-40"
                              title={t("action.duplicate")}
                              aria-label={t("action.duplicate")}
                            >
                              <Copy className="h-4 w-4" strokeWidth={1.5} />
                            </button>
                            <button
                              type="button"
                              disabled={busy || !id}
                              onClick={() => void deleteTemplate(tpl)}
                              className="rounded-lg p-2 text-fg-muted hover:bg-danger-soft hover:text-danger disabled:opacity-40"
                              title={t("action.delete")}
                              aria-label={t("action.delete")}
                            >
                              <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                            </button>
                            <button
                              type="button"
                              disabled={!editable || busy || !id}
                              onClick={() => openEdit(tpl)}
                              className="rounded-lg p-2 text-fg-muted hover:bg-neutral-100 hover:text-fg disabled:opacity-40"
                              title={t("action.edit")}
                              aria-label={t("action.edit")}
                            >
                              <Pencil className="h-4 w-4" strokeWidth={1.5} />
                            </button>
                          </>
                        ) : null}
                        {canCampaign && approved && !dbDraft ? (
                          <Link
                            href={campaignHref(tpl)}
                            className="ml-1 inline-flex h-8 shrink-0 items-center rounded-lg border border-whatsapp px-2.5 text-xs font-semibold text-whatsapp-dark transition-colors hover:bg-whatsapp-soft"
                          >
                            {t("action.sendCampaign")}
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <TemplateViewModal
        template={viewOpen}
        open={viewOpen !== null}
        onClose={() => setViewOpen(null)}
      />

      <TemplateEditModal
        template={editOpen}
        open={editOpen !== null}
        tenantId={tenantId}
        onClose={() => setEditOpen(null)}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}
