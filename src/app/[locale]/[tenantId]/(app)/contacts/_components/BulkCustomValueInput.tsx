"use client";

import { useTranslations } from "next-intl";
import type { ContactCustomFieldDefDto } from "@/lib/contacts/queries";
import type { ContactCustomFieldConfig } from "@/lib/db/schema";

type Props = {
  definition: ContactCustomFieldDefDto;
  value: string;
  onChange: (value: string) => void;
};

/**
 * Controle de valor para “definir campo em massa”, espelhando tipos do ContactFormModal:
 * texto (input), número (number), data (date), booleano (select Sim/Não), select (opções).
 */
export function BulkCustomValueInput({
  definition,
  value,
  onChange,
}: Props) {
  const t = useTranslations("app.contacts");
  const cfg = definition.config as ContactCustomFieldConfig | null;

  switch (definition.fieldType) {
    case "boolean":
      return (
        <select
          className="ds-select mt-1 w-full"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{t("emptyOption")}</option>
          <option value="true">{t("yes")}</option>
          <option value="false">{t("no")}</option>
        </select>
      );
    case "select":
      return (
        <select
          className="ds-select mt-1 w-full"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{t("emptyOption")}</option>
          {(cfg?.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case "date":
      return (
        <input
          type="date"
          className="ds-input mt-1 w-full"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "number":
      return (
        <input
          type="number"
          inputMode="decimal"
          step="any"
          className="ds-input mt-1 w-full"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "text":
    default:
      return (
        <input
          type="text"
          className="ds-input mt-1 w-full"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("bulkCustomValuePlaceholder")}
        />
      );
  }
}
