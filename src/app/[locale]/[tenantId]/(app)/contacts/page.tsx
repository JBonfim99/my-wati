import { redirect } from "next/navigation";
import { getCachedTenantSession, parseTenantIdFromParam } from "@/lib/session";
import { getDb } from "@/lib/db";
import {
  countContacts,
  listContacts,
  listContactFieldDefs,
  listAllTags,
  listContactLists,
} from "@/lib/contacts/queries";
import { serializeContact, encodeCursor } from "@/lib/contacts/dto";
import { CONTACTS_LIST_PAGE_SIZE } from "./_components/contacts-list-query";
import { ContactsPageClient } from "./_components/ContactsPageClient";

export default async function ContactsPage({
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
  const [
    { contacts: rawContacts, nextCursor: rawCursor },
    fieldDefs,
    allTags,
    allLists,
    initialTotal,
  ] = await Promise.all([
    listContacts(db, ctx.tenantId, { limit: CONTACTS_LIST_PAGE_SIZE }),
    listContactFieldDefs(db, ctx.tenantId),
    listAllTags(db, ctx.tenantId),
    listContactLists(db, ctx.tenantId),
    countContacts(db, ctx.tenantId, undefined),
  ]);

  const initialContacts = rawContacts.map(serializeContact);
  const initialNextCursor = rawCursor
    ? encodeCursor(rawCursor.updatedAt, rawCursor.id)
    : null;

  return (
    <ContactsPageClient
      tenantId={String(ctx.tenantId)}
      role={ctx.role}
      initialContacts={initialContacts}
      initialNextCursor={initialNextCursor}
      initialTotal={initialTotal}
      fieldDefs={fieldDefs}
      allTags={allTags}
      allLists={allLists}
    />
  );
}
