import { eq } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { tenantIntegrations } from "@/lib/db/schema";

/** DTO seguro para UI / API GET (sem segredos em texto claro). */
export type IntegrationSettingsDto = {
  phoneNumberId: string;
  businessAccountId: string | null;
  graphApiVersion: string;
  hasAccessToken: boolean;
  hasVerifyToken: boolean;
  hasAppSecret: boolean;
  updatedAt: string;
};

export async function getIntegrationSettingsDto(
  db: AppDb,
  tenantId: number,
): Promise<IntegrationSettingsDto | null> {
  const [row] = await db
    .select({
      phoneNumberId: tenantIntegrations.phoneNumberId,
      businessAccountId: tenantIntegrations.businessAccountId,
      graphApiVersion: tenantIntegrations.graphApiVersion,
      hasToken: tenantIntegrations.encryptedAccessToken,
      appSecret: tenantIntegrations.appSecret,
      updatedAt: tenantIntegrations.updatedAt,
    })
    .from(tenantIntegrations)
    .where(eq(tenantIntegrations.tenantId, tenantId))
    .limit(1);

  if (!row) return null;

  return {
    phoneNumberId: row.phoneNumberId,
    businessAccountId: row.businessAccountId,
    graphApiVersion: row.graphApiVersion,
    hasAccessToken: Boolean(row.hasToken),
    hasVerifyToken: true,
    hasAppSecret: Boolean(row.appSecret),
    updatedAt: row.updatedAt.toISOString(),
  };
}
