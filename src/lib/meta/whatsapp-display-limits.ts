/**
 * Valores exibidos alinhados à documentação Meta (limites de conversas únicas / 24h e throughput em mps).
 * @see https://developers.facebook.com/docs/whatsapp/messaging-limits/
 * @see https://developers.facebook.com/documentation/business-messaging/whatsapp/throughput/
 */

const MESSAGING_LIMIT_DOC =
  "https://developers.facebook.com/docs/whatsapp/messaging-limits/";
const THROUGHPUT_DOC =
  "https://developers.facebook.com/documentation/business-messaging/whatsapp/throughput/";

/** Tier devolvido por `whatsapp_business_manager_messaging_limit` ou campo legado `messaging_limit_tier`. */
export function uniqueRecipientsPer24hFromTier(
  raw: string | undefined,
): { value: number | null; unlimited: boolean } {
  const tier = (raw ?? "").trim().toUpperCase();
  if (!tier) return { value: null, unlimited: false };
  if (tier === "TIER_UNLIMITED") return { value: null, unlimited: true };
  const map: Record<string, number> = {
    TIER_50: 50,
    TIER_250: 250,
    TIER_1K: 1_000,
    TIER_10K: 10_000,
    TIER_100K: 100_000,
  };
  const n = map[tier];
  if (n != null) return { value: n, unlimited: false };
  return { value: null, unlimited: false };
}

/** Throughput Cloud API: até 80 mps por defeito; até 1 000 mps com upgrade automático (nível HIGH). */
export function cloudApiThroughputMps(levelRaw: unknown): number | null {
  if (levelRaw == null) return null;
  let level: string;
  if (typeof levelRaw === "string") {
    level = levelRaw;
  } else if (
    typeof levelRaw === "object" &&
    "level" in (levelRaw as object) &&
    typeof (levelRaw as { level?: unknown }).level === "string"
  ) {
    level = (levelRaw as { level: string }).level;
  } else {
    return null;
  }
  const u = level.trim().toUpperCase();
  if (u === "STANDARD") return 80;
  if (u === "HIGH") return 1_000;
  return null;
}

export function metaDocsLinks() {
  return { messagingLimits: MESSAGING_LIMIT_DOC, throughput: THROUGHPUT_DOC };
}
