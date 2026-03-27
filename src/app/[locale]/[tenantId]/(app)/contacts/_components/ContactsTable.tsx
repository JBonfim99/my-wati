"use client";

import { useEffect, useRef } from "react";
import { ChevronDown, Pencil, Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { SerializedContactDto } from "@/lib/contacts/dto";

export type ContactsTableSelection = {
  selectedIds: Set<number>;
  onToggle: (id: number) => void;
  onToggleAllOnPage: () => void;
};

export type ContactsTableSelectionScopeMenu = {
  hasActiveFilters: boolean;
  onSelectFiltered: () => void;
  onSelectAllOrg: () => void;
  loading: boolean;
  filteredTotal: number;
  orgTotal: number;
};

function SelectionScopeMenuButton({
  menu,
  className,
}: {
  menu: ContactsTableSelectionScopeMenu;
  className?: string;
}) {
  const t = useTranslations("app.contacts");
  const detailsRef = useRef<HTMLDetailsElement>(null);
  function close() {
    const el = detailsRef.current;
    if (el) el.open = false;
  }
  return (
    <details ref={detailsRef} className={`relative ${className ?? ""}`}>
      <summary
        className="ds-btn-ghost flex h-8 w-8 shrink-0 cursor-pointer list-none items-center justify-center rounded-md p-0 [&::-webkit-details-marker]:hidden"
        aria-label={t("bulkSelectScopeMenu")}
      >
        <ChevronDown className="h-4 w-4" strokeWidth={1.5} />
      </summary>
      <div className="absolute left-0 top-full z-40 mt-1 min-w-[240px] rounded-lg border border-border bg-card py-1 shadow-lg">
        {menu.hasActiveFilters ? (
          <button
            type="button"
            className="flex w-full px-3 py-2 text-left text-sm hover:bg-neutral-100 disabled:pointer-events-none disabled:opacity-40"
            disabled={menu.loading}
            onClick={() => {
              close();
              menu.onSelectFiltered();
            }}
          >
            {t("bulkSelectAllFiltered", { count: menu.filteredTotal })}
          </button>
        ) : null}
        <button
          type="button"
          className="flex w-full px-3 py-2 text-left text-sm hover:bg-neutral-100 disabled:pointer-events-none disabled:opacity-40"
          disabled={menu.loading}
          onClick={() => {
            close();
            menu.onSelectAllOrg();
          }}
        >
          {t("bulkSelectAllOrg", { count: menu.orgTotal })}
        </button>
      </div>
    </details>
  );
}

type Props = {
  contacts: SerializedContactDto[];
  readOnly: boolean;
  onEdit: (contact: SerializedContactDto) => void;
  onDelete: (id: number) => void;
  selection?: ContactsTableSelection;
  selectionScopeMenu?: ContactsTableSelectionScopeMenu;
};

export function ContactsTable({
  contacts,
  readOnly,
  onEdit,
  onDelete,
  selection,
  selectionScopeMenu,
}: Props) {
  const t = useTranslations("app.contacts");
  const format = useFormatter();
  const headerCbRef = useRef<HTMLInputElement>(null);

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

  const allOnPageSelected =
    contacts.length > 0 &&
    contacts.every((c) => selection?.selectedIds.has(c.id));
  const someOnPageSelected =
    contacts.some((c) => selection?.selectedIds.has(c.id)) &&
    !allOnPageSelected;

  useEffect(() => {
    const el = headerCbRef.current;
    if (!el) return;
    el.indeterminate = Boolean(someOnPageSelected);
  }, [someOnPageSelected, allOnPageSelected, contacts.length]);

  const showSelect = Boolean(selection) && !readOnly;

  return (
    <>
      {/* Desktop */}
      <div className="hidden lg:block">
        <div className="ds-table-wrap">
          <table className="ds-table min-w-[800px] w-full">
            <thead>
              <tr>
                {showSelect ? (
                  <th className="w-[4.5rem]">
                    <div className="flex items-center gap-0.5">
                      <input
                        ref={headerCbRef}
                        type="checkbox"
                        className="h-4 w-4 shrink-0 rounded border-border text-primary-600"
                        checked={allOnPageSelected}
                        onChange={() => selection?.onToggleAllOnPage()}
                        aria-label={t("bulkSelectAllPage")}
                      />
                      {selectionScopeMenu ? (
                        <SelectionScopeMenuButton menu={selectionScopeMenu} />
                      ) : null}
                    </div>
                  </th>
                ) : null}
                <th>{t("colName")}</th>
                <th>{t("colPhone")}</th>
                <th>{t("colEmail")}</th>
                <th>{t("colCreatedAt")}</th>
                <th className="text-right">{t("colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id}>
                  {showSelect ? (
                    <td>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-border text-primary-600"
                        checked={selection!.selectedIds.has(c.id)}
                        onChange={() => selection!.onToggle(c.id)}
                        aria-label={t("bulkSelectRow", {
                          name: c.name ?? c.phoneE164,
                        })}
                      />
                    </td>
                  ) : null}
                  <td className="font-medium text-fg">
                    <button
                      type="button"
                      className="max-w-full text-left font-medium text-inherit hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-100"
                      aria-label={t("openContactCard", {
                        name: c.name ?? c.phoneE164,
                      })}
                      onClick={() => onEdit(c)}
                    >
                      {c.name ?? (
                        <span className="text-fg-muted">{t("noName")}</span>
                      )}
                    </button>
                  </td>
                  <td className="font-mono text-[13px]">{c.phoneE164}</td>
                  <td className="text-fg-secondary">{c.email ?? "—"}</td>
                  <td className="whitespace-nowrap text-sm text-fg-secondary">
                    {formatCreatedAt(c.createdAt)}
                  </td>
                  <td className="text-right">
                    {!readOnly ? (
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          className="ds-btn-ghost rounded-lg p-2"
                          aria-label={t("edit")}
                          onClick={() => onEdit(c)}
                        >
                          <Pencil className="h-4 w-4" strokeWidth={1.5} />
                        </button>
                        <button
                          type="button"
                          className="ds-btn-ghost rounded-lg p-2 text-danger hover:bg-danger-soft"
                          aria-label={t("delete")}
                          onClick={() => onDelete(c.id)}
                        >
                          <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                        </button>
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile: selecionar página (+ menu de escopo, se houver) */}
      {showSelect ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 lg:hidden">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border text-primary-600"
            checked={allOnPageSelected}
            onChange={() => selection?.onToggleAllOnPage()}
            aria-label={t("bulkSelectAllPage")}
          />
          <span className="min-w-0 flex-1 text-sm text-fg-secondary">
            {t("bulkSelectPageBar")}
          </span>
          {selectionScopeMenu ? (
            <SelectionScopeMenuButton
              menu={selectionScopeMenu}
              className="shrink-0"
            />
          ) : null}
        </div>
      ) : null}

      {/* Mobile */}
      <ul className="flex flex-col gap-3 lg:hidden">
        {contacts.map((c) => (
          <li key={c.id} className="ds-card space-y-3 p-4">
            <div className="flex items-start gap-3">
              {showSelect ? (
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 shrink-0 rounded border-border text-primary-600"
                  checked={selection!.selectedIds.has(c.id)}
                  onChange={() => selection!.onToggle(c.id)}
                  aria-label={t("bulkSelectRow", {
                    name: c.name ?? c.phoneE164,
                  })}
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <button
                      type="button"
                      className="block w-full text-left font-medium text-fg hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-100"
                      aria-label={t("openContactCard", {
                        name: c.name ?? c.phoneE164,
                      })}
                      onClick={() => onEdit(c)}
                    >
                      {c.name ?? t("noName")}
                    </button>
                    <p className="font-mono text-sm text-fg">{c.phoneE164}</p>
                    <p className="text-sm text-fg-secondary">
                      {c.email ?? "—"}
                    </p>
                    <p className="text-xs text-fg-muted">
                      {t("colCreatedAt")}: {formatCreatedAt(c.createdAt)}
                    </p>
                  </div>
                  {!readOnly ? (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        className="ds-btn-ghost p-2"
                        onClick={() => onEdit(c)}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="ds-btn-ghost p-2 text-danger"
                        onClick={() => onDelete(c.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
