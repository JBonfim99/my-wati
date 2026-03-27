import type { FieldType } from "@/lib/contacts/validate-custom-value";

export const CUSTOM_FILTER_OPS_BY_TYPE: Record<FieldType, readonly string[]> =
  {
    text: ["eq", "ne", "contains", "not_contains", "empty", "not_empty"],
    select: ["eq", "ne", "contains", "not_contains", "empty", "not_empty"],
    number: ["eq", "ne", "gte", "lte", "empty", "not_empty"],
    boolean: ["is_true", "is_false", "empty", "not_empty"],
    date: ["before", "after", "on", "empty", "not_empty"],
  } as const;

export const SYSTEM_FIELD_OPS = [
  "eq",
  "ne",
  "contains",
  "not_contains",
  "empty",
  "not_empty",
] as const;

export type SystemFieldFilterOp = (typeof SYSTEM_FIELD_OPS)[number];

export function isCustomOpAllowed(ft: FieldType, op: string): boolean {
  return (CUSTOM_FILTER_OPS_BY_TYPE[ft] ?? []).includes(op);
}

export function customOpNeedsValue(ft: FieldType, op: string): boolean {
  if (op === "empty" || op === "not_empty") return false;
  if (ft === "boolean" && (op === "is_true" || op === "is_false")) return false;
  return true;
}

export function systemFieldOpNeedsValue(op: SystemFieldFilterOp): boolean {
  return !["empty", "not_empty"].includes(op);
}

export function defaultCustomOpForType(ft: FieldType): string {
  if (ft === "number") return "eq";
  if (ft === "boolean") return "is_true";
  if (ft === "date") return "on";
  return "contains";
}
