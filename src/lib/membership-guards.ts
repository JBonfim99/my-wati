import { and, count, eq } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { tenantMemberships } from "@/lib/db/schema";
import type { MembershipRole } from "@/lib/session";

export async function countAdminsInTenant(
  db: AppDb,
  tenantId: number,
): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(tenantMemberships)
    .where(
      and(
        eq(tenantMemberships.tenantId, tenantId),
        eq(tenantMemberships.role, "admin"),
      ),
    );
  return Number(row?.c ?? 0);
}

export async function getMembershipRole(
  db: AppDb,
  tenantId: number,
  userId: string,
): Promise<MembershipRole | null> {
  const [row] = await db
    .select({ role: tenantMemberships.role })
    .from(tenantMemberships)
    .where(
      and(
        eq(tenantMemberships.tenantId, tenantId),
        eq(tenantMemberships.userId, userId),
      ),
    )
    .limit(1);
  return row ? (row.role as MembershipRole) : null;
}

/** Impede remover ou rebaixar o único admin do tenant. */
export async function assertNotSoleAdminChange(params: {
  db: AppDb;
  tenantId: number;
  /** Papel atual do alvo */
  currentRole: MembershipRole;
  /** Novo papel (PATCH) ou omitido se for remoção (DELETE) */
  nextRole?: MembershipRole;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const { db, tenantId, currentRole, nextRole } = params;
  if (currentRole !== "admin") return { ok: true };
  const removingOrDemoting =
    nextRole === undefined || nextRole !== "admin";
  if (!removingOrDemoting) return { ok: true };

  const admins = await countAdminsInTenant(db, tenantId);
  if (admins <= 1) {
    return {
      ok: false,
      message:
        "Você não pode remover ou rebaixar o único administrador desta organização.",
    };
  }
  return { ok: true };
}
