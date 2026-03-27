import { eq } from "drizzle-orm";
import { decryptSecret } from "@/lib/crypto";
import type { AppDb } from "@/lib/db";
import { tenantIntegrations } from "@/lib/db/schema";
import {
  listMessageTemplatesFromWabaFiltered,
  type MessageTemplateRecord,
} from "@/lib/meta/graph";

function matchesLanguage(
  tpl: MessageTemplateRecord,
  wanted: string,
): boolean {
  const a = (tpl.language ?? "").trim().toLowerCase().replace(/-/g, "_");
  const b = wanted.trim().toLowerCase().replace(/-/g, "_");
  return a === b;
}

function pickApprovedTemplate(
  list: MessageTemplateRecord[],
  templateLanguage: string,
): MessageTemplateRecord | undefined {
  const approved = list.filter(
    (t) => (t.status ?? "").toUpperCase() === "APPROVED",
  );
  return (
    approved.find((t) => matchesLanguage(t, templateLanguage)) ??
    approved[0]
  );
}

/**
 * Quando `campaigns.template_components` está vazio (campanhas antigas),
 * busca os componentes no Graph pelo nome + idioma para o preview na UI.
 */
export async function fetchTemplateComponentsForCampaignPreview(
  db: AppDb,
  tenantId: number,
  templateName: string,
  templateLanguage: string,
): Promise<unknown[] | null> {
  const [integration] = await db
    .select()
    .from(tenantIntegrations)
    .where(eq(tenantIntegrations.tenantId, tenantId))
    .limit(1);

  if (!integration.businessAccountId?.trim()) return null;
  const waba = integration.businessAccountId.trim();

  const token = decryptSecret(integration.encryptedAccessToken);
  const version = integration.graphApiVersion?.trim() || undefined;
  const name = templateName.trim();

  async function load(n: string): Promise<MessageTemplateRecord[]> {
    return listMessageTemplatesFromWabaFiltered(token, waba, {
      name: n,
      language: templateLanguage.trim(),
    }, version);
  }

  let list = await load(name);
  if (list.length === 0 && name !== name.toLowerCase()) {
    list = await load(name.toLowerCase());
  }

  const tpl = pickApprovedTemplate(list, templateLanguage);
  const comps = tpl?.components;
  return Array.isArray(comps) && comps.length > 0 ? comps : null;
}
