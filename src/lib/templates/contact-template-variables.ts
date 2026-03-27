import { isValidNamedTemplatePlaceholderName } from "@/lib/meta/template-create-payload";

/** Placeholders reservados aos campos nativos da tabela `contacts`. */
export const STANDARD_CONTACT_TEMPLATE_PLACEHOLDERS = ["name", "email", "phone"] as const;

export type TemplateContactVariableRow = {
  placeholder: string;
  label: string;
  section: "standard" | "custom";
  /** Chave compatível com parâmetros nomeados da Meta: [a-z][a-z0-9_]* */
  metaCompatible: boolean;
};

type FieldDefRow = { key: string; label: string };

/**
 * Monta a lista de variáveis de template ligadas aos dados de contato do tenant
 * (campos padrão + campos personalizados).
 */
export function buildTemplateContactVariableRows(
  fieldDefs: FieldDefRow[],
  labels: {
    name: string;
    email: string;
    phone: string;
  },
): TemplateContactVariableRow[] {
  const standard: TemplateContactVariableRow[] = [
    {
      placeholder: "name",
      label: labels.name,
      section: "standard",
      metaCompatible: true,
    },
    {
      placeholder: "email",
      label: labels.email,
      section: "standard",
      metaCompatible: true,
    },
    {
      placeholder: "phone",
      label: labels.phone,
      section: "standard",
      metaCompatible: true,
    },
  ];

  const reserved = new Set<string>(STANDARD_CONTACT_TEMPLATE_PLACEHOLDERS);
  const custom: TemplateContactVariableRow[] = fieldDefs
    .filter((d) => !reserved.has(d.key.trim().toLowerCase()))
    .map((d) => ({
      placeholder: d.key.trim(),
      label: d.label.trim() || d.key.trim(),
      section: "custom" as const,
      metaCompatible: isValidNamedTemplatePlaceholderName(d.key.trim()),
    }))
    .filter((r) => r.placeholder.length > 0);

  return [...standard, ...custom];
}
