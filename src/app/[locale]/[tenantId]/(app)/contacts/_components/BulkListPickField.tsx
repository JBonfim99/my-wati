"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ListPlus, X } from "lucide-react";
import { filterListsBySearch } from "@/lib/text/list-name-search";

export type BulkListPickItem = { id: string; name: string };

type Props = {
  lists: BulkListPickItem[];
  selectedIds: Set<string>;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
};

export function BulkListPickField({
  lists,
  selectedIds,
  onAdd,
  onRemove,
}: Props) {
  const t = useTranslations("app.contacts");
  const [query, setQuery] = useState("");

  const selected = useMemo(
    () => lists.filter((l) => selectedIds.has(l.id)),
    [lists, selectedIds],
  );

  const available = useMemo(
    () => lists.filter((l) => !selectedIds.has(l.id)),
    [lists, selectedIds],
  );

  const filteredAvailable = useMemo(
    () => filterListsBySearch(available, query),
    [available, query],
  );

  return (
    <div className="mt-4 space-y-4">
      {selected.length > 0 ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">
            {t("bulkListSelectedHeading")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {selected.map((l) => (
              <span
                key={l.id}
                className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1 text-sm font-medium text-primary-900 ring-1 ring-primary-200/80"
              >
                <span className="truncate">{l.name}</span>
                <button
                  type="button"
                  className="rounded-full p-0.5 text-primary-700 hover:bg-primary-100"
                  aria-label={t("bulkListRemoveFromSelection", { name: l.name })}
                  onClick={() => onRemove(l.id)}
                >
                  <X className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                </button>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <label className="block text-sm font-medium text-fg">
        {t("bulkListSearchLabel")}
        <input
          type="search"
          autoComplete="off"
          autoFocus
          className="ds-input mt-1 w-full"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("bulkListSearchPlaceholder")}
          aria-describedby="bulk-list-browse-hint"
        />
      </label>
      <p id="bulk-list-browse-hint" className="text-xs text-fg-muted">
        {t("bulkListBrowseHint")}
      </p>

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">
          {t("bulkListBrowseHeading")}
        </p>
        <div
          className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-border bg-card shadow-sm"
          aria-label={t("bulkListBrowseAria")}
        >
          {available.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-fg-muted">
              {t("bulkListAllSelected")}
            </p>
          ) : filteredAvailable.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-fg-muted">
              {t("bulkListNoMatches")}
            </p>
          ) : (
            <ul className="divide-y divide-border py-0.5">
              {filteredAvailable.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-fg hover:bg-neutral-50 focus-visible:bg-neutral-50 focus-visible:outline focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
                    onClick={() => onAdd(l.id)}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700 ring-1 ring-sky-100">
                      <ListPlus className="h-4 w-4" strokeWidth={2} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {l.name}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
