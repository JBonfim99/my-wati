import { eq } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { tenantIntegrations } from "@/lib/db/schema";

/** Há registro de integração WhatsApp Cloud com token persistido (organização “conectada”). */
export async function hasActiveWhatsAppIntegration(
  db: AppDb,
  tenantId: number,
): Promise<boolean> {
  const [row] = await db
    .select({ token: tenantIntegrations.encryptedAccessToken })
    .from(tenantIntegrations)
    .where(eq(tenantIntegrations.tenantId, tenantId))
    .limit(1);
  if (!row) return false;
  return Boolean(row.token?.length);
}
