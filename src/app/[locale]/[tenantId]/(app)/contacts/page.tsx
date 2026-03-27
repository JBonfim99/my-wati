import { redirect } from "next/navigation";
import { getCachedTenantSession, parseTenantIdFromParam } from "@/lib/session";
import { getDb } from "@/lib/db";
import {
  listContacts,
  listContactFieldDefs,
  listAllTags,
} from "@/lib/contacts/queries";
import { serializeContact, encodeCursor } from "@/lib/contacts/dto";
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
  const [{ contacts: rawContacts, nextCursor: rawCursor }, fieldDefs, allTags] =
    await Promise.all([
      listContacts(db, ctx.tenantId, { limit: 50 }),
      listContactFieldDefs(db, ctx.tenantId),
      listAllTags(db, ctx.tenantId),
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
      fieldDefs={fieldDefs}
      allTags={allTags}
    />
  );
}
