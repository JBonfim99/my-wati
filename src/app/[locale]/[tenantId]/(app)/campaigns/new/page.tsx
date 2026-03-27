import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCachedTenantSession, parseTenantIdFromParam } from "@/lib/session";
import { getDb } from "@/lib/db";
import { listContactListsWithMemberCounts } from "@/lib/lists/queries";
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
  const lists = await listContactListsWithMemberCounts(db, ctx.tenantId);

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-lg space-y-6 p-6">
          <div className="h-8 w-48 animate-pulse rounded bg-neutral-200" />
          <div className="ds-card h-64 animate-pulse bg-neutral-50" />
        </div>
      }
    >
      <NewCampaignForm
        tenantId={String(ctx.tenantId)}
        initialLists={lists.map((l) => ({
          id: l.id,
          name: l.name,
          memberCount: l.memberCount,
        }))}
      />
    </Suspense>
  );
}
