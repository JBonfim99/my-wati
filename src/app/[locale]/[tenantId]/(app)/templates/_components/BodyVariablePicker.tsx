"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Loader2, Plus, Search } from "lucide-react";
import { extractNamedPlaceholders } from "@/lib/meta/template-create-payload";
import type { TemplateContactVariableRow } from "@/lib/templates/contact-template-variables";

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function matchesQuery(
  q: string,
  placeholder: string,
  label: string,
): boolean {
  const n = norm(q);
  if (!n) return true;
  return (
    norm(label).includes(n) ||
    norm(placeholder).includes(n) ||
    `{{${placeholder}}}`.toLowerCase().includes(n)
  );
}

function VariableMenuRow({
  v,
  onPick,
  incompatibleHint,
  incompatibleLabel,
}: {
  v: TemplateContactVariableRow;
  onPick: (placeholder: string) => void;
  incompatibleHint: string;
  incompatibleLabel: string;
}) {
  const disabled = !v.metaCompatible;
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      title={
        disabled
          ? incompatibleHint
          : `${v.label} → {{${v.placeholder}}}`
      }
      className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
      onClick={() => !disabled && onPick(v.placeholder)}
    >
      <span className="font-medium text-fg">{v.label}</span>
      <code className="text-xs text-primary-700">{`{{${v.placeholder}}}`}</code>
      {disabled ? (
        <span className="text-[10px] text-amber-800">{incompatibleLabel}</span>
      ) : null}
    </button>
  );
}

type TenantFixedCreated = {
  key: string;
  label: string;
  value: string;
};

type Props = {
  tenantId: string;
  body: string;
  headerKind: "none" | "text" | "image";
  headerText: string;
  contactVariables: TemplateContactVariableRow[];
  onInsert: (snippet: string) => void;
  /** Permite criar campo fixo da organização via POST (admin/editor). */
  allowCreateTenantFixed?: boolean;
  onTenantFixedCreated?: (item: TenantFixedCreated) => void;
};

