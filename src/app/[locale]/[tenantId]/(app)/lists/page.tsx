import {
  getCachedTenantSession,
  parseTenantIdFromParam,
} from "@/lib/session";
import { getListsWorkspaceData } from "@/lib/lists/workspace-data";
import ListsPageClient from "./lists-page-client";

export default async function ListsPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId: tp } = await params;
  const tenantId = parseTenantIdFromParam(tp);
  if (tenantId === null) return null;
  const ctx = await getCachedTenantSession(tenantId);
  if (!ctx) return null;
  const { lists, contacts } = await getListsWorkspaceData(ctx.tenantId);

  const initialLists = lists.map((l) => ({ id: l.id, name: l.name }));
  const initialContacts = contacts.map((c) => ({
    id: c.id,
    phoneE164: c.phoneE164,
    name: c.name,
    email: c.email,
  }));

  return (
    <ListsPageClient
      tenantId={String(ctx.tenantId)}
      initialLists={initialLists}
      initialContacts={initialContacts}
    />
  );
}
