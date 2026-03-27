/** Estados em que a Meta costuma permitir edição (não aprovado / não excluído). */
export function isMessageTemplateEditableByMeta(
  status: string | undefined,
): boolean {
  const s = (status ?? "").toUpperCase();
  if (!s) return false;
  const blocked = new Set([
    "APPROVED",
    "DELETED",
    "PENDING_DELETION",
    "DISABLED",
  ]);
  return !blocked.has(s);
}
