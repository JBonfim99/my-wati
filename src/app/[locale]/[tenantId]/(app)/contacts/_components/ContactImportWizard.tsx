"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileUp, Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  CONTACT_IMPORT_MAX_ROWS,
  type ContactImportColumnMapping,
} from "@/lib/contacts/import-schema";
import { awaitContactsJobSse } from "@/lib/contacts/contacts-job-sse-client";
import {
  guessSystemMappingFromHeader,
  parseCsv,
  type ParsedCsv,
} from "@/lib/contacts/csv-parse";
import type { FieldType } from "@/lib/contacts/validate-custom-value";

type FieldDefOpt = { id: string; label: string; fieldType: FieldType };
type TagOpt = { id: number; name: string };

type Props = {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  fieldDefs: FieldDefOpt[];
  allTags: TagOpt[];
  /** `timeout` = polling esgotou; a fila pode ainda estar processando. */
  onFinished: (detail: { status: "completed" | "timeout" }) => void | Promise<void>;
};

function mappingToSelectValue(m: ContactImportColumnMapping): string {
  if (m.kind === "skip") return "skip";
  if (m.kind === "system") return `system:${m.field}`;
  return `custom:${m.fieldId}`;
}

function selectValueToMapping(v: string): ContactImportColumnMapping {
  if (v === "skip") return { kind: "skip" };
  if (v.startsWith("system:")) {
    const f = v.slice(7);
    if (f === "name" || f === "phone" || f === "email") {
      return { kind: "system", field: f };
    }
  }
  if (v.startsWith("custom:")) {
    return { kind: "custom", fieldId: v.slice(7) };
  }
  return { kind: "skip" };
}

/** Chave estável para comparar se dois mapeamentos apontam para o mesmo destino. */
function mappingTargetKey(m: ContactImportColumnMapping): string | null {
  if (m.kind === "skip") return null;
  if (m.kind === "system") return `system:${m.field}`;
  return `custom:${m.fieldId}`;
}

/** Destino já usado por outra coluna não aparece neste select; a coluna atual mantém a opção escolhida. */
function isImportMapOptionAllowed(
  optionValue: string,
  header: string,
  colMapping: Record<string, ContactImportColumnMapping>,
): boolean {
  if (optionValue === "skip") return true;
  const key = mappingTargetKey(selectValueToMapping(optionValue));
  if (key === null) return true;
  const current = colMapping[header] ?? { kind: "skip" };
  if (mappingTargetKey(current) === key) return true;
  for (const [col, m] of Object.entries(colMapping)) {
    if (col === header) continue;
    if (mappingTargetKey(m) === key) return false;
  }
  return true;
}

