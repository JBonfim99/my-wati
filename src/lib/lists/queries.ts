import { and, asc, count, eq, inArray } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { contactListMembers, contactLists } from "@/lib/db/schema";

export type ContactListSummaryWithCountDto = {
  id: number;
  name: string;
  createdAt: Date;
  memberCount: number;
};

/**
 * Listas do tenant com contagem de membros (listas vazias = 0).
 */
export async function listContactListsWithMemberCounts(
  db: AppDb,
  tenantId: number,
): Promise<ContactListSummaryWithCountDto[]> {
  const lists = await db
    .select({
      id: contactLists.id,
      name: contactLists.name,
      createdAt: contactLists.createdAt,
    })
    .from(contactLists)
    .where(eq(contactLists.tenantId, tenantId))
    .orderBy(asc(contactLists.name));

  if (lists.length === 0) return [];

  const listIds = lists.map((l) => l.id);
  const countRows = await db
    .select({
      listId: contactListMembers.listId,
      n: count(),
    })
    .from(contactListMembers)
    .where(inArray(contactListMembers.listId, listIds))
    .groupBy(contactListMembers.listId);

  const countByList = new Map(
    countRows.map((r) => [r.listId, Number(r.n)]),
  );

  return lists.map((l) => ({
    ...l,
    memberCount: countByList.get(l.id) ?? 0,
  }));
}

export async function countListMembers(
  db: AppDb,
  tenantId: number,
  listId: number,
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(contactListMembers)
    .innerJoin(contactLists, eq(contactLists.id, contactListMembers.listId))
    .where(
      and(eq(contactLists.tenantId, tenantId), eq(contactLists.id, listId)),
    );
  return Number(row?.n ?? 0);
}
