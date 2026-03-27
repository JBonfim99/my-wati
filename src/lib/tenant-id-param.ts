/** Segmento de URL: apenas inteiros positivos seguros em JS. */
export function parseTenantIdFromParam(param: string): number | null {
  if (!/^\d+$/.test(param)) return null;
  const n = Number(param);
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  return n;
}
