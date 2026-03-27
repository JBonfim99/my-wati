import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { eq } from "drizzle-orm";
import { getCachedTenantSession, parseTenantIdFromParam } from "@/lib/session";
import { getDb } from "@/lib/db";
import { tenantIntegrations } from "@/lib/db/schema";
import { canManageIntegration } from "@/lib/rbac";
import { listContactFieldDefs } from "@/lib/contacts/queries";
import {
  defaultTemplateFormState,
  parseTemplateFormPayload,
} from "@/lib/meta/template-create-payload";
import { buildTemplateContactVariableRows } from "@/lib/templates/contact-template-variables";
import { getMessageTemplateDraftById } from "@/lib/templates/template-draft-queries";
import { TemplateCreatePageClient } from "../_components/TemplateCreatePageClient";

export default async function NewTemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; tenantId: string }>;
  searchParams: Promise<{ draftId?: string }>;
}) {
  const { tenantId: tp } = await params;
  const tenantId = parseTenantIdFromParam(tp);
  if (tenantId === null) redirect("/select-tenant");

  const ctx = await getCachedTenantSession(tenantId);
  if (!ctx) redirect("/select-tenant");

  if (!canManageIntegration(ctx)) {
    redirect(`/${tenantId}/templates`);
  }

  const sp = await searchParams;
  const draftId =
    typeof sp.draftId === "string" && sp.draftId.trim() ? sp.draftId.trim() : null;

  const db = getDb();
  const tCreate = await getTranslations("app.templates.create");

  let initialState = defaultTemplateFormState();
  if (draftId) {
    const row = await getMessageTemplateDraftById(db, ctx.tenantId, draftId);
    if (!row) notFound();
    initialState = parseTemplateFormPayload(row.payload);
  }

  const [integrationRows, fieldDefs] = await Promise.all([
    db
      .select({
        businessAccountId: tenantIntegrations.businessAccountId,
      })
      .from(tenantIntegrations)
      .where(eq(tenantIntegrations.tenantId, ctx.tenantId))
      .limit(1),
    listContactFieldDefs(db, ctx.tenantId),
  ]);

  const integration = integrationRows[0];
  const integrationConfigured = Boolean(
    integration?.businessAccountId?.trim(),
  );

  const contactTemplateVariables = buildTemplateContactVariableRows(
    fieldDefs.map((d) => ({ key: d.key, label: d.label })),
    {
      name: tCreate("contactVarName"),
      email: tCreate("contactVarEmail"),
      phone: tCreate("contactVarPhone"),
    },
  );

  return (
    <TemplateCreatePageClient
      tenantId={String(ctx.tenantId)}
      draftId={draftId}
      initialState={initialState}
      integrationConfigured={integrationConfigured}
      contactTemplateVariables={contactTemplateVariables}
    />
  );
}
