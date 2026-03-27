import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { eq } from "drizzle-orm";
import { getCachedTenantSession, parseTenantIdFromParam } from "@/lib/session";
import { getDb } from "@/lib/db";
import { tenantIntegrations } from "@/lib/db/schema";
import { canManageIntegration, canWriteContacts } from "@/lib/rbac";
import { listContactFieldDefs } from "@/lib/contacts/queries";
import {
  defaultTemplateFormState,
  mergeTenantFixedSamplesIntoFormState,
  parseTemplateFormPayload,
} from "@/lib/meta/template-create-payload";
import {
  buildTemplateContactVariableRows,
  mergeTenantFixedTemplateVariableRows,
} from "@/lib/templates/contact-template-variables";
import { listTenantFixedFields } from "@/lib/tenant-fixed-fields/queries";
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

  const [integrationRows, fieldDefs, tenantFixedRows] = await Promise.all([
    db
      .select({
        businessAccountId: tenantIntegrations.businessAccountId,
      })
      .from(tenantIntegrations)
      .where(eq(tenantIntegrations.tenantId, ctx.tenantId))
      .limit(1),
    listContactFieldDefs(db, ctx.tenantId),
    listTenantFixedFields(db, ctx.tenantId),
  ]);

  const tenantFixedForTemplate = tenantFixedRows.map((f) => ({
    key: f.key,
    label: f.label,
    value: f.value,
  }));

  let initialState = defaultTemplateFormState();
  if (draftId) {
    const row = await getMessageTemplateDraftById(db, ctx.tenantId, draftId);
    if (!row) notFound();
    initialState = parseTemplateFormPayload(row.payload);
  }

  initialState = mergeTenantFixedSamplesIntoFormState(
    initialState,
    tenantFixedForTemplate,
  );

  const integration = integrationRows[0];
  const integrationConfigured = Boolean(
    integration?.businessAccountId?.trim(),
  );

  const contactTemplateVariables = mergeTenantFixedTemplateVariableRows(
    buildTemplateContactVariableRows(
      fieldDefs.map((d) => ({ key: d.key, label: d.label })),
      {
        name: tCreate("contactVarName"),
        email: tCreate("contactVarEmail"),
        phone: tCreate("contactVarPhone"),
      },
    ),
    tenantFixedForTemplate,
  );

  return (
    <TemplateCreatePageClient
      tenantId={String(ctx.tenantId)}
      draftId={draftId}
      initialState={initialState}
      integrationConfigured={integrationConfigured}
      contactTemplateVariables={contactTemplateVariables}
      tenantFixedFields={tenantFixedForTemplate}
      canWriteTenantFixed={canWriteContacts(ctx)}
    />
  );
}
