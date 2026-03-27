import { redirect } from "next/navigation";
import IntegrationSettingsClient from "@/components/settings/IntegrationSettingsClient";
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
  return <IntegrationSettingsClient tenantId={String(tenantId)} />;
}
