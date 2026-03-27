import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getCachedTenantSession, parseTenantIdFromParam } from "@/lib/session";
import { getDb } from "@/lib/db";
import { contactLists } from "@/lib/db/schema";
import { NewCampaignForm } from "./_components/NewCampaignForm";

export default async function NewCampaignPage({
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
  const lists = await db
    .select({ id: contactLists.id, name: contactLists.name })
    .from(contactLists)
    .where(eq(contactLists.tenantId, ctx.tenantId));

  return (
    <NewCampaignForm
      tenantId={String(ctx.tenantId)}
      initialLists={lists}
    />
  );
}
