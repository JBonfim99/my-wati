import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db";
import { tenantMemberships } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

export { parseTenantIdFromParam } from "@/lib/tenant-id-param";

export type MembershipRole = "admin" | "editor" | "support";

export type SessionContext = {
  userId: string;
  email: string;
  tenantId: number;
  role: MembershipRole;
};

/**
 * postgres.js costuma devolver bigint como string; sem migração UUID→bigint,
 * o Drizzle pode mapear UUID para number e virar NaN. Só aceitamos ids numéricos válidos.
 */
export function normalizeTenantIdFromDb(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") {
    return Number.isFinite(raw) &&
      raw > 0 &&
      Number.isSafeInteger(raw)
      ? raw
      : null;
  }
  if (typeof raw === "bigint") {
    const n = Number(raw);
    return Number.isSafeInteger(n) && n > 0 ? n : null;
  }
  if (typeof raw === "string") {
    const t = raw.trim();
    if (/^\d+$/.test(t)) {
      const n = Number(t);
      return Number.isSafeInteger(n) && n > 0 ? n : null;
    }
    return null;
  }
  return null;
}

export async function getSessionUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return {
    id: data.user.id,
    email: data.user.email ?? "",
  };
}

/** Valida membership para o tenant do path (deep link / multi-aba). */
export async function getSessionContextForTenant(
  tenantId: number,
): Promise<SessionContext | null> {
  const user = await getSessionUser();
  if (!user) return null;

  const db = getDb();
  const [row] = await db
    .select()
    .from(tenantMemberships)
    .where(
      and(
        eq(tenantMemberships.userId, user.id),
        eq(tenantMemberships.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (!row) return null;

  const tid = normalizeTenantIdFromDb(row.tenantId as unknown);
  if (tid === null) return null;

  return {
    userId: user.id,
    email: user.email,
    tenantId: tid,
    role: row.role as MembershipRole,
  };
}

/** Um lookup por request (layout + páginas no mesmo tenant). */
export const getCachedTenantSession = cache(getSessionContextForTenant);

export async function listMembershipsForUser(userId: string) {
  const db = getDb();
  const rows = await db
    .select({
      tenantId: tenantMemberships.tenantId,
      role: tenantMemberships.role,
    })
    .from(tenantMemberships)
    .where(eq(tenantMemberships.userId, userId));

  return rows
    .map((r) => ({
      tenantId: normalizeTenantIdFromDb(r.tenantId as unknown),
      role: r.role as MembershipRole,
    }))
    .filter(
      (r): r is { tenantId: number; role: MembershipRole } =>
        r.tenantId !== null,
    );
}
