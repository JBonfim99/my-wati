/**
 * postgres.js frequentemente devolve `timestamptz` como string; agregações SQL idem.
 * Normaliza para `Date` para uso com `.toISOString()` no servidor.
 */
export function coercePgDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}
