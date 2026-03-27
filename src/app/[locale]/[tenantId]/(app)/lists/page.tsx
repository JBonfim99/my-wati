import { redirect } from "next/navigation";
import { getCachedTenantSession, parseTenantIdFromParam } from "@/lib/session";
import { getDb } from "@/lib/db";
import { listContactListsWithMemberCounts } from "@/lib/lists/queries";
import { ListsPageClient } from "./_components/ListsPageClient";

export default async function ListsPage({
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
  const rows = await listContactListsWithMemberCounts(db, ctx.tenantId);
  const initialLists = rows.map((l) => ({
    id: l.id,
    name: l.name,
    createdAt: l.createdAt.toISOString(),
    memberCount: l.memberCount,
  }));

  return (
    <ListsPageClient
      tenantId={String(ctx.tenantId)}
      role={ctx.role}
      initialLists={initialLists}
    />
  );
}
