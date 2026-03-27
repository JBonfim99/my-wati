"use client";

import { useState } from "react";
import { Tags } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ContactCustomFieldDefDto } from "@/lib/contacts/queries";

function formatDefaultDisplay(d: ContactCustomFieldDefDto, t: (k: string) => string) {
  const v = d.defaultValue;
  if (v === null || v === undefined) return t("noDefault");
  if (typeof v === "boolean") return v ? t("yes") : t("no");
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

type Props = {
  tenantId: string;
  definitions: ContactCustomFieldDefDto[];
  readOnly: boolean;
  onUpdated: () => void;
};

export function FieldDefinitionsPanel({
  tenantId,
  definitions,
  readOnly,
  onUpdated,
}: Props) {
  const t = useTranslations("app.contacts");
  const api = `/api/t/${tenantId}/contacts/field-definitions`;

  const [fdLabel, setFdLabel] = useState("");
  const [fdType, setFdType] = useState("text");
  const [fdDefault, setFdDefault] = useState("");
  const [fdErr, setFdErr] = useState<string | null>(null);
  const [fdBusy, setFdBusy] = useState(false);

  async function createField(e: React.FormEvent) {
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

    const res = await fetch(api, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: fdLabel.trim(), fieldType: fdType, config: null, defaultValue }),
    });
    setFdBusy(false);
    if (!res.ok) {
      const j = (await res.json()) as { error?: string };
      setFdErr(j.error ?? t("fieldCreateError"));
      return;
    }
    setFdLabel("");
    setFdDefault("");
    setFdType("text");
    onUpdated();
  }

  async function removeField(id: string) {
    if (!confirm(t("confirmDeleteField"))) return;
    const res = await fetch(`${api}/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    onUpdated();
  }

  return (
    <section className="ds-card overflow-hidden">
      <div className="border-b border-border bg-neutral-50/80 px-5 py-4">
        <div className="flex items-center gap-2">
          <Tags className="h-5 w-5 text-primary-600" strokeWidth={1.5} />
          <h2 className="font-display text-lg font-semibold text-fg">
            {t("systemFieldsTitle")}
          </h2>
        </div>
        <p className="mt-2 text-sm text-fg-secondary">{t("systemFieldsBody")}</p>
      </div>

      <div className="divide-y divide-border">
        {definitions.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-fg-muted">
            {t("noCustomFields")}
          </p>
        ) : (
          definitions.map((d) => (
            <div
              key={d.id}
              className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium text-fg">{d.label}</p>
                <p className="text-xs text-fg-muted">
                  {d.key} · {d.fieldType}
                </p>
                <p className="mt-1 text-xs text-fg-secondary">
                  {t("fieldDefaultShort")}:{" "}
                  <span className="font-medium text-fg">
                    {formatDefaultDisplay(d, t)}
                  </span>
                </p>
              </div>
              {!readOnly ? (
                <button
                  type="button"
                  className="ds-btn-ghost self-start text-danger sm:self-center"
                  onClick={() => void removeField(d.id)}
                >
                  {t("removeField")}
                </button>
              ) : null}
            </div>
          ))
        )}
      </div>

      {!readOnly ? (
        <form
          onSubmit={(e) => void createField(e)}
          className="space-y-4 border-t border-border bg-neutral-50/40 p-5 sm:p-6"
        >
          <p className="text-sm font-semibold text-fg">{t("addFieldTitle")}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="ds-label">
              {t("fieldLabel")}
              <input
                className="ds-input"
                value={fdLabel}
                onChange={(e) => setFdLabel(e.target.value)}
                required
              />
            </label>
            <label className="ds-label">
              {t("fieldType")}
              <select
                className="ds-select"
                value={fdType}
                onChange={(e) => {
                  setFdType(e.target.value);
                  setFdDefault("");
                }}
              >
                <option value="text">text</option>
                <option value="number">number</option>
                <option value="boolean">boolean</option>
                <option value="date">date</option>
              </select>
            </label>
          </div>
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
          <button type="submit" className="ds-btn-primary" disabled={fdBusy}>
            {fdBusy ? t("saving") : t("addField")}
          </button>
        </form>
      ) : null}
    </section>
  );
}
