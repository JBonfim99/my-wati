import type { ContactCustomFieldConfig } from "@/lib/db/schema";
import {
  validateAndNormalizeCustomValue,
  type FieldType,
} from "@/lib/contacts/validate-custom-value";

/** Compara valores já normalizados (ou equivalentes após normalização). */
export function sameNormalizedCustomValue(
  fieldType: FieldType,
  a: unknown,
  b: unknown,
  config: ContactCustomFieldConfig | null | undefined,
): boolean {
  const ra = validateAndNormalizeCustomValue(fieldType, a, config);
  const rb = validateAndNormalizeCustomValue(fieldType, b, config);
  if (!ra.ok || !rb.ok) return false;
  return JSON.stringify(ra.value) === JSON.stringify(rb.value);
}
