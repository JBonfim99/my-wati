"use client";

import type { CSSProperties } from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";

export type ContactTagsSectionTag = {
  id: number;
  name: string;
  slug: string;
};

type Props = {
  tenantId: string;
  allTags: ContactTagsSectionTag[];
  selectedTagIds: Set<number>;
  onSelectionChange: (next: Set<number>) => void;
  onTagCreated: (tag: ContactTagsSectionTag) => void;
  readOnly: boolean;
};

export function ContactTagsSection({
  tenantId,
  allTags,
  selectedTagIds,
  onSelectionChange,
  onTagCreated,
  readOnly,
}: Props) {
  const t = useTranslations("app.contacts");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});

  const selectedList = useMemo(() => {
    const map = new Map(allTags.map((tg) => [tg.id, tg]));
    return [...selectedTagIds]
      .map((id) => map.get(id))
      .filter(Boolean) as ContactTagsSectionTag[];
  }, [allTags, selectedTagIds]);

  const q = query.trim().toLowerCase();
  const available = useMemo(() => {
    return allTags
      .filter((tg) => !selectedTagIds.has(tg.id))
      .filter((tg) => q === "" || tg.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allTags, selectedTagIds, q]);

  const canSubmitNewTag =
    query.trim().length > 0 &&
    !allTags.some((tg) => tg.name.toLowerCase() === query.trim().toLowerCase());

  const reposition = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPanelStyle({
      position: "fixed",
      top: rect.bottom + 6,
      left: rect.left,
      width: Math.max(280, rect.width),
      maxWidth: "min(360px, calc(100vw - 1.5rem))",
      zIndex: 220,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    reposition();
    const onWin = () => reposition();
    window.addEventListener("resize", onWin);
    window.addEventListener("scroll", onWin, true);
    return () => {
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin, true);
    };
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      setOpen(false);
      setQuery("");
      setCreateErr(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function removeTag(id: number) {
    if (readOnly) return;
    onSelectionChange(
      new Set([...selectedTagIds].filter((x) => x !== id)),
    );
  }

  function addTag(id: number) {
    if (readOnly) return;
    const next = new Set(selectedTagIds);
    next.add(id);
    onSelectionChange(next);
    setQuery("");
    setCreateErr(null);
  }

  async function createTagFromQuery() {
    const name = query.trim();
    if (!name || readOnly) return;
    setCreateErr(null);
    setCreateBusy(true);
    const res = await fetch(`/api/t/${tenantId}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setCreateBusy(false);
    if (!res.ok) {
      const j = (await res.json()) as { error?: string };
      setCreateErr(j.error ?? t("contactTagCreateError"));
      return;
    }
    const j = (await res.json()) as {
      tag: ContactTagsSectionTag & { createdAt?: string };
    };
    onTagCreated(j.tag);
    addTag(j.tag.id);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="border-b border-border pb-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-fg">
          {t("contactTagsSectionTitle")}
        </span>
        {!readOnly ? (
          <button
            ref={anchorRef}
            type="button"
            className="text-sm font-semibold text-primary-600 hover:text-primary-700 hover:underline"
            aria-expanded={open}
            aria-haspopup="menu"
            onClick={() => {
              setOpen((o) => !o);
              setCreateErr(null);
            }}
          >
            {t("contactAddTag")}
          </button>
        ) : null}
      </div>

      <div className="flex min-h-[40px] flex-wrap gap-2">
        {selectedList.length === 0 ? (
          <span className="text-xs text-fg-muted">{t("contactNoTagsYet")}</span>
        ) : (
          selectedList.map((tg) => (
            <span
              key={tg.id}
              className="inline-flex items-center gap-1 rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-800"
            >
              {tg.name}
              {!readOnly ? (
                <button
                  type="button"
                  className="rounded-full p-0.5 text-primary-600 hover:bg-primary-100 hover:text-primary-900"
                  aria-label={t("contactRemoveTag", { name: tg.name })}
                  onClick={() => removeTag(tg.id)}
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              ) : null}
            </span>
          ))
        )}
      </div>

      {open && !readOnly
        ? createPortal(
            <div
              ref={panelRef}
              className="rounded-xl border border-border bg-card py-2 shadow-xl"
              style={panelStyle}
              role="menu"
              aria-label={t("contactTagPickerLabel")}
            >
              <p className="px-3 pb-1 text-xs font-medium text-fg-secondary">
                {t("contactTagPickerLabel")}
              </p>
              <div className="px-3 pb-2">
                <input
                  type="search"
                  className="ds-input py-2 text-sm"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("contactTagSearchPlaceholder")}
                  autoFocus
                />
              </div>
              <ul className="max-h-48 overflow-y-auto border-t border-border py-1">
                {available.length === 0 ? (
                  <li className="px-3 py-2 text-xs text-fg-muted">
                    {t("contactNoTagMatches")}
                  </li>
                ) : (
                  available.map((tg) => (
                    <li key={tg.id}>
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full px-3 py-2 text-left text-sm text-fg hover:bg-neutral-50"
                        onClick={() => addTag(tg.id)}
                      >
                        {tg.name}
                      </button>
                    </li>
                  ))
                )}
              </ul>
              <div className="border-t border-border px-3 pt-2">
                {createErr ? (
                  <p className="mb-2 text-xs text-danger">{createErr}</p>
                ) : null}
                <button
                  type="button"
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary-600 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
                  disabled={!canSubmitNewTag || createBusy}
                  onClick={() => void createTagFromQuery()}
                >
                  <Plus className="h-4 w-4" strokeWidth={2} />
                  {createBusy ? t("contactNewTagCreating") : t("contactNewTagButton")}
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
