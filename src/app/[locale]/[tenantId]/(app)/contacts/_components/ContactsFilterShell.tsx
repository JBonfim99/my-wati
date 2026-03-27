"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Filter,
  ListOrdered,
  Mail,
  Phone,
  Search,
  Tag as TagIcon,
  User,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  CUSTOM_FILTER_OPS_BY_TYPE,
  SYSTEM_FIELD_OPS,
  customOpNeedsValue,
  defaultCustomOpForType,
  systemFieldOpNeedsValue,
} from "@/lib/contacts/filter-operators";
import type { FieldType } from "@/lib/contacts/validate-custom-value";
import {
  addCustomFieldCondition,
  addFieldCondition,
  addListCondition,
  addTagCondition,
  countMeaningfulFilterParts,
  type ContactFilterCondition,
  type ContactsListFilterState,
  type ListFilterOp,
} from "./contacts-list-query";

type TagOpt = { id: number; name: string };
type ListOpt = { id: number; name: string };
type FieldDefOpt = { id: string; label: string; fieldType: FieldType };

type CategoryId = "general" | "system" | "custom";

type Props = {
  allTags: TagOpt[];
  allLists: ListOpt[];
  fieldDefs: FieldDefOpt[];
  value: ContactsListFilterState;
  onChange: (next: ContactsListFilterState) => void;
  onApply: () => void;
  onClear: () => void;
  applying: boolean;
  hasActiveFilters: boolean;
  panelOpen: boolean;
  onPanelOpenChange: (open: boolean) => void;
  selectedCount: number;
  totalCount: number | null;
  readOnly: boolean;
  onBulkDeleteClick: () => void;
  onBulkAddTagClick: () => void;
  onBulkRemoveTagClick: () => void;
  onBulkSetCustomClick: () => void;
  onBulkClearCustomClick: () => void;
  onBulkExportCsvClick: () => void;
  onBulkAddListClick: () => void;
  onBulkRemoveListClick: () => void;
};

