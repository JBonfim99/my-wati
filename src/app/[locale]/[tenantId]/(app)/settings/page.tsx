import { redirect } from "next/navigation";
import IntegrationSettingsClient from "@/components/settings/IntegrationSettingsClient";
import { getDb } from "@/lib/db";
import { getIntegrationSettingsDto } from "@/lib/settings/integration-summary";
import { canManageIntegration } from "@/lib/rbac";
import {
  getCachedTenantSession,
  parseTenantIdFromParam,
} from "@/lib/session";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string; tenantId: string }>;
}) {
  const { tenantId: tp } = await params;
  const tenantId = parseTenantIdFromParam(tp);
  if (tenantId === null) redirect("/select-tenant");
  const ctx = await getCachedTenantSession(tenantId);
  if (!ctx || !canManageIntegration(ctx)) {
    redirect(`/${tenantId}/dashboard`);
  }
  const db = getDb();
  const initialIntegration = await getIntegrationSettingsDto(db, tenantId);
  return (
    <IntegrationSettingsClient
      tenantId={String(tenantId)}
      initialIntegration={initialIntegration}
    />
  );
}
