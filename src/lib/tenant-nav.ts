import { inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { tenants } from "@/lib/db/schema";
import { listMembershipsForUser } from "@/lib/session";

export type TenantNavOption = {
  id: string;
  name: string;
  slug: string;
};

/**
 * Lista organizações do usuário e indica a ativa (URL).
 */
export async function getTenantNavOptions(
  userId: string,
  currentTenantId: number,
): Promise<{
  tenants: TenantNavOption[];
  current: TenantNavOption | null;
}> {
  const memberships = await listMembershipsForUser(userId);
  if (memberships.length === 0) {
    return { tenants: [], current: null };
  }
  const ids = [...new Set(memberships.map((m) => m.tenantId))];
  const db = getDb();
  const rows = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
    })
    .from(tenants)
    .where(inArray(tenants.id, ids));

  const order = new Map(ids.map((id, i) => [id, i]));
  rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  const toOpt = (r: (typeof rows)[0]): TenantNavOption => ({
    id: String(r.id),
    name: r.name,
    slug: r.slug,
  });

  const currentRow = rows.find((r) => r.id === currentTenantId) ?? null;
  return {
    tenants: rows.map(toOpt),
    current: currentRow ? toOpt(currentRow) : null,
  };
}