export function BodyVariablePicker({
  tenantId,
  body,
  headerKind,
  headerText,
  contactVariables,
  onInsert,
  allowCreateTenantFixed = false,
  onTenantFixedCreated,
}: Props) {
  const t = useTranslations("app.templates.create");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  const inText = useMemo(() => {
    const h = headerKind === "text" ? headerText : "";
    const blob = `${body}\n${h}`;
    return new Set(extractNamedPlaceholders(blob));
  }, [body, headerKind, headerText]);

  const usedList = useMemo(() => [...inText].sort(), [inText]);

  const standardAvailable = useMemo(
    () =>
      contactVariables.filter(
        (v) => v.section === "standard" && !inText.has(v.placeholder),
      ),
    [contactVariables, inText],
  );

  const tenantFixedAvailable = useMemo(
    () =>
      contactVariables.filter(
        (v) => v.section === "tenant_fixed" && !inText.has(v.placeholder),
      ),
    [contactVariables, inText],
  );

  const customAvailable = useMemo(
    () =>
      contactVariables.filter(
        (v) => v.section === "custom" && !inText.has(v.placeholder),
      ),
    [contactVariables, inText],
  );

  const q = query.trim();

  const usedFiltered = useMemo(
    () => usedList.filter((name) => matchesQuery(q, name, name)),
    [usedList, q],
  );

  const standardFiltered = useMemo(
    () =>
      standardAvailable.filter((v) =>
        matchesQuery(q, v.placeholder, v.label),
      ),
    [standardAvailable, q],
  );

  const tenantFixedFiltered = useMemo(
    () =>
      tenantFixedAvailable.filter((v) =>
        matchesQuery(q, v.placeholder, v.label),
      ),
    [tenantFixedAvailable, q],
  );

  const customFiltered = useMemo(
    () =>
      customAvailable.filter((v) =>
        matchesQuery(q, v.placeholder, v.label),
      ),
    [customAvailable, q],
  );

  const hasAnySection =
    usedList.length > 0 ||
    standardAvailable.length > 0 ||
    tenantFixedAvailable.length > 0 ||
    customAvailable.length > 0;

  const hasFilteredRows =
    usedFiltered.length > 0 ||
    standardFiltered.length > 0 ||
    tenantFixedFiltered.length > 0 ||
    customFiltered.length > 0;

  const searchYieldsNothing =
    Boolean(q) &&
    !hasFilteredRows &&
    !(allowCreateTenantFixed && onTenantFixedCreated);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCreateOpen(false);
      setCreateErr(null);
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open]);

  function pick(name: string) {
    onInsert(`{{${name}}}`);
    setOpen(false);
  }

  async function submitCreateFixed(e: React.FormEvent) {
    e.preventDefault();
    if (!onTenantFixedCreated || !allowCreateTenantFixed) return;
    const label = newLabel.trim();
    if (!label) return;
    setCreateBusy(true);
    setCreateErr(null);
    const res = await fetch(`/api/t/${tenantId}/tenant-fixed-fields`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label,
        value: newValue,
        ...(newKey.trim() ? { key: newKey.trim() } : {}),
      }),
    });
    const data = (await res.json()) as {
      error?: string;
      item?: { key: string; label: string; value: string };
    };
    setCreateBusy(false);
    if (!res.ok) {
      setCreateErr(data.error ?? t("variablePickerCreateFixedError"));
      return;
    }
    if (!data.item) {
      setCreateErr(t("variablePickerCreateFixedError"));
      return;
    }
    const { key, label: lb, value } = data.item;
    onTenantFixedCreated({ key, label: lb, value: value ?? "" });
    onInsert(`{{${key}}}`);
    setNewLabel("");
    setNewKey("");
    setNewValue("");
    setCreateOpen(false);
    setOpen(false);
  }

  function sectionSummary(title: string, count: number) {
    return (
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 bg-neutral-50/95 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-fg-muted backdrop-blur-sm [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-2">
          <ChevronDown
            className="size-3.5 shrink-0 -rotate-90 transition-transform group-open:rotate-0"
            aria-hidden
          />
          <span className="truncate">{title}</span>
        </span>
        <span className="shrink-0 rounded-full bg-neutral-200/90 px-2 py-0.5 text-[9px] font-bold tabular-nums text-fg-secondary">
          {count}
        </span>
      </summary>
    );
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="ds-btn-ghost ds-btn-sm inline-flex items-center gap-1"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        {t("addVariable")}
        <ChevronDown
          className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open ? (
        <div
          className="absolute right-0 z-50 mt-1 flex max-h-[min(72dvh,30rem)] w-[min(100vw-2rem,26rem)] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg"
          role="menu"
        >
          <div className="sticky top-0 z-10 border-b border-border bg-card px-2 py-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-muted"
                strokeWidth={1.5}
                aria-hidden
              />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("variablePickerSearchPlaceholder")}
                className="ds-input w-full py-2 pl-9 pr-3 text-sm"
                aria-label={t("variablePickerSearchPlaceholder")}
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
            {!hasAnySection ? (
              <p className="px-3 py-4 text-center text-sm text-fg-muted">
                {t("variablePickerEmpty")}
              </p>
            ) : null}

            {hasAnySection && searchYieldsNothing ? (
              <p className="px-3 py-4 text-center text-sm text-fg-muted">
                {t("variablePickerNoSearchResults")}
              </p>
            ) : null}

            {usedFiltered.length > 0 ? (
              <details open className="group border-b border-border/80">
                {sectionSummary(
                  t("variableSectionInText"),
                  usedFiltered.length,
                )}
                <div className="pb-1 pt-0.5">
                  {usedFiltered.map((name) => (
                    <button
                      key={name}
                      type="button"
                      role="menuitem"
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-neutral-100"
                      onClick={() => pick(name)}
                    >
                      <code className="text-xs text-primary-700">{`{{${name}}}`}</code>
                    </button>
                  ))}
                </div>
              </details>
            ) : null}

            {standardFiltered.length > 0 ? (
              <details open className="group border-b border-border/80">
                {sectionSummary(
                  t("variableSectionContact"),
                  standardFiltered.length,
                )}
                <div className="pb-1 pt-0.5">
                  {standardFiltered.map((v) => (
                    <VariableMenuRow
                      key={v.placeholder}
                      v={v}
                      onPick={pick}
                      incompatibleHint={t("variableMetaIncompatibleHint")}
                      incompatibleLabel={t("variableMetaIncompatible")}
                    />
                  ))}
                </div>
              </details>
            ) : null}

            {tenantFixedFiltered.length > 0 ||
            (allowCreateTenantFixed && onTenantFixedCreated) ? (
              <details
                open
                className="group border-b border-border/80 last:border-b-0"
              >
                {sectionSummary(
                  t("variableSectionTenantFixed"),
                  tenantFixedFiltered.length,
                )}
                <div className="space-y-1 pb-2 pt-1">
                  {allowCreateTenantFixed && onTenantFixedCreated ? (
                    <div className="mx-2 mb-2 rounded-lg border border-primary-200/80 bg-primary-50/40 px-2 py-2">
                      {!createOpen ? (
                        <button
                          type="button"
                          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-primary-300/90 bg-card/80 px-2 py-2 text-xs font-semibold text-primary-800 hover:bg-primary-50"
                          onClick={() => {
                            setCreateOpen(true);
                            setCreateErr(null);
                          }}
                        >
                          <Plus className="size-3.5" strokeWidth={2} aria-hidden />
                          {t("variablePickerCreateFixed")}
                        </button>
                      ) : (
                        <form
                          onSubmit={(e) => void submitCreateFixed(e)}
                          className="space-y-2"
                        >
                          <p className="text-xs font-semibold text-fg">
                            {t("variablePickerCreateFixedTitle")}
                          </p>
                          {createErr ? (
                            <p className="text-xs text-danger">{createErr}</p>
                          ) : null}
                          <label className="block text-[11px] font-medium text-fg-secondary">
                            {t("variablePickerCreateFixedLabel")}
                            <input
                              className="ds-input mt-0.5 w-full text-sm"
                              value={newLabel}
                              onChange={(e) => setNewLabel(e.target.value)}
                              required
                              autoComplete="off"
                            />
                          </label>
                          <label className="block text-[11px] font-medium text-fg-secondary">
                            {t("variablePickerCreateFixedKeyOpt")}
                            <input
                              className="ds-input mt-0.5 w-full font-mono text-xs"
                              value={newKey}
                              onChange={(e) => setNewKey(e.target.value)}
                              placeholder={t("variablePickerCreateFixedKeyPh")}
                              autoComplete="off"
                              spellCheck={false}
                            />
                          </label>
                          <label className="block text-[11px] font-medium text-fg-secondary">
                            {t("variablePickerCreateFixedValueOpt")}
                            <textarea
                              className="ds-input mt-0.5 min-h-[56px] w-full resize-y py-1.5 text-sm"
                              value={newValue}
                              onChange={(e) => setNewValue(e.target.value)}
                            />
                          </label>
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              type="submit"
                              disabled={createBusy || !newLabel.trim()}
                              className="ds-btn-primary ds-btn-sm inline-flex items-center gap-1"
                            >
                              {createBusy ? (
                                <Loader2
                                  className="size-3.5 animate-spin"
                                  aria-hidden
                                />
                              ) : null}
                              {createBusy
                                ? t("variablePickerCreateFixedSaving")
                                : t("variablePickerCreateFixedSubmit")}
                            </button>
                            <button
                              type="button"
                              className="ds-btn-ghost ds-btn-sm text-fg-secondary"
                              disabled={createBusy}
                              onClick={() => {
                                setCreateOpen(false);
                                setCreateErr(null);
                                setNewLabel("");
                                setNewKey("");
                                setNewValue("");
                              }}
                            >
                              {t("variablePickerCreateFixedCancel")}
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  ) : null}

                  {tenantFixedFiltered.map((v) => (
                    <VariableMenuRow
                      key={v.placeholder}
                      v={v}
                      onPick={pick}
                      incompatibleHint={t("variableMetaIncompatibleHint")}
                      incompatibleLabel={t("variableMetaIncompatible")}
                    />
                  ))}
                </div>
              </details>
            ) : null}

            {customFiltered.length > 0 ? (
              <details open className="group border-b border-border/80 last:border-b-0">
                {sectionSummary(
                  t("variableSectionCustom"),
                  customFiltered.length,
                )}
                <div className="pb-1 pt-0.5">
                  {customFiltered.map((v) => (
                    <VariableMenuRow
                      key={v.placeholder}
                      v={v}
                      onPick={pick}
                      incompatibleHint={t("variableMetaIncompatibleHint")}
                      incompatibleLabel={t("variableMetaIncompatible")}
                    />
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
