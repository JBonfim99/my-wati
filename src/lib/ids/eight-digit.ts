import { z } from "zod";

/** IDs públicos de contato, lista e tag (8 dígitos, não sequenciais). */
export const EIGHT_DIGIT_MIN = 10_000_000;
export const EIGHT_DIGIT_MAX = 99_999_999;

export const zEightDigitId = z.coerce
  .number()
  .int()
  .min(EIGHT_DIGIT_MIN)
  .max(EIGHT_DIGIT_MAX);

export const zEightDigitIdArray = z.array(zEightDigitId);

/** Segmento de URL: exatamente 8 dígitos no intervalo válido. */
export function parsePublicEightDigitParam(s: string): number | null {
  if (!/^\d{8}$/.test(s)) return null;
  const n = Number(s);
  if (n < EIGHT_DIGIT_MIN || n > EIGHT_DIGIT_MAX) return null;
  return n;
}
