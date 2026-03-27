"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import {
  Copy,
  LayoutTemplate,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useToast } from "@/components/ToastProvider";
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
import {
  TEMPLATE_FILTER_CATEGORY_VALUES,
  TEMPLATE_FILTER_STATUS_VALUES,
  type TemplatesListSortKey,
} from "@/lib/templates/template-list-query";
import { TemplateViewModal } from "./TemplateViewModal";
import { TemplateEditModal } from "./TemplateEditModal";

export type DraftSnapshot = {
  id: string;
  payload: Record<string, unknown>;
};

type Props = {
  tenantId: string;
  initialTemplates: MessageTemplateRecord[];
  initialNextCursor: string | null;
  initialTotal: number;
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

function toggleInSet(prev: Set<string>, value: string): Set<string> {
  const next = new Set(prev);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export function TemplatesPageClient({
  tenantId,
  initialTemplates,
  initialNextCursor,
  initialTotal,
  initialDraftSnapshots,
  initialError,
  integrationConfigured,
  canManageMetaTemplates,
  canSendCampaignFromTemplate,
}: Props) {
  const t = useTranslations("app.templates");
  const toast = useToast();
  const router = useRouter();
  const manage = canManageMetaTemplates;
  const canCampaign = canSendCampaignFromTemplate;

  const [rows, setRows] = useState(initialTemplates);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [total, setTotal] = useState(initialTotal);
  const [listLoading, setListLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sort, setSort] = useState<TemplatesListSortKey>("recent");
  const [statusFilter, setStatusFilter] = useState<Set<string>>(() => new Set());
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(
    () => new Set(),
  );

  const [draftSnapshots, setDraftSnapshots] = useState(initialDraftSnapshots);
  const [viewOpen, setViewOpen] = useState<MessageTemplateRecord | null>(null);
  const [editOpen, setEditOpen] = useState<MessageTemplateRecord | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const skipNextFilterFetch = useRef(true);

  const snapshotById = useMemo(() => {
    const m = new Map<string, DraftSnapshot>();
    for (const s of draftSnapshots) m.set(s.id, s);
    return m;
  }, [draftSnapshots]);

  useEffect(() => {
    setDraftSnapshots(initialDraftSnapshots);
  }, [initialDraftSnapshots]);

  useEffect(() => {
    setRows(initialTemplates);
    setNextCursor(initialNextCursor);
    setTotal(initialTotal);
  }, [initialTemplates, initialNextCursor, initialTotal]);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(id);
  }, [query]);

  const buildListUrl = useCallback(
    (opts: { cursor?: string | null }) => {
      const params = new URLSearchParams();
      params.set("limit", "25");
      params.set("sort", sort);
      if (debouncedQuery) params.set("q", debouncedQuery);
      for (const s of statusFilter) params.append("status", s);
      for (const c of categoryFilter) params.append("category", c);
      if (opts.cursor) params.set("cursor", opts.cursor);
      return `/api/t/${tenantId}/templates/list?${params.toString()}`;
    },
    [tenantId, sort, debouncedQuery, statusFilter, categoryFilter],
  );

  const nextCursorRef = useRef(nextCursor);
  nextCursorRef.current = nextCursor;

  const fetchList = useCallback(
    async (reset: boolean) => {
      setListError(null);
      if (reset) {
        setListLoading(true);
      } else {
        setLoadingMore(true);
      }
      try {
        const url = buildListUrl({
          cursor: reset ? null : nextCursorRef.current,
        });
        const res = await fetch(url);
        const data = (await res.json()) as {
          templates?: MessageTemplateRecord[];
          nextCursor?: string | null;
          total?: number;
          loadError?: string | null;
          error?: string;
        };
        if (!res.ok) {
          setListError(data.error ?? t("loadError"));
          return;
        }
        const page = data.templates ?? [];
        if (reset) {
          setRows(page);
        } else {
          setRows((prev) => {
            const seen = new Set(prev.map((r) => rowKey(r)));
            const add = page.filter((r) => !seen.has(rowKey(r)));
            return [...prev, ...add];
          });
        }
        setNextCursor(data.nextCursor ?? null);
        if (typeof data.total === "number") setTotal(data.total);
        if (data.loadError && reset) {
          setListError(data.loadError);
        }
      } catch {
        setListError(t("loadError"));
      } finally {
        setListLoading(false);
        setLoadingMore(false);
      }
    },
    [buildListUrl, t],
  );

  const filterEffectKey = useMemo(
    () =>
      JSON.stringify({
        sort,
        q: debouncedQuery,
        st: [...statusFilter].sort().join(","),
        cat: [...categoryFilter].sort().join(","),
      }),
    [sort, debouncedQuery, statusFilter, categoryFilter],
  );

  const fetchListRef = useRef(fetchList);
  fetchListRef.current = fetchList;

  useEffect(() => {
    if (skipNextFilterFetch.current) {
      skipNextFilterFetch.current = false;
      return;
    }
    void fetchListRef.current(true);
  }, [filterEffectKey]);

  async function duplicateTemplate(tpl: MessageTemplateRecord) {
    if (!manage) return;
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
        toast.warning(t("duplicateSnapshotMissing"));
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
      toast.error(data.error ?? t("duplicateError"));
      return;
    }
    toast.success(t("duplicateOk"));
    router.refresh();
    void fetchList(true);
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
      const res = await fetch(
        `/api/t/${tenantId}/templates/drafts/${encodeURIComponent(uuid)}`,
        { method: "DELETE" },
      );
      const data = (await res.json()) as { error?: string };
      setActionId(null);
      if (!res.ok) {
        toast.error(data.error ?? t("deleteError"));
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== tpl.id));
      toast.success(t("deleteOkDraft"));
      router.refresh();
      void fetchList(true);
      return;
    }

    setActionId(tpl.id);
    const res = await fetch(
      `/api/t/${tenantId}/templates/${encodeURIComponent(tpl.id)}`,
      { method: "DELETE" },
    );
    const data = (await res.json()) as { error?: string };
    setActionId(null);
    if (!res.ok) {
      toast.error(data.error ?? t("deleteError"));
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== tpl.id));
    toast.success(t("deleteOk"));
    router.refresh();
    void fetchList(true);
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

  const showError =
    initialError ??
    listError ??
    (!integrationConfigured ? t("noIntegration") : null);

  const hasRows = rows.length > 0;
  const canLoadMore = Boolean(nextCursor) && !listLoading;
  const filtersActive =
    statusFilter.size > 0 ||
    categoryFilter.size > 0 ||
    Boolean(debouncedQuery);

  return (
    <div className="space-y-8 pb-10">
      <header className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-md">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.55]"
          style={{
            backgroundImage: `
              linear-gradient(118deg, rgb(13 148 136 / 0.16) 0%, transparent 42%),
              linear-gradient(305deg, rgb(59 130 246 / 0.09) 0%, transparent 46%),
              radial-gradient(ellipse 85% 70% at 92% -10%, rgb(20 184 166 / 0.14), transparent 72%)
            `,
          }}
        />
        <div className="relative flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="flex gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-lg ring-2 ring-teal-300/35">
              <LayoutTemplate className="h-7 w-7" strokeWidth={1.5} aria-hidden />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">
                {t("title")}
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-fg-secondary">
                {t("subtitle")}
              </p>
            </div>
          </div>
          {manage ? (
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
              <Link
                href={`/${tenantId}/templates/new`}
                className="ds-btn-primary inline-flex items-center justify-center gap-2"
              >
                <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
                {t("createTemplate")}
              </Link>
            </div>
          ) : null}
        </div>
      </header>

      {showError ? <div className="ds-alert-warning">{showError}</div> : null}

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
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
              <label className="flex items-center gap-2 text-sm text-fg-secondary">
                <span>{t("sortLabel")}</span>
                <select
                  className="ds-select mt-0 h-9 min-w-[160px]"
                  value={sort}
                  onChange={(e) =>
                    setSort(e.target.value as TemplatesListSortKey)
                  }
                >
                  <option value="recent">{t("sortRecent")}</option>
                  <option value="nameAsc">{t("sortNameAsc")}</option>
                  <option value="nameDesc">{t("sortNameDesc")}</option>
                </select>
              </label>
            </div>
          </div>

          <div>
            <p className="ds-label mb-2">{t("filterStatusLabel")}</p>
            <div className="flex flex-wrap gap-2">
              {TEMPLATE_FILTER_STATUS_VALUES.map((code) => {
                const active = statusFilter.has(code);
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() =>
                      setStatusFilter((prev) => toggleInSet(prev, code))
                    }
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      active
                        ? "border-primary-300 bg-primary-50 text-primary-800"
                        : "border-border bg-neutral-50 text-fg-secondary hover:bg-neutral-100"
                    }`}
                  >
                    {statusLabel(code, t as (key: string) => string)}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="ds-label mb-2">{t("filterCategoryLabel")}</p>
            <div className="flex flex-wrap gap-2">
              {TEMPLATE_FILTER_CATEGORY_VALUES.map((code) => {
                const active = categoryFilter.has(code);
                const labelKey =
                  code === "MARKETING"
                    ? "category.marketing"
                    : code === "UTILITY"
                      ? "category.utility"
                      : "category.authentication";
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() =>
                      setCategoryFilter((prev) => toggleInSet(prev, code))
                    }
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      active
                        ? "border-primary-300 bg-primary-50 text-primary-800"
                        : "border-border bg-neutral-50 text-fg-secondary hover:bg-neutral-100"
                    }`}
                  >
                    {t(labelKey)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm text-fg-secondary">
            <span>
              {listLoading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  {t("loading")}
                </span>
              ) : (
                t("listCount", { shown: rows.length, total })
              )}
            </span>
            {(statusFilter.size > 0 ||
              categoryFilter.size > 0 ||
              debouncedQuery) && (
              <button
                type="button"
                className="text-primary-600 hover:underline"
                onClick={() => {
                  setStatusFilter(new Set());
                  setCategoryFilter(new Set());
                  setQuery("");
                  setDebouncedQuery("");
                }}
              >
                {t("clearFilters")}
              </button>
            )}
          </div>
        </div>
      </section>

      {!showError && !listLoading && !hasRows ? (
        <p className="ds-subtitle">
          {filtersActive ? t("emptyFiltered") : t("empty")}
        </p>
      ) : null}

      {hasRows ? (
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
              {rows.map((tpl) => {
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

      {canLoadMore ? (
        <div className="flex justify-center">
          <button
            type="button"
            disabled={loadingMore}
            onClick={() => void fetchList(false)}
            className="ds-btn-secondary ds-btn-sm inline-flex items-center gap-2"
          >
            {loadingMore ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            {t("loadMore")}
          </button>
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
        onSaved={() => {
          router.refresh();
          void fetchList(true);
        }}
      />
    </div>
  );
}
