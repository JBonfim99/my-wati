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
import {
  defaultTemplatesListFilters,
  filterTemplatesList,
  mergeTemplatesSorted,
  sliceTemplatesPage,
  TEMPLATES_LIST_PAGE_SIZE,
} from "@/lib/templates/template-list-query";
import { TemplatesPageClient } from "./_components/TemplatesPageClient";

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

  const [integrationRows, metaResult, draftRows] = await Promise.all([
    db
      .select({
        businessAccountId: tenantIntegrations.businessAccountId,
      })
      .from(tenantIntegrations)
      .where(eq(tenantIntegrations.tenantId, ctx.tenantId))
      .limit(1),
    (async (): Promise<
      | { ok: true; data: MessageTemplateRecord[] }
      | { ok: false; error: string }
    > => {
      try {
        const data = await getCachedMessageTemplatesForTenant(ctx.tenantId);
        return { ok: true, data };
      } catch (e) {
        return {
          ok: false,
          error:
            e instanceof Error ? e.message : "Erro ao listar templates",
        };
      }
    })(),
    listMessageTemplateDrafts(db, ctx.tenantId),
  ]);

  const [integration] = integrationRows;
  const integrationConfigured = Boolean(
    integration?.businessAccountId?.trim(),
  );

  let metaTemplates: MessageTemplateRecord[] = [];
  let initialError: string | null = null;
  if (metaResult.ok) {
    metaTemplates = metaResult.data;
  } else {
    initialError = metaResult.error;
  }
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

  const merged = mergeTemplatesSorted(metaTemplates, draftRecords);
  const filtered = filterTemplatesList(merged, defaultTemplatesListFilters());
  const { page: initialPage, nextCursor: initialNextCursor, total: initialTotal } =
    sliceTemplatesPage(filtered, 0, TEMPLATES_LIST_PAGE_SIZE);

  return (
    <TemplatesPageClient
      tenantId={String(ctx.tenantId)}
      initialTemplates={initialPage}
      initialNextCursor={initialNextCursor}
      initialTotal={initialTotal}
      initialDraftSnapshots={initialDraftSnapshots}
      initialError={initialError}
      integrationConfigured={integrationConfigured}
      canManageMetaTemplates={canManageIntegration(ctx)}
      canSendCampaignFromTemplate={canWriteCampaigns(ctx)}
    />
  );
}