export function ContactImportWizard({
  open,
  onClose,
  tenantId,
  fieldDefs,
  allTags,
  onFinished,
}: Props) {
  const t = useTranslations("app.contacts");
  const importApi = `/api/t/${tenantId}/contacts/import`;

  const [step, setStep] = useState(0);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<
    Record<string, ContactImportColumnMapping>
  >({});
  const [tagIds, setTagIds] = useState<Set<number>>(() => new Set());
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const sortedTags = useMemo(
    () => [...allTags].sort((a, b) => a.name.localeCompare(b.name)),
    [allTags],
  );

  const sortedFieldDefs = useMemo(
    () => [...fieldDefs].sort((a, b) => a.label.localeCompare(b.label)),
    [fieldDefs],
  );

  const reset = useCallback(() => {
    setStep(0);
    setParsed(null);
    setParseError(null);
    setMapping({});
    setTagIds(new Set());
    setSubmitBusy(false);
    setSubmitError(null);
  }, []);

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  useEffect(() => {
    if (!parsed || parsed.headers.length === 0) return;
    const next: Record<string, ContactImportColumnMapping> = {};
    for (const h of parsed.headers) {
      const g = guessSystemMappingFromHeader(h);
      if (g) next[h] = { kind: "system", field: g };
      else next[h] = { kind: "skip" };
    }
    setMapping(next);
  }, [parsed]);

  function applyFile(file: File) {
    setParseError(null);
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setParseError(t("importErrorNotCsv"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text =
        typeof reader.result === "string" ? reader.result : "";
      const p = parseCsv(text);
      if (p.headers.length === 0 || p.rows.length === 0) {
        setParseError(t("importErrorEmpty"));
        setParsed(null);
        return;
      }
      if (p.rows.length > CONTACT_IMPORT_MAX_ROWS) {
        setParseError(
          t("importErrorTooManyRows", { max: CONTACT_IMPORT_MAX_ROWS }),
        );
        setParsed(null);
        return;
      }
      setParsed(p);
      setStep(1);
    };
    reader.onerror = () => setParseError(t("importErrorRead"));
    reader.readAsText(file, "UTF-8");
  }

  async function handleConfirmImport() {
    if (!parsed) return;
    setSubmitError(null);
    setSubmitBusy(true);
    try {
      const res = await fetch(importApi, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          headers: parsed.headers,
          rows: parsed.rows,
          mapping,
          tagIds: [...tagIds],
        }),
      });
      const bodyJson = (await res.json().catch(() => ({}))) as {
        jobId?: string;
        error?: string;
      };
      if (!res.ok) {
        setSubmitError(bodyJson.error ?? t("importErrorEnqueue"));
        setSubmitBusy(false);
        return;
      }
      if (res.status !== 202 || !bodyJson.jobId) {
        setSubmitError(t("importErrorEnqueue"));
        setSubmitBusy(false);
        return;
      }
      const streamUrl = `${importApi}/${encodeURIComponent(bodyJson.jobId)}/stream`;
      const outcome = await awaitContactsJobSse({
        url: streamUrl,
        statusErrorMessage: t("bulkJobStatusError"),
      });
      setSubmitBusy(false);
      if (outcome.kind === "failed") {
        setSubmitError(outcome.reason ?? t("bulkJobFailed"));
        return;
      }
      if (outcome.kind === "timeout") {
        await Promise.resolve(onFinished({ status: "timeout" }));
        onClose();
        return;
      }
      await Promise.resolve(onFinished({ status: "completed" }));
      onClose();
    } catch {
      setSubmitBusy(false);
      setSubmitError(t("importErrorEnqueue"));
    }
  }

  if (!open) return null;

  const rowCount = parsed?.rows.length ?? 0;
  const sampleRow = parsed?.rows[0];

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-fg/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-wizard-title"
      onClick={() => !submitBusy && onClose()}
    >
      <div
        className="flex max-h-[min(92vh,720px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2
            id="import-wizard-title"
            className="font-display text-lg font-semibold text-fg"
          >
            {t("importTitle")}
          </h2>
          <button
            type="button"
            className="rounded-lg p-2 text-fg-muted hover:bg-neutral-100"
            disabled={submitBusy}
            aria-label={t("cancel")}
            onClick={onClose}
          >
            <X className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {step === 0 ? (
            <div className="space-y-4">
              <p className="text-sm text-fg-secondary">{t("importStepFileHint")}</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) applyFile(f);
                }}
              />
              <div
                role="button"
                tabIndex={0}
                className={`flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
                  dragActive
                    ? "border-primary-500 bg-primary-50/50"
                    : "border-border bg-neutral-50/40 hover:border-primary-300"
                }`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                onClick={() => fileInputRef.current?.click()}
                onDragEnter={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragActive(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragActive(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragActive(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) applyFile(f);
                }}
              >
                <FileUp
                  className="mb-3 h-10 w-10 text-fg-muted"
                  strokeWidth={1.25}
                  aria-hidden
                />
                <p className="text-sm font-medium text-fg">
                  {t("importDropLabel")}
                </p>
                <p className="mt-1 text-xs text-fg-muted">
                  {t("importDropSub", { max: CONTACT_IMPORT_MAX_ROWS })}
                </p>
              </div>
              {parseError ? (
                <p className="text-sm text-danger" role="alert">
                  {parseError}
                </p>
              ) : null}
            </div>
          ) : null}

          {step === 1 && parsed ? (
            <div className="space-y-4">
              <p className="text-sm text-fg-secondary">
                {t("importStepMapHint")}
              </p>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="bg-neutral-50/90 text-xs font-semibold uppercase text-fg-secondary">
                    <tr>
                      <th className="px-3 py-2">{t("importColHeader")}</th>
                      <th className="px-3 py-2">{t("importColSample")}</th>
                      <th className="px-3 py-2">{t("importColTarget")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.headers.map((h, idx) => (
                      <tr
                        key={`${h}-${idx}`}
                        className="border-t border-border"
                      >
                        <td className="max-w-[140px] truncate px-3 py-2 font-medium">
                          {h}
                        </td>
                        <td className="max-w-[200px] truncate px-3 py-2 text-fg-muted">
                          {(sampleRow?.[idx] ?? "").slice(0, 80) ||
                            "—"}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            className="ds-input w-full max-w-xs text-sm"
                            value={mappingToSelectValue(
                              mapping[h] ?? { kind: "skip" },
                            )}
                            onChange={(e) => {
                              const v = e.target.value;
                              setMapping((prev) => ({
                                ...prev,
                                [h]: selectValueToMapping(v),
                              }));
                            }}
                          >
                            <option value="skip">{t("importMapSkip")}</option>
                            {isImportMapOptionAllowed("system:name", h, mapping) ? (
                              <option value="system:name">
                                {t("importMapName")}
                              </option>
                            ) : null}
                            {isImportMapOptionAllowed("system:phone", h, mapping) ? (
                              <option value="system:phone">
                                {t("importMapPhone")}
                              </option>
                            ) : null}
                            {isImportMapOptionAllowed("system:email", h, mapping) ? (
                              <option value="system:email">
                                {t("importMapEmail")}
                              </option>
                            ) : null}
                            {sortedFieldDefs.map((d) => {
                              const v = `custom:${d.id}`;
                              if (!isImportMapOptionAllowed(v, h, mapping)) {
                                return null;
                              }
                              return (
                                <option key={d.id} value={v}>
                                  {d.label} ({d.fieldType})
                                </option>
                              );
                            })}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="ds-btn-outline text-sm"
                  onClick={() => {
                    setStep(0);
                    setParsed(null);
                  }}
                >
                  {t("importBack")}
                </button>
                <button
                  type="button"
                  className="ds-btn-primary text-sm"
                  onClick={() => setStep(2)}
                >
                  {t("importNext")}
                </button>
              </div>
            </div>
          ) : null}

          {step === 2 && parsed ? (
            <div className="space-y-5">
              <div className="rounded-xl border border-border bg-neutral-50/50 p-4">
                <p className="text-sm font-semibold text-fg">
                  {t("importSummaryCount", { count: rowCount })}
                </p>
                <p className="mt-1 text-xs text-fg-secondary">
                  {t("importSummaryCountNote")}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-fg">
                  {t("importTagsTitle")}
                </p>
                <p className="mt-1 text-xs text-fg-secondary">
                  {t("importTagsHint")}
                </p>
                {sortedTags.length === 0 ? (
                  <p className="mt-3 text-sm text-fg-muted">
                    {t("filterNoTagsInOrg")}
                  </p>
                ) : (
                  <ul className="mt-3 max-h-44 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                    {sortedTags.map((tg) => {
                      const checked = tagIds.has(tg.id);
                      return (
                        <li key={tg.id}>
                          <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-neutral-100">
                            <input
                              type="checkbox"
                              className="rounded border-border"
                              checked={checked}
                              disabled={
                                !checked && tagIds.size >= 3
                              }
                              onChange={() => {
                                setTagIds((prev) => {
                                  const n = new Set(prev);
                                  if (n.has(tg.id)) n.delete(tg.id);
                                  else if (n.size < 3) n.add(tg.id);
                                  return n;
                                });
                              }}
                            />
                            <span>{tg.name}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="ds-btn-outline text-sm"
                  onClick={() => setStep(1)}
                >
                  {t("importBack")}
                </button>
                <button
                  type="button"
                  className="ds-btn-primary text-sm"
                  onClick={() => setStep(3)}
                >
                  {t("importNext")}
                </button>
              </div>
            </div>
          ) : null}

          {step === 3 && parsed ? (
            <div className="space-y-4">
              <p className="text-sm text-fg-secondary">
                {t("importConfirmHint")}
              </p>
              <ul className="list-inside list-disc space-y-1 text-sm text-fg">
                <li>
                  {t("importConfirmRows", { count: rowCount })}
                </li>
                <li>
                  {tagIds.size === 0
                    ? t("importConfirmNoTags")
                    : t("importConfirmTags", { count: tagIds.size })}
                </li>
              </ul>
              {submitError ? (
                <p className="text-sm text-danger" role="alert">
                  {submitError}
                </p>
              ) : null}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="ds-btn-outline text-sm"
                  disabled={submitBusy}
                  onClick={() => setStep(2)}
                >
                  {t("importBack")}
                </button>
                <button
                  type="button"
                  className="ds-btn-primary inline-flex items-center gap-2 text-sm"
                  disabled={submitBusy}
                  onClick={() => void handleConfirmImport()}
                >
                  {submitBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : null}
                  {submitBusy ? t("importStarting") : t("importStart")}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
