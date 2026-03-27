/**
 * Formato nacional BR típico em planilhas: DDD entre parênteses (2 dígitos, não o padrão US de 3)
 * + local com 8 (fixo) ou 9 (celular) dígitos.
 * Também aceita só dígitos já com 55 e comprimento E.164 BR (12–13 após o código do país).
 */
export function tryNormalizeBrazilCsvPhone(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  const digitsOnly = s.replace(/\D/g, "");
  if (
    digitsOnly.startsWith("55") &&
    (digitsOnly.length === 12 || digitsOnly.length === 13)
  ) {
    return `+${digitsOnly}`;
  }

  const m = s.match(/^\s*(?:\+?\s*55\s*)?\(\s*(\d{2})\s*\)\s*([\d\s.-]+)\s*$/);
  if (m) {
    const ddd = m[1];
    const rest = m[2].replace(/\D/g, "");
    if (!/^[1-9]\d$/.test(ddd)) return null;
    if (rest.length !== 8 && rest.length !== 9) return null;
    return `+55${ddd}${rest}`;
  }

  return null;
}

export function normalizeE164(phone: string): string | null {
  const trimmed = phone.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  return `+${digits}`;
}

/** Importação CSV: aplica heurística BR antes do E.164 genérico. */
export function normalizePhoneForCsvImport(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const br = tryNormalizeBrazilCsvPhone(trimmed);
  if (br) return br;
  return normalizeE164(trimmed);
}
