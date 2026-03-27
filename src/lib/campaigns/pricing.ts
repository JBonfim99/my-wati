/** Preços indicativos por conversa/template (USD), conforme pedido do produto. */
export const USD_PER_MESSAGE = {
  MARKETING: 0.07,
  UTILITY: 0.03,
  AUTHENTICATION: 0.01,
} as const;

export type TemplatePricingCategory = keyof typeof USD_PER_MESSAGE;

export function normalizeTemplateCategory(
  raw: string | null | undefined,
): TemplatePricingCategory {
  const u = (raw ?? "").toUpperCase();
  if (u === "UTILITY") return "UTILITY";
  if (u === "AUTHENTICATION") return "AUTHENTICATION";
  return "MARKETING";
}

export function usdPerMessageForCategory(cat: TemplatePricingCategory): number {
  return USD_PER_MESSAGE[cat];
}

export function estimateCampaignCostUsd(
  category: TemplatePricingCategory,
  recipientCount: number,
): number {
  const n = Math.max(0, recipientCount);
  return Math.round(usdPerMessageForCategory(category) * n * 10_000) / 10_000;
}
