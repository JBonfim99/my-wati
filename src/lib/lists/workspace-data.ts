import { getDb } from "@/lib/db";
import { listContactListsWithMemberCounts } from "@/lib/lists/queries";

/** Dados agregados para GET /api/t/.../lists/workspace (sem round-trip extra na RSC de listas). */
export async function getListsWorkspaceData(tenantId: number) {
  const db = getDb();
  const lists = await listContactListsWithMemberCounts(db, tenantId);
  return { lists };
}
