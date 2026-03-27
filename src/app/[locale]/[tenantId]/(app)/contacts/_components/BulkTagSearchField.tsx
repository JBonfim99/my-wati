"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";

export type BulkTagSearchTag = { id: string; name: string };

type Props = {
  tags: BulkTagSearchTag[];
  selectedIds: Set<string>;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
};

export function BulkTagSearchField({
  tags,
  selectedIds,
  onAdd,
  onRemove,
}: Props) {
  const t = useTranslations("app.contacts");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const qNorm = query.trim().toLowerCase();

  const selectedTags = useMemo(
    () => tags.filter((tg) => selectedIds.has(tg.id)),
    [tags, selectedIds],
  );

  const suggestions = useMemo(() => {
    if (!qNorm) return [];
    return tags
      .filter(
        (tg) =>
          !selectedIds.has(tg.id) &&
          tg.name.toLowerCase().includes(qNorm),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tags, selectedIds, qNorm]);

  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      const el = rootRef.current;
      if (el && !el.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  return (
    <div ref={rootRef} className="mt-4 space-y-3">
      {selectedTags.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selectedTags.map((tg) => (
            <span
              key={tg.id}
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1 text-sm font-medium text-primary-900 ring-1 ring-primary-200/80"
            >
              <span className="truncate">{tg.name}</span>
              <button
                type="button"
                className="rounded-full p-0.5 text-primary-700 hover:bg-primary-100"
                aria-label={t("bulkTagRemoveFromSelection", { name: tg.name })}
                onClick={() => onRemove(tg.id)}
              >
                <X className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <label className="block text-sm font-medium text-fg">
        {t("bulkTagSearchLabel")}
        <input
          type="search"
          autoComplete="off"
          autoFocus
          className="ds-input mt-1 w-full"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={t("bulkTagSearchPlaceholder")}
        />
      </label>

      {open ? (
        <div
          id="bulk-tag-suggestions"
          className="max-h-52 overflow-y-auto rounded-xl border border-border bg-card py-1 shadow-md"
        >
          {!qNorm ? (
            <p className="px-3 py-3 text-sm text-fg-muted">
              {t("bulkTagTypeToFilter")}
            </p>
          ) : suggestions.length === 0 ? (
            <p className="px-3 py-3 text-sm text-fg-muted">
              {t("bulkTagNoMatches")}
            </p>
          ) : (
            <ul className="py-0.5">
              {suggestions.map((tg) => (
                <li key={tg.id}>
                  <button
                    type="button"
                    className="flex w-full px-3 py-2.5 text-left text-sm text-fg hover:bg-neutral-50"
                    onClick={() => {
                      onAdd(tg.id);
                      setQuery("");
                      setOpen(false);
                    }}
                  >
                    {tg.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
