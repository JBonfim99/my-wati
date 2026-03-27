import type { ContactCustomFieldConfig } from "@/lib/db/schema";

export type FieldType =
  | "text"
  | "number"
  | "boolean"
  | "date"
  | "select";

export function validateAndNormalizeCustomValue(
  fieldType: FieldType,
  raw: unknown,
  config: ContactCustomFieldConfig | null | undefined,
): { ok: true; value: unknown } | { ok: false; error: string } {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true, value: null };
  }

  switch (fieldType) {
    case "text":
      return { ok: true, value: String(raw) };
    case "number": {
      const n =
        typeof raw === "number" ? raw : Number.parseFloat(String(raw));
      if (Number.isNaN(n)) {
        return { ok: false, error: "Valor numérico inválido." };
      }
      return { ok: true, value: n };
    }
    case "boolean":
      if (typeof raw === "boolean") return { ok: true, value: raw };
      if (raw === "true" || raw === "1") return { ok: true, value: true };
      if (raw === "false" || raw === "0") return { ok: true, value: false };
      return { ok: false, error: "Esperado sim/não." };
    case "date": {
      const s = String(raw);
      const d = new Date(s);
      if (Number.isNaN(d.getTime())) {
        return { ok: false, error: "Data inválida." };
      }
      return { ok: true, value: d.toISOString().slice(0, 10) };
    }
    case "select": {
      const v = String(raw);
      const opts = config?.options ?? [];
      const allowed = new Set(opts.map((o) => o.value));
      if (!allowed.has(v)) {
        return { ok: false, error: "Opção inválida." };
      }
      return { ok: true, value: v };
    }
    default:
      return { ok: false, error: "Tipo desconhecido." };
  }
}

/** Valor guardado em `default_value` (vazio = sem padrão). */
export function validateAndNormalizeDefaultValue(
  fieldType: FieldType,
  raw: unknown,
  config: ContactCustomFieldConfig | null | undefined,
): { ok: true; value: unknown } | { ok: false; error: string } {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true, value: null };
  }
  return validateAndNormalizeCustomValue(fieldType, raw, config);
}
