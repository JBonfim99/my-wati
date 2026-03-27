import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contactLists, contacts } from "@/lib/db/schema";

/** Queries usadas por GET /api/lists/workspace e pela página RSC (sem round-trip HTTP). */
export async function getListsWorkspaceData(tenantId: number) {
  const db = getDb();
  const [lists, contactRows] = await Promise.all([
    db
      .select()
      .from(contactLists)
      .where(eq(contactLists.tenantId, tenantId)),
    db
      .select()
      .from(contacts)
      .where(eq(contacts.tenantId, tenantId)),
  ]);
  return { lists, contacts: contactRows };
}
