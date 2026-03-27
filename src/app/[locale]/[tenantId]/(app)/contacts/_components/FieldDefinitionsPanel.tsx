"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CircleHelp,
  MoreVertical,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { ContactCustomFieldDefDto } from "@/lib/contacts/queries";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";

function readConfigDescription(config: unknown): string {
  if (!config || typeof config !== "object") return "";
  const d = (config as { description?: unknown }).description;
  return typeof d === "string" ? d : "";
}

function defaultValueToInputString(fieldType: string, v: unknown): string {
  if (v === null || v === undefined) return "";
  if (fieldType === "boolean") {
    if (v === true) return "true";
    if (v === false) return "false";
    return "";
  }
  return String(v);
}

function FieldDefaultInput({
  fieldType,
  value,
  onChange,
  t,
}: {
  fieldType: string;
  value: string;
  onChange: (v: string) => void;
  t: (k: string) => string;
}) {
  if (fieldType === "boolean") {
    return (
      <select
        className="ds-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{t("emptyOption")}</option>
        <option value="true">{t("yes")}</option>
        <option value="false">{t("no")}</option>
      </select>
    );
  }
  if (fieldType === "date") {
    return (
      <input
        type="date"
        className="ds-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (fieldType === "number") {
    return (
      <input
        type="number"
        step="any"
        className="ds-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <input
      className="ds-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function ColHelp({ label }: { label: string }) {
  if (!label.trim()) return null;
  return (
    <span
      className="group relative ml-1 inline-flex align-middle rounded outline-none focus-visible:ring-2 focus-visible:ring-primary-500/80"
      tabIndex={0}
      aria-label={label}
    >
      <span className="inline-flex cursor-help text-fg-muted group-hover:text-fg">
        <CircleHelp className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
      </span>
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute left-1/2 top-full z-50 mt-1.5 w-max max-w-[min(280px,calc(100vw-2rem))] -translate-x-1/2 rounded-md border border-border bg-fg px-2.5 py-1.5 text-left text-xs font-normal leading-snug text-card shadow-lg opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}

function HintIcon({ label }: { label: string }) {
  if (!label.trim()) return null;
  return (
    <span
      className="group relative ml-1 inline-flex align-middle rounded outline-none focus-visible:ring-2 focus-visible:ring-primary-500/80"
      tabIndex={0}
      aria-label={label}
    >
      <span className="inline-flex cursor-help text-fg-muted group-hover:text-fg">
        <CircleHelp className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
      </span>
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute bottom-full left-0 z-50 mb-1.5 w-max max-w-[min(280px,calc(100vw-2rem))] rounded-md border border-border bg-fg px-2.5 py-1.5 text-left text-xs font-normal leading-snug text-card shadow-lg opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}

type Props = {
  tenantId: string;
  readOnly: boolean;
  refreshTrigger: number;
  onUpdated: () => void;
};

type PageResponse = {
  definitions: ContactCustomFieldDefDto[];
  total: number;
  page: number;
  pageSize: number;
};

type RowMenuState = {
  def: ContactCustomFieldDefDto;
  style: CSSProperties;
};

export function FieldDefinitionsPanel({
  tenantId,
  readOnly,
  refreshTrigger,
  onUpdated,
}: Props) {
  const t = useTranslations("app.contacts");
  const api = `/api/t/${tenantId}/contacts/field-definitions`;

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [rows, setRows] = useState<ContactCustomFieldDefDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [rowMenu, setRowMenu] = useState<RowMenuState | null>(null);
  const rowMenuPortalRef = useRef<HTMLDivElement>(null);
  const rowMenuAnchorRef = useRef<HTMLButtonElement | null>(null);

  const [modal, setModal] = useState<
    | { mode: "create" }
    | { mode: "edit"; def: ContactCustomFieldDefDto }
    | null
  >(null);
  const [fdLabel, setFdLabel] = useState("");
  const [fdType, setFdType] = useState("text");
  const [fdDescription, setFdDescription] = useState("");
  const [fdDefault, setFdDefault] = useState("");
  const [fdErr, setFdErr] = useState<string | null>(null);
  const [fdBusy, setFdBusy] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(searchInput.trim()), 320);
    return () => clearTimeout(id);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ]);

  const fetchPage = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      q: debouncedQ,
    });
    const res = await fetch(`${api}?${params}`);
    setLoading(false);
    if (!res.ok) {
      setLoadErr(t("fieldsLoadError"));
      setRows([]);
      setTotal(0);
      return;
    }
    const j = (await res.json()) as PageResponse;
    setRows(j.definitions);
    setTotal(j.total);
  }, [api, page, pageSize, debouncedQ, t]);

  useEffect(() => {
    void fetchPage();
  }, [fetchPage, refreshTrigger]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(total / pageSize) || 1);
    if (total >= 0 && page > maxPage) setPage(maxPage);
  }, [total, pageSize, page]);

  const closeRowMenu = useCallback(() => {
    setRowMenu(null);
    rowMenuAnchorRef.current = null;
  }, []);

  const toggleRowMenu = useCallback(
    (d: ContactCustomFieldDefDto, anchor: HTMLButtonElement) => {
      setRowMenu((prev) => {
        if (prev?.def.id === d.id) {
          rowMenuAnchorRef.current = null;
          return null;
        }
        rowMenuAnchorRef.current = anchor;
        const rect = anchor.getBoundingClientRect();
        return {
          def: d,
          style: {
            position: "fixed",
            top: rect.bottom + 4,
            left: rect.right,
            transform: "translateX(-100%)",
            minWidth: 148,
            zIndex: 200,
          },
        };
      });
    },
    [],
  );

  useEffect(() => {
    if (!rowMenu) return;
    const onPointerDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rowMenuPortalRef.current?.contains(t)) return;
      if (rowMenuAnchorRef.current?.contains(t)) return;
      closeRowMenu();
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [rowMenu, closeRowMenu]);

  useEffect(() => {
    if (!rowMenu) return;
    const onScrollOrResize = () => {
      closeRowMenu();
    };
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [rowMenu, closeRowMenu]);

  function openCreateModal() {
    setFdLabel("");
    setFdType("text");
    setFdDescription("");
    setFdDefault("");
    setFdErr(null);
    setModal({ mode: "create" });
  }

  function openEditModal(def: ContactCustomFieldDefDto) {
    setFdLabel(def.label);
    setFdType(def.fieldType);
    setFdDescription(readConfigDescription(def.config));
    setFdDefault(defaultValueToInputString(def.fieldType, def.defaultValue));
    setFdErr(null);
    setModal({ mode: "edit", def });
    closeRowMenu();
  }

  function closeModal() {
    if (fdBusy) return;
    setModal(null);
  }

  async function submitModal(e: React.FormEvent) {
    e.preventDefault();
    setFdErr(null);
    setFdBusy(true);

    let defaultValue: unknown = null;
    const s = fdDefault.trim();
    if (fdType === "boolean") {
      if (fdDefault === "true") defaultValue = true;
      else if (fdDefault === "false") defaultValue = false;
    } else if (s !== "") {
      defaultValue = fdType === "number" ? Number.parseFloat(s) : s;
    }

    if (modal?.mode === "create") {
      const res = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: fdLabel.trim(),
          fieldType: fdType,
          config: null,
          defaultValue,
          description: fdDescription.trim() || undefined,
        }),
      });
      setFdBusy(false);
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        setFdErr(j.error ?? t("fieldCreateError"));
        return;
      }
      setModal(null);
      onUpdated();
      return;
    }

    if (modal?.mode === "edit") {
      const res = await fetch(`${api}/${modal.def.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: fdLabel.trim(),
          description: fdDescription.trim() || null,
          defaultValue,
        }),
      });
      setFdBusy(false);
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        setFdErr(j.error ?? t("fieldsSaveError"));
        return;
      }
      setModal(null);
      onUpdated();
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    const res = await fetch(`${api}/${deleteTarget.id}`, {
      method: "DELETE",
    });
    setDeleteBusy(false);
    if (!res.ok) return;
    setDeleteTarget(null);
    onUpdated();
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const from =
    total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);

  const fieldTypeLabel = (ft: string) => {
    switch (ft) {
      case "text":
        return t("fieldsTypeText");
      case "number":
        return t("fieldsTypeNumber");
      case "boolean":
        return t("fieldsTypeBoolean");
      case "date":
        return t("fieldsTypeDate");
      default:
        return ft;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <h2 className="font-display text-xl font-bold tracking-tight text-fg sm:text-2xl">
            {t("fieldsTabTitle")}
          </h2>
          <p className="max-w-2xl text-sm leading-relaxed text-fg-secondary">
            {t("fieldsTabSubtitle")}
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center lg:w-auto lg:shrink-0">
          <div className="relative flex-1 sm:min-w-[260px] sm:flex-initial">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted"
              strokeWidth={1.5}
              aria-hidden
            />
            <input
              type="search"
              className="ds-input w-full pl-9"
              placeholder={t("fieldsSearchPlaceholder")}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label={t("fieldsSearchPlaceholder")}
            />
          </div>
          {!readOnly ? (
            <button
              type="button"
              className="ds-btn-primary inline-flex shrink-0 items-center justify-center gap-2"
              onClick={openCreateModal}
            >
              <Plus className="h-4 w-4" strokeWidth={2} />
              {t("fieldsNewButton")}
            </button>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="ds-table-wrap border-b border-border">
          <table className="ds-table min-w-[640px] w-full">
            <thead>
              <tr>
                <th className="text-left">
                  <span className="inline-flex items-center">
                    {t("fieldsColFieldName")}
                    <ColHelp label={t("fieldsHelpName")} />
                  </span>
                </th>
                <th className="text-left">
                  <span className="inline-flex items-center">
                    {t("fieldsColType")}
                    <ColHelp label={t("fieldsHelpType")} />
                  </span>
                </th>
                <th className="text-left">
                  <span className="inline-flex items-center">
                    {t("fieldsColDescription")}
                    <ColHelp label={t("fieldsHelpDescription")} />
                  </span>
                </th>
                <th className="w-12 text-right">
                  <span className="sr-only">{t("colActions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-sm text-fg-muted">
                    {t("fieldsLoading")}
                  </td>
                </tr>
              ) : loadErr ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-sm text-danger">
                    {loadErr}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-sm text-fg-muted">
                    {t("fieldsEmpty")}
                  </td>
                </tr>
              ) : (
                rows.map((d) => {
                  const desc = readConfigDescription(d.config);
                  return (
                    <tr key={d.id}>
                      <td>
                        <p className="font-medium text-fg">{d.label}</p>
                        <p className="mt-0.5 font-mono text-[11px] text-fg-muted">
                          {d.key}
                        </p>
                      </td>
                      <td className="text-fg-secondary">
                        {fieldTypeLabel(d.fieldType)}
                      </td>
                      <td className="max-w-[280px] text-sm text-fg-secondary">
                        {desc ? (
                          <span className="line-clamp-2">{desc}</span>
                        ) : (
                          <span className="text-fg-muted italic">
                            {t("fieldsNoDescription")}
                          </span>
                        )}
                      </td>
                      <td className="text-right">
                        {!readOnly ? (
                          <div className="flex justify-end">
                            <button
                              type="button"
                              className="ds-btn-ghost rounded-lg p-2"
                              aria-expanded={rowMenu?.def.id === d.id}
                              aria-haspopup="menu"
                              aria-label={t("fieldsOpenMenu")}
                              onClick={(e) => toggleRowMenu(d, e.currentTarget)}
                            >
                              <MoreVertical
                                className="h-4 w-4"
                                strokeWidth={1.5}
                              />
                            </button>
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex flex-wrap items-center gap-2 text-sm text-fg-secondary">
            <label className="inline-flex items-center gap-2">
              <span className="whitespace-nowrap">{t("fieldsPerPage")}</span>
              <select
                className="ds-select py-1.5 text-sm"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </label>
          </div>
          <p className="text-sm tabular-nums text-fg-secondary">
            {t("fieldsRange", { from, to, total })}
          </p>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className="ds-btn-outline px-3 py-1.5 text-sm"
              disabled={safePage <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t("fieldsPrev")}
            </button>
            <button
              type="button"
              className="ds-btn-outline px-3 py-1.5 text-sm"
              disabled={safePage >= totalPages || loading || total === 0}
              onClick={() => setPage((p) => p + 1)}
            >
              {t("fieldsNext")}
            </button>
          </div>
        </div>
      </div>

      {rowMenu
        ? createPortal(
            <div
              ref={rowMenuPortalRef}
              className="rounded-lg border border-border bg-card py-1 shadow-lg"
              style={rowMenu.style}
              role="menu"
            >
              <button
                type="button"
                role="menuitem"
                className="flex w-full px-3 py-2 text-left text-sm text-fg hover:bg-neutral-50"
                onClick={() => openEditModal(rowMenu.def)}
              >
                {t("fieldsEdit")}
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full px-3 py-2 text-left text-sm text-danger hover:bg-danger-soft"
                onClick={() => {
                  closeRowMenu();
                  setDeleteTarget({
                    id: rowMenu.def.id,
                    label: rowMenu.def.label,
                  });
                }}
              >
                {t("fieldsDelete")}
              </button>
            </div>,
            document.body,
          )
        : null}

      {modal ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-fg/30 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="field-modal-title"
          onClick={() => closeModal()}
        >
          <div
            className="max-h-[min(90vh,720px)] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-start justify-between gap-4 border-b border-border bg-card px-6 py-4">
              <h3
                id="field-modal-title"
                className="font-display text-lg font-semibold text-fg pr-8"
              >
                {modal.mode === "create"
                  ? t("modalCreateFieldTitle")
                  : t("modalEditFieldTitle")}
              </h3>
              <button
                type="button"
                className="ds-btn-ghost absolute right-3 top-3 rounded-lg p-2"
                aria-label={t("close")}
                onClick={() => closeModal()}
              >
                <X className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </div>
            <p className="border-b border-border px-6 py-4 text-sm leading-relaxed text-fg-secondary">
              {t("modalFieldIntro")}
            </p>
            <form
              onSubmit={(e) => void submitModal(e)}
              className="space-y-4 px-6 py-5"
            >
              <label className="ds-label">
                <span className="inline-flex items-center">
                  {t("modalFieldNameRequired")}
                  <HintIcon label={t("fieldsHelpName")} />
                </span>
                <input
                  className="ds-input"
                  value={fdLabel}
                  onChange={(e) => setFdLabel(e.target.value)}
                  required
                  maxLength={100}
                />
              </label>
              <label className="ds-label">
                <span className="inline-flex items-center">
                  {t("fieldType")}
                  <HintIcon label={t("fieldsHelpType")} />
                </span>
                {modal.mode === "create" ? (
                  <select
                    className="ds-select"
                    value={fdType}
                    onChange={(e) => {
                      setFdType(e.target.value);
                      setFdDefault("");
                    }}
                  >
                    <option value="text">{t("fieldsTypeText")}</option>
                    <option value="number">{t("fieldsTypeNumber")}</option>
                    <option value="boolean">{t("fieldsTypeBoolean")}</option>
                    <option value="date">{t("fieldsTypeDate")}</option>
                  </select>
                ) : (
                  <p className="rounded-lg border border-border bg-neutral-50/80 px-3 py-2 text-sm text-fg-secondary">
                    {fieldTypeLabel(modal.def.fieldType)}
                  </p>
                )}
              </label>
              <label className="ds-label">
                <span className="inline-flex items-center">
                  {t("modalFieldDescriptionOptional")}
                  <HintIcon label={t("fieldsHelpDescription")} />
                </span>
                <textarea
                  className="ds-input min-h-[88px] resize-y"
                  value={fdDescription}
                  onChange={(e) => setFdDescription(e.target.value)}
                  maxLength={2000}
                  placeholder={t("fieldDescriptionPlaceholder")}
                />
              </label>
              <label className="ds-label">
                {t("fieldDefaultLabel")}
                <FieldDefaultInput
                  fieldType={fdType}
                  value={fdDefault}
                  onChange={setFdDefault}
                  t={t}
                />
                <span className="mt-1 block text-xs text-fg-muted">
                  {t("fieldDefaultHint")}
                </span>
              </label>
              {fdErr ? <p className="text-sm text-danger">{fdErr}</p> : null}
              <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  className="ds-btn-outline"
                  disabled={fdBusy}
                  onClick={() => closeModal()}
                >
                  {t("cancel")}
                </button>
                <button type="submit" className="ds-btn-primary" disabled={fdBusy}>
                  {fdBusy
                    ? t("saving")
                    : modal.mode === "create"
                      ? t("modalCreateSubmit")
                      : t("save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <DeleteConfirmDialog
          title={t("confirmDeleteFieldTitle")}
          body={t("confirmDeleteFieldBody", { name: deleteTarget.label })}
          confirmLabel={deleteBusy ? t("deleting") : t("deleteConfirm")}
          cancelLabel={t("cancel")}
          busy={deleteBusy}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleteTarget(null)}
        />
      ) : null}
    </div>
  );
}
