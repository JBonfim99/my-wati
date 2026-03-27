export function normalizeE164(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  return digits.startsWith("+") ? `+${digits.replace(/^\+/, "")}` : `+${digits}`;
}
