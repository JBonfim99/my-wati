import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getCachedTenantSession, parseTenantIdFromParam } from "@/lib/session";
import { getDb } from "@/lib/db";
import { tenantIntegrations } from "@/lib/db/schema";
import { getCachedMessageTemplatesForTenant } from "@/lib/meta/cached-templates";
import {
  draftRowToMessageTemplateRecord,
} from "@/lib/meta/template-create-payload";
import type { MessageTemplateRecord } from "@/lib/meta/graph";
import { canManageIntegration, canWriteCampaigns } from "@/lib/rbac";
import { listMessageTemplateDrafts } from "@/lib/templates/template-draft-queries";
import { TemplatesPageClient } from "./_components/TemplatesPageClient";

function templateUpdatedMs(t: MessageTemplateRecord): number {
  const raw = t.last_updated_time;
  const n = Number(raw);
  if (Number.isNaN(n)) return 0;
  if (n > 1e12) return n;
  if (n > 1e8) return n * 1000;
  return 0;
}

export default async function TemplatesPage({
  params,
}: {
  params: Promise<{ locale: string; tenantId: string }>;
}) {
  const { tenantId: tp } = await params;
  const tenantId = parseTenantIdFromParam(tp);
  if (tenantId === null) redirect("/select-tenant");

  const ctx = await getCachedTenantSession(tenantId);
  if (!ctx) redirect("/select-tenant");

  const db = getDb();
  const [integration] = await db
    .select({
      businessAccountId: tenantIntegrations.businessAccountId,
    })
    .from(tenantIntegrations)
    .where(eq(tenantIntegrations.tenantId, ctx.tenantId))
    .limit(1);

  const integrationConfigured = Boolean(
    integration?.businessAccountId?.trim(),
  );

  let metaTemplates: MessageTemplateRecord[] = [];
  let initialError: string | null = null;
  try {
    metaTemplates = await getCachedMessageTemplatesForTenant(ctx.tenantId);
  } catch (e) {
    initialError =
      e instanceof Error ? e.message : "Erro ao listar templates";
  }

  const draftRows = await listMessageTemplateDrafts(db, ctx.tenantId);
  const draftRecords = draftRows.map((r) =>
    draftRowToMessageTemplateRecord({
      id: r.id,
      payload: r.payload,
      updatedAt: r.updatedAt,
    }),
  );
  const initialDraftSnapshots = draftRows.map((r) => ({
    id: r.id,
    payload: r.payload as Record<string, unknown>,
  }));

  const mergedTemplates = [...metaTemplates, ...draftRecords].sort(
    (a, b) => templateUpdatedMs(b) - templateUpdatedMs(a),
  );

  return (
    <TemplatesPageClient
      tenantId={String(ctx.tenantId)}
      initialTemplates={mergedTemplates}
      initialDraftSnapshots={initialDraftSnapshots}
      initialError={initialError}
      integrationConfigured={integrationConfigured}
      canManageMetaTemplates={canManageIntegration(ctx)}
      canSendCampaignFromTemplate={canWriteCampaigns(ctx)}
    />
  );
}
