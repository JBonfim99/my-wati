import { eq } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { tenantIntegrations } from "@/lib/db/schema";
import { decryptSecret } from "@/lib/crypto";

export type TenantMetaIntegration = {
  accessToken: string;
  businessAccountId: string;
  graphApiVersion: string;
};

export async function getTenantMetaIntegration(
  db: AppDb,
  tenantId: number,
): Promise<
  | { ok: true; integration: TenantMetaIntegration }
  | { ok: false; error: string; status: number }
> {
  const [row] = await db
    .select()
    .from(tenantIntegrations)
    .where(eq(tenantIntegrations.tenantId, tenantId))
    .limit(1);

  if (!row) {
    return {
      ok: false,
      error: "Integração não configurada",
      status: 400,
    };
  }

  const waba = row.businessAccountId?.trim();
  if (!waba) {
    return {
      ok: false,
      error:
        "Defina o WABA ID (WhatsApp Business Account ID) em Integração para usar templates.",
      status: 400,
    };
  }

  return {
    ok: true,
    integration: {
      accessToken: decryptSecret(row.encryptedAccessToken),
      businessAccountId: waba,
      graphApiVersion: row.graphApiVersion?.trim() || "v21.0",
    },
  };
}
