"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { extractNamedPlaceholders } from "@/lib/meta/template-create-payload";
import type { TemplateContactVariableRow } from "@/lib/templates/contact-template-variables";

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

type Props = {
  body: string;
  headerKind: "none" | "text";
  headerText: string;
  contactVariables: TemplateContactVariableRow[];
  onInsert: (snippet: string) => void;
};

export function BodyVariablePicker({
  body,
  headerKind,
  headerText,
  contactVariables,
  onInsert,
}: Props) {
  const t = useTranslations("app.templates.create");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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

  const customAvailable = useMemo(
    () =>
      contactVariables.filter(
        (v) => v.section === "custom" && !inText.has(v.placeholder),
      ),
    [contactVariables, inText],
  );

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

  function pick(name: string) {
    onInsert(`{{${name}}}`);
    setOpen(false);
  }

  const hasAnySection =
    usedList.length > 0 ||
    standardAvailable.length > 0 ||
    customAvailable.length > 0;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="ds-btn-ghost ds-btn-sm inline-flex items-center gap-1"
        aria-expanded={open}
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
          className="absolute right-0 z-50 mt-1 max-h-[min(70dvh,28rem)] w-[min(100vw-2rem,22rem)] overflow-y-auto rounded-xl border border-border bg-card py-1 shadow-lg"
          role="menu"
        >
          {!hasAnySection ? (
            <p className="px-3 py-4 text-center text-sm text-fg-muted">
              {t("variablePickerEmpty")}
            </p>
          ) : null}

          {usedList.length > 0 ? (
            <>
              <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
                {t("variableSectionInText")}
              </p>
              {usedList.map((name) => (
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
              <div className="my-1 border-t border-border" />
            </>
          ) : null}

          {standardAvailable.length > 0 ? (
            <>
              <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
                {t("variableSectionContact")}
              </p>
              {standardAvailable.map((v) => (
                <VariableMenuRow
                  key={v.placeholder}
                  v={v}
                  onPick={pick}
                  incompatibleHint={t("variableMetaIncompatibleHint")}
                  incompatibleLabel={t("variableMetaIncompatible")}
                />
              ))}
              <div className="my-1 border-t border-border" />
            </>
          ) : null}

          {customAvailable.length > 0 ? (
            <>
              <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
                {t("variableSectionCustom")}
              </p>
              {customAvailable.map((v) => (
                <VariableMenuRow
                  key={v.placeholder}
                  v={v}
                  onPick={pick}
                  incompatibleHint={t("variableMetaIncompatibleHint")}
                  incompatibleLabel={t("variableMetaIncompatible")}
                />
              ))}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
