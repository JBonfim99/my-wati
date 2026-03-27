import { unstable_cache } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { tenantIntegrations } from "@/lib/db/schema";
import { decryptSecret } from "@/lib/crypto";
import { listMessageTemplatesFromWaba } from "@/lib/meta/graph";

export function wabaTemplatesCacheTag(tenantId: number): string {
  return `waba-templates-${tenantId}`;
}

const WABA_TEMPLATES_REVALIDATE_SECONDS = Math.max(
  30,
  Number(process.env.WABA_TEMPLATES_CACHE_SECONDS ?? 120),
);

/**
 * Lista templates da Meta com cache por tenant (Next `unstable_cache`).
 * Invalidar com `revalidateTag(wabaTemplatesCacheTag(tenantId))` após alterar integração.
 */
export function getCachedMessageTemplatesForTenant(tenantId: number) {
  return unstable_cache(
    async () => {
      const db = getDb();
      const [integration] = await db
        .select()
        .from(tenantIntegrations)
        .where(eq(tenantIntegrations.tenantId, tenantId))
        .limit(1);

      if (!integration?.businessAccountId?.trim()) {
        return [];
      }

      const token = decryptSecret(integration.encryptedAccessToken);
      return listMessageTemplatesFromWaba(
        token,
        integration.businessAccountId.trim(),
        integration.graphApiVersion,
      );
    },
    ["waba-templates", String(tenantId)],
    {
      revalidate: WABA_TEMPLATES_REVALIDATE_SECONDS,
      tags: [wabaTemplatesCacheTag(tenantId)],
    },
  )();
}