export function ContactsFilterShell({
  allTags,
  allLists,
  fieldDefs,
  value,
  onChange,
  onApply,
  onClear,
  applying,
  hasActiveFilters,
  panelOpen,
  onPanelOpenChange,
  selectedCount,
  totalCount,
  readOnly,
  onBulkDeleteClick,
  onBulkAddTagClick,
  onBulkRemoveTagClick,
  onBulkSetCustomClick,
  onBulkClearCustomClick,
  onBulkExportCsvClick,
  onBulkAddListClick,
  onBulkRemoveListClick,
}: Props) {
  const t = useTranslations("app.contacts");
  const [addOpen, setAddOpen] = useState(false);
  const [category, setCategory] = useState<CategoryId>("general");
  const [pickerSearch, setPickerSearch] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!addOpen) return;
    function onDoc(e: MouseEvent) {
      const el = popoverRef.current;
      if (el && !el.contains(e.target as Node)) setAddOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [addOpen]);

  const sortedTags = useMemo(
    () => [...allTags].sort((a, b) => a.name.localeCompare(b.name)),
    [allTags],
  );

  const sortedLists = useMemo(
    () => [...allLists].sort((a, b) => a.name.localeCompare(b.name)),
    [allLists],
  );

  const sortedFieldDefs = useMemo(
    () => [...fieldDefs].sort((a, b) => a.label.localeCompare(b.label)),
    [fieldDefs],
  );

  const meaningfulPartCount = useMemo(
    () => countMeaningfulFilterParts(value),
    [value],
  );

  const pickerQ = pickerSearch.trim().toLowerCase();

  const categories = (
    [
      { id: "general" as const, label: t("filterCategoryGeneral") },
      { id: "system" as const, label: t("filterCategorySystem") },
      { id: "custom" as const, label: t("filterCategoryCustom") },
    ] satisfies { id: CategoryId; label: string }[]
  ).filter((c) => !pickerQ || c.label.toLowerCase().includes(pickerQ));

  const generalOptions = useMemo(
    () => [
      { id: "tag" as const, label: t("filterFieldTag"), Icon: TagIcon },
      { id: "list" as const, label: t("filterFieldList"), Icon: ListOrdered },
    ],
    [t],
  );

  const systemOptions = useMemo(
    () => [
      {
        id: "phone" as const,
        label: t("filterFieldPhoneContains"),
        Icon: Phone,
      },
      { id: "name" as const, label: t("filterFieldNameContains"), Icon: User },
      {
        id: "email" as const,
        label: t("filterFieldEmailContains"),
        Icon: Mail,
      },
    ],
    [t],
  );

  function removeCondition(id: string) {
    onChange({
      ...value,
      conditions: value.conditions.filter((c) => c.id !== id),
    });
  }

  function patchCondition(
    id: string,
    updater: (c: ContactFilterCondition) => ContactFilterCondition,
  ) {
    onChange({
      ...value,
      conditions: value.conditions.map((c) => (c.id === id ? updater(c) : c)),
    });
  }

  function pickOption(kind: "tag" | "list" | "phone" | "name" | "email") {
    setAddOpen(false);
    setPickerSearch("");
    if (kind === "tag") {
      onChange(addTagCondition(value));
    } else if (kind === "list") {
      onChange(addListCondition(value));
    } else {
      onChange(addFieldCondition(value, kind));
    }
  }

  function pickCustomField(fieldId: string) {
    const d = sortedFieldDefs.find((x) => x.id === fieldId);
    if (!d) return;
    setAddOpen(false);
    setPickerSearch("");
    onChange(addCustomFieldCondition(value, fieldId, d.fieldType));
  }

  function customOpLabel(op: string): string {
    const map: Record<string, string> = {
      eq: t("filterOpEq"),
      ne: t("filterOpNe"),
      contains: t("filterOpContains"),
      not_contains: t("filterOpNotContains"),
      empty: t("filterOpEmpty"),
      not_empty: t("filterOpNotEmpty"),
      gte: t("filterOpGte"),
      lte: t("filterOpLte"),
      is_true: t("filterOpIsTrue"),
      is_false: t("filterOpIsFalse"),
      before: t("filterOpBefore"),
      after: t("filterOpAfter"),
      on: t("filterOpOn"),
    };
    return map[op] ?? op;
  }

  function systemOpLabel(op: string): string {
    return customOpLabel(op);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 border-b border-border pb-3">
        <button
          type="button"
          onClick={() => onPanelOpenChange(!panelOpen)}
          className={`ds-btn-outline inline-flex shrink-0 items-center gap-2 py-2 text-sm font-semibold ${
            panelOpen
              ? "border-primary-400 bg-primary-50/90 text-primary-800"
              : ""
          }`}
          aria-expanded={panelOpen}
        >
          <Filter className="h-4 w-4 shrink-0" strokeWidth={1.5} />
          {t("filterToggle")}
        </button>

        <div className="relative min-w-[min(100%,220px)] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted"
            strokeWidth={1.5}
            aria-hidden
          />
          <input
            type="search"
            className="ds-input w-full pl-9"
            value={value.toolbarSearch}
            onChange={(e) =>
              onChange({ ...value, toolbarSearch: e.target.value })
            }
            placeholder={t("filterToolbarSearchPlaceholder")}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onApply();
              }
            }}
            disabled={applying}
          />
        </div>

        <p className="text-sm text-fg-secondary whitespace-nowrap">
          {t("filterSelectionSummary", {
            selected: selectedCount,
            total: totalCount === null ? "—" : String(totalCount),
          })}
        </p>

        {!readOnly ? (
          <details className="relative shrink-0">
            <summary
              className="ds-btn-outline inline-flex cursor-pointer list-none items-center gap-1.5 py-2 text-sm [&::-webkit-details-marker]:hidden"
              {...(selectedCount === 0 ? { "aria-disabled": true } : {})}
            >
              {t("bulkActions")}
              <ChevronDown className="h-4 w-4" strokeWidth={1.5} />
            </summary>
            <div className="absolute right-0 top-full z-30 mt-1 min-w-[220px] rounded-lg border border-border bg-card py-1 shadow-lg">
              <button
                type="button"
                className="flex w-full px-3 py-2 text-left text-sm hover:bg-neutral-100 disabled:pointer-events-none disabled:opacity-40"
                disabled={selectedCount === 0}
                onClick={(e) => {
                  (
                    e.currentTarget.closest(
                      "details",
                    ) as HTMLDetailsElement | null
                  )?.removeAttribute("open");
                  onBulkAddTagClick();
                }}
              >
                {t("bulkAddTag")}
              </button>
              <button
                type="button"
                className="flex w-full px-3 py-2 text-left text-sm hover:bg-neutral-100 disabled:pointer-events-none disabled:opacity-40"
                disabled={selectedCount === 0}
                onClick={(e) => {
                  (
                    e.currentTarget.closest(
                      "details",
                    ) as HTMLDetailsElement | null
                  )?.removeAttribute("open");
                  onBulkRemoveTagClick();
                }}
              >
                {t("bulkRemoveTag")}
              </button>
              <button
                type="button"
                className="flex w-full px-3 py-2 text-left text-sm hover:bg-neutral-100 disabled:pointer-events-none disabled:opacity-40"
                disabled={selectedCount === 0}
                onClick={(e) => {
                  (
                    e.currentTarget.closest(
                      "details",
                    ) as HTMLDetailsElement | null
                  )?.removeAttribute("open");
                  onBulkAddListClick();
                }}
              >
                {t("bulkAddList")}
              </button>
              <button
                type="button"
                className="flex w-full px-3 py-2 text-left text-sm hover:bg-neutral-100 disabled:pointer-events-none disabled:opacity-40"
                disabled={selectedCount === 0}
                onClick={(e) => {
                  (
                    e.currentTarget.closest(
                      "details",
                    ) as HTMLDetailsElement | null
                  )?.removeAttribute("open");
                  onBulkRemoveListClick();
                }}
              >
                {t("bulkRemoveList")}
              </button>
              <button
                type="button"
                className="flex w-full px-3 py-2 text-left text-sm hover:bg-neutral-100 disabled:pointer-events-none disabled:opacity-40"
                disabled={selectedCount === 0}
                onClick={(e) => {
                  (
                    e.currentTarget.closest(
                      "details",
                    ) as HTMLDetailsElement | null
                  )?.removeAttribute("open");
                  onBulkSetCustomClick();
                }}
              >
                {t("bulkSetCustom")}
              </button>
              <button
                type="button"
                className="flex w-full px-3 py-2 text-left text-sm hover:bg-neutral-100 disabled:pointer-events-none disabled:opacity-40"
                disabled={selectedCount === 0}
                onClick={(e) => {
                  (
                    e.currentTarget.closest(
                      "details",
                    ) as HTMLDetailsElement | null
                  )?.removeAttribute("open");
                  onBulkClearCustomClick();
                }}
              >
                {t("bulkClearCustom")}
              </button>
              <button
                type="button"
                className="flex w-full px-3 py-2 text-left text-sm hover:bg-neutral-100 disabled:pointer-events-none disabled:opacity-40"
                disabled={selectedCount === 0}
                onClick={(e) => {
                  (
                    e.currentTarget.closest(
                      "details",
                    ) as HTMLDetailsElement | null
                  )?.removeAttribute("open");
                  onBulkExportCsvClick();
                }}
              >
                {t("bulkExportCsv")}
              </button>
              <div className="my-1 border-t border-border" />
              <button
                type="button"
                className="flex w-full px-3 py-2 text-left text-sm text-danger hover:bg-danger-soft disabled:pointer-events-none disabled:opacity-40"
                disabled={selectedCount === 0}
                onClick={(e) => {
                  (
                    e.currentTarget.closest(
                      "details",
                    ) as HTMLDetailsElement | null
                  )?.removeAttribute("open");
                  onBulkDeleteClick();
                }}
              >
                {t("bulkDelete")}
              </button>
            </div>
          </details>
        ) : null}
      </div>

      {panelOpen ? (
        <div className="rounded-xl border border-dashed border-border bg-neutral-50/40 p-4">
          <div className="mb-3 flex flex-wrap items-baseline gap-1 text-sm text-fg-secondary">
            <span>{t("filterConditionMatchIntro")}</span>
            <button
              type="button"
              className={`font-semibold underline decoration-dotted underline-offset-2 ${
                value.conditionMatch === "all"
                  ? "text-primary-700"
                  : "text-fg-muted"
              }`}
              onClick={() => onChange({ ...value, conditionMatch: "all" })}
            >
              {t("filterMatchAll")}
            </button>
            <span>{t("filterMatchOr")}</span>
            <button
              type="button"
              className={`font-semibold underline decoration-dotted underline-offset-2 ${
                value.conditionMatch === "any"
                  ? "text-primary-700"
                  : "text-fg-muted"
              }`}
              onClick={() => onChange({ ...value, conditionMatch: "any" })}
            >
              {t("filterMatchAny")}
            </button>
            <span>{t("filterConditionMatchSuffix")}</span>
          </div>

          <div className="space-y-3">
            {value.conditions.length === 0 ? (
              <p className="py-6 text-center text-sm text-fg-muted">
                {t("filterNoConditions")}
              </p>
            ) : (
              value.conditions.map((c) => (
                <div
                  key={c.id}
                  className="relative rounded-xl border border-border bg-card p-4 pr-10 shadow-sm"
                >
                  <button
                    type="button"
                    className="absolute right-2 top-2 rounded-md p-1 text-fg-muted hover:bg-neutral-100 hover:text-fg"
                    aria-label={t("filterRemoveCondition")}
                    onClick={() => removeCondition(c.id)}
                  >
                    <X className="h-4 w-4" strokeWidth={1.5} />
                  </button>

                  {c.type === "tag" ? (
                    <>
                      <p className="text-xs font-semibold uppercase tracking-wide text-fg-secondary">
                        {t("filterFieldTag")}
                      </p>
                      <p className="mt-2 text-xs font-medium text-fg-secondary">
                        {t("filterOperatorLabel")}
                      </p>
                      <select
                        className="ds-input mt-1 max-w-full"
                        value={c.op}
                        onChange={(e) =>
                          patchCondition(c.id, (row) =>
                            row.type === "tag"
                              ? {
                                  ...row,
                                  op: e.target.value as "is" | "is_not",
                                }
                              : row,
                          )
                        }
                      >
                        <option value="is">{t("filterTagOpIs")}</option>
                        <option value="is_not">{t("filterTagOpIsNot")}</option>
                      </select>
                      <p className="mt-3 text-sm text-fg">{t("filterTagWhich")}</p>
                      <select
                        className="ds-input mt-2 max-w-full"
                        value={c.tagId}
                        onChange={(e) =>
                          patchCondition(c.id, (row) =>
                            row.type === "tag"
                              ? { ...row, tagId: e.target.value }
                              : row,
                          )
                        }
                      >
                        <option value="">{t("filterTagPick")}</option>
                        {sortedTags.map((tg) => (
                          <option key={tg.id} value={String(tg.id)}>
                            {tg.name}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : c.type === "list" ? (
                    <>
                      <p className="text-xs font-semibold uppercase tracking-wide text-fg-secondary">
                        {t("filterFieldList")}
                      </p>
                      <p className="mt-2 text-xs font-medium text-fg-secondary">
                        {t("filterOperatorLabel")}
                      </p>
                      <select
                        className="ds-input mt-1 max-w-full"
                        value={c.op}
                        onChange={(e) =>
                          patchCondition(c.id, (row) =>
                            row.type === "list"
                              ? {
                                  ...row,
                                  op: e.target.value as ListFilterOp,
                                }
                              : row,
                          )
                        }
                      >
                        <option value="in_any">
                          {t("filterListOpInAny")}
                        </option>
                        <option value="in_all">
                          {t("filterListOpInAll")}
                        </option>
                        <option value="not_in_all">
                          {t("filterListOpNotInAll")}
                        </option>
                        <option value="in_none">
                          {t("filterListOpInNone")}
                        </option>
                      </select>
                      <p className="mt-3 text-sm text-fg">
                        {t("filterListWhich")}
                      </p>
                      {sortedLists.length === 0 ? (
                        <p className="mt-2 text-sm text-fg-muted">
                          {t("filterNoListsInOrg")}
                        </p>
                      ) : (
                        <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border bg-neutral-50/50 p-2">
                          {sortedLists.map((lst) => {
                            const checked = c.listIds.includes(lst.id);
                            return (
                              <li key={lst.id}>
                                <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-neutral-100">
                                  <input
                                    type="checkbox"
                                    className="rounded border-border"
                                    checked={checked}
                                    onChange={() =>
                                      patchCondition(c.id, (row) => {
                                        if (row.type !== "list") return row;
                                        const next = new Set(row.listIds);
                                        if (next.has(lst.id))
                                          next.delete(lst.id);
                                        else next.add(lst.id);
                                        return {
                                          ...row,
                                          listIds: [...next],
                                        };
                                      })
                                    }
                                  />
                                  <span className="truncate">{lst.name}</span>
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </>
                  ) : c.type === "field" ? (
                    <>
                      <p className="text-xs font-semibold uppercase tracking-wide text-fg-secondary">
                        {c.field === "phone"
                          ? t("filterFieldPhoneShort")
                          : c.field === "name"
                            ? t("filterFieldNameShort")
                            : t("filterFieldEmailShort")}
                      </p>
                      <p className="mt-2 text-xs font-medium text-fg-secondary">
                        {t("filterOperatorLabel")}
                      </p>
                      <select
                        className="ds-input mt-1 max-w-full"
                        value={c.op}
                        onChange={(e) =>
                          patchCondition(c.id, (row) =>
                            row.type === "field"
                              ? {
                                  ...row,
                                  op: e.target.value as (typeof SYSTEM_FIELD_OPS)[number],
                                }
                              : row,
                          )
                        }
                      >
                        {SYSTEM_FIELD_OPS.map((op) => (
                          <option key={op} value={op}>
                            {systemOpLabel(op)}
                          </option>
                        ))}
                      </select>
                      {systemFieldOpNeedsValue(c.op) ? (
                        <>
                          <p className="mt-3 text-sm text-fg">
                            {t("filterValueLabel")}
                          </p>
                          <input
                            type="text"
                            className="ds-input mt-2 w-full max-w-md"
                            value={c.value}
                            onChange={(e) =>
                              patchCondition(c.id, (row) =>
                                row.type === "field"
                                  ? { ...row, value: e.target.value }
                                  : row,
                              )
                            }
                            placeholder={t("filterContainsPlaceholder")}
                          />
                        </>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <p className="text-xs font-semibold uppercase tracking-wide text-fg-secondary">
                        {t("filterCustomFieldShort")}
                      </p>
                      <p className="mt-1 text-sm text-fg">
                        {t("filterCustomFieldCardLabel")}
                      </p>
                      <select
                        className="ds-input mt-2 max-w-full"
                        value={c.fieldId}
                        onChange={(e) => {
                          const id = e.target.value;
                          const d = sortedFieldDefs.find((x) => x.id === id);
                          patchCondition(c.id, (row) =>
                            row.type === "custom" && d
                              ? {
                                  ...row,
                                  fieldId: id,
                                  fieldType: d.fieldType,
                                  op: defaultCustomOpForType(d.fieldType),
                                  value: "",
                                }
                              : row,
                          );
                        }}
                      >
                        <option value="">{t("filterCustomFieldPick")}</option>
                        {sortedFieldDefs.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                      <p className="mt-3 text-xs font-medium text-fg-secondary">
                        {t("filterOperatorLabel")}
                      </p>
                      <select
                        className="ds-input mt-1 max-w-full"
                        value={c.op}
                        onChange={(e) =>
                          patchCondition(c.id, (row) =>
                            row.type === "custom"
                              ? { ...row, op: e.target.value, value: "" }
                              : row,
                          )
                        }
                      >
                        {CUSTOM_FILTER_OPS_BY_TYPE[c.fieldType].map((op) => (
                          <option key={op} value={op}>
                            {customOpLabel(op)}
                          </option>
                        ))}
                      </select>
                      {customOpNeedsValue(c.fieldType, c.op) ? (
                        <>
                          <p className="mt-3 text-sm text-fg">
                            {t("filterValueLabel")}
                          </p>
                          {c.fieldType === "date" ? (
                            <input
                              type="date"
                              className="ds-input mt-2 w-full max-w-md"
                              value={c.value}
                              onChange={(e) =>
                                patchCondition(c.id, (row) =>
                                  row.type === "custom"
                                    ? { ...row, value: e.target.value }
                                    : row,
                                )
                              }
                            />
                          ) : c.fieldType === "number" ? (
                            <input
                              type="number"
                              step="any"
                              className="ds-input mt-2 w-full max-w-md"
                              value={c.value}
                              onChange={(e) =>
                                patchCondition(c.id, (row) =>
                                  row.type === "custom"
                                    ? { ...row, value: e.target.value }
                                    : row,
                                )
                              }
                            />
                          ) : (
                            <input
                              type="text"
                              className="ds-input mt-2 w-full max-w-md"
                              value={c.value}
                              onChange={(e) =>
                                patchCondition(c.id, (row) =>
                                  row.type === "custom"
                                    ? { ...row, value: e.target.value }
                                    : row,
                                )
                              }
                              placeholder={t("filterCustomValuePlaceholder")}
                            />
                          )}
                        </>
                      ) : null}
                    </>
                  )}
                </div>
              ))
            )}
          </div>

          {meaningfulPartCount > 1 ? (
            <p className="mt-3 text-xs text-fg-muted">
              {t("filterConditionMatchHint")}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="relative" ref={popoverRef}>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border bg-card px-3 py-2 text-sm font-medium text-fg-secondary hover:border-primary-300 hover:text-fg"
                onClick={() => setAddOpen((o) => !o)}
                aria-expanded={addOpen}
              >
                {t("filterAddCondition")}
              </button>
              {addOpen ? (
                <div className="absolute left-0 top-full z-40 mt-2 w-[min(calc(100vw-2rem),520px)] overflow-hidden rounded-xl border border-border bg-card shadow-xl">
                  <div className="border-b border-border p-2">
                    <div className="relative">
                      <Search
                        className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted"
                        strokeWidth={1.5}
                        aria-hidden
                      />
                      <input
                        type="search"
                        className="ds-input w-full pl-8 text-sm"
                        value={pickerSearch}
                        onChange={(e) => setPickerSearch(e.target.value)}
                        placeholder={t("filterPickerSearchPlaceholder")}
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="grid max-h-[min(50vh,320px)] grid-cols-[minmax(0,150px)_1fr] divide-x divide-border">
                    <nav
                      className="overflow-y-auto bg-neutral-50/80 p-1"
                      aria-label={t("filterPickerCategories")}
                    >
                      {categories.map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setCategory(cat.id)}
                          className={`flex w-full rounded-md px-2 py-2 text-left text-xs font-medium ${
                            category === cat.id
                              ? "bg-card text-fg shadow-sm ring-1 ring-border"
                              : "text-fg-secondary hover:bg-card/80"
                          }`}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </nav>
                    <div className="overflow-y-auto p-2">
                      {category === "general" ? (
                        <ul className="space-y-0.5">
                          {generalOptions
                            .filter(
                              (o) =>
                                !pickerQ ||
                                o.label.toLowerCase().includes(pickerQ),
                            )
                            .map((o) => (
                              <li key={o.id}>
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-neutral-100"
                                  onClick={() => pickOption(o.id)}
                                >
                                  <o.Icon
                                    className="h-4 w-4 shrink-0 text-fg-muted"
                                    strokeWidth={1.5}
                                  />
                                  {o.label}
                                </button>
                              </li>
                            ))}
                        </ul>
                      ) : null}
                      {category === "system" ? (
                        <ul className="space-y-0.5">
                          {systemOptions
                            .filter(
                              (o) =>
                                !pickerQ ||
                                o.label.toLowerCase().includes(pickerQ),
                            )
                            .map((o) => (
                              <li key={o.id}>
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-neutral-100"
                                  onClick={() => pickOption(o.id)}
                                >
                                  <o.Icon
                                    className="h-4 w-4 shrink-0 text-fg-muted"
                                    strokeWidth={1.5}
                                  />
                                  {o.label}
                                </button>
                              </li>
                            ))}
                        </ul>
                      ) : null}
                      {category === "custom" ? (
                        <div className="space-y-2 p-1">
                          <p className="text-xs text-fg-muted">
                            {t("filterCustomFieldPickerHint")}
                          </p>
                          {sortedFieldDefs.length > 0 ? (
                            <ul className="space-y-0.5 border-t border-border pt-2">
                              {sortedFieldDefs
                                .filter(
                                  (d) =>
                                    !pickerQ ||
                                    d.label.toLowerCase().includes(pickerQ),
                                )
                                .map((d) => (
                                  <li key={d.id}>
                                    <button
                                      type="button"
                                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-neutral-100"
                                      onClick={() => pickCustomField(d.id)}
                                    >
                                      <span className="truncate">{d.label}</span>
                                    </button>
                                  </li>
                                ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-fg-muted">
                              {t("filterCustomFieldEmptyOrg")}
                            </p>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              className="ds-btn-primary text-sm"
              disabled={applying}
              onClick={() => onApply()}
            >
              {applying ? t("filterApplying") : t("filterApply")}
            </button>
            {hasActiveFilters ? (
              <button
                type="button"
                className="text-sm font-medium text-fg-secondary hover:text-fg"
                disabled={applying}
                onClick={() => onClear()}
              >
                {t("filterClear")}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
