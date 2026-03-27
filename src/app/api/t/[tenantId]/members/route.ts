import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { profiles, tenantMemberships } from "@/lib/db/schema";
import { requireTenantContext } from "@/lib/api-tenant-context";
import { canManageMembers } from "@/lib/rbac";
import {
  assertNotSoleAdminChange,
  getMembershipRole,
} from "@/lib/membership-guards";
import { getSupabaseAdmin } from "@/lib/supabase/admin-client";

const inviteBodySchema = z.object({
  email: z.string().trim().email().max(320),
  role: z.enum(["admin", "editor", "support"]),
  locale: z.string().min(2).max(12).optional(),
});

type RouteCtx = { params: Promise<{ tenantId: string }> };

export async function GET(_req: Request, route: RouteCtx) {
  const gate = await requireTenantContext((await route.params).tenantId);
  if (!gate.ok) return gate.response;
  const ctx = gate.ctx;
  const db = getDb();
  const rows = await db
    .select({
      userId: tenantMemberships.userId,
      role: tenantMemberships.role,
      email: profiles.email,
      displayName: profiles.displayName,
    })
    .from(tenantMemberships)
    .innerJoin(profiles, eq(profiles.id, tenantMemberships.userId))
    .where(eq(tenantMemberships.tenantId, ctx.tenantId));

  return NextResponse.json({
    members: rows,
    me: ctx.userId,
    canManage: canManageMembers(ctx),
  });
}

export async function POST(req: NextRequest, route: RouteCtx) {
  const gate = await requireTenantContext((await route.params).tenantId);
  if (!gate.ok) return gate.response;
  const ctx = gate.ctx;
  if (!canManageMembers(ctx)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = inviteBodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "E-mail ou papel inválidos." },
      { status: 400 },
    );
  }
  const { email: emailRaw, role } = parsed.data;
  const emailNorm = emailRaw.trim().toLowerCase();

  const db = getDb();

  const [alreadyMember] = await db
    .select({ userId: tenantMemberships.userId })
    .from(tenantMemberships)
    .innerJoin(profiles, eq(profiles.id, tenantMemberships.userId))
    .where(
      and(
        eq(tenantMemberships.tenantId, ctx.tenantId),
        sql`lower(trim(${profiles.email})) = ${emailNorm}`,
      ),
    )
    .limit(1);

  if (alreadyMember) {
    return NextResponse.json(
      { error: "Este e-mail já pertence a um membro desta organização." },
      { status: 409 },
    );
  }

  let userId: string | null = null;

  const [prof] = await db
    .select({ id: profiles.id, email: profiles.email })
    .from(profiles)
    .where(sql`lower(trim(${profiles.email})) = ${emailNorm}`)
    .limit(1);

  if (prof) {
    userId = prof.id;
  } else {
    const authRes = await db.execute(
      sql`select id::text as id from auth.users where lower(trim(coalesce(email::text, ''))) = ${emailNorm} limit 1`,
    );
    const authRow = authRes[0] as { id: string } | undefined;
    if (authRow?.id) {
      userId = authRow.id;
      await db
        .insert(profiles)
        .values({
          id: userId,
          email: emailRaw.trim(),
        })
        .onConflictDoUpdate({
          target: profiles.id,
          set: { email: emailRaw.trim() },
        });
    }
  }

  if (!userId) {
    const admin = getSupabaseAdmin();
    if (!admin) {
      return NextResponse.json(
        {
          error:
            "O usuário ainda não existe. Configure SUPABASE_SERVICE_ROLE_KEY no servidor para enviar convites por e-mail, ou peça para a pessoa entrar uma vez com o link mágico antes de adicioná-la.",
        },
        { status: 503 },
      );
    }

    const origin =
      req.headers.get("origin") ??
      process.env.NEXT_PUBLIC_SITE_URL ??
      "http://localhost:3000";
    const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent("/select-tenant")}`;

    const { data, error } = await admin.auth.admin.inviteUserByEmail(
      emailRaw.trim(),
      {
        redirectTo,
      },
    );

    if (error) {
      const low = error.message.toLowerCase();
      if (
        low.includes("already") ||
        low.includes("registered") ||
        low.includes("exists")
      ) {
        const authRes2 = await db.execute(
          sql`select id::text as id from auth.users where lower(trim(coalesce(email::text, ''))) = ${emailNorm} limit 1`,
        );
        const row2 = authRes2[0] as { id: string } | undefined;
        if (row2?.id) {
          userId = row2.id;
          await db
            .insert(profiles)
            .values({ id: userId, email: emailRaw.trim() })
            .onConflictDoUpdate({
              target: profiles.id,
              set: { email: emailRaw.trim() },
            });
        }
      }
      if (!userId) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 },
        );
      }
    } else if (data.user?.id) {
      userId = data.user.id;
      await db
        .insert(profiles)
        .values({
          id: userId,
          email: emailRaw.trim(),
        })
        .onConflictDoUpdate({
          target: profiles.id,
          set: { email: emailRaw.trim() },
        });
    }
  }

  if (!userId) {
    return NextResponse.json(
      { error: "Não foi possível resolver o usuário." },
      { status: 400 },
    );
  }

  const [dup] = await db
    .select({ id: tenantMemberships.id })
    .from(tenantMemberships)
    .where(
      and(
        eq(tenantMemberships.tenantId, ctx.tenantId),
        eq(tenantMemberships.userId, userId),
      ),
    )
    .limit(1);

  if (dup) {
    return NextResponse.json(
      { error: "Este usuário já é membro desta organização." },
      { status: 409 },
    );
  }

  await db.insert(tenantMemberships).values({
    tenantId: ctx.tenantId,
    userId,
    role,
  });

  return NextResponse.json({ ok: true, userId }, { status: 201 });
}

export async function PATCH(req: NextRequest, route: RouteCtx) {
  const gate = await requireTenantContext((await route.params).tenantId);
  if (!gate.ok) return gate.response;
  const ctx = gate.ctx;
  if (!canManageMembers(ctx)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as {
    userId?: string;
    role?: "admin" | "editor" | "support";
  };
  if (!body.userId || !body.role) {
    return NextResponse.json({ error: "userId, role required" }, { status: 400 });
  }

  const db = getDb();
  const currentRole = await getMembershipRole(db, ctx.tenantId, body.userId);
  if (!currentRole) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const guard = await assertNotSoleAdminChange({
    db,
    tenantId: ctx.tenantId,
    currentRole,
    nextRole: body.role,
  });
  if (!guard.ok) {
    return NextResponse.json({ error: guard.message }, { status: 400 });
  }

  const [updated] = await db
    .update(tenantMemberships)
    .set({ role: body.role })
    .where(
      and(
        eq(tenantMemberships.tenantId, ctx.tenantId),
        eq(tenantMemberships.userId, body.userId),
      ),
    )
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ member: updated });
}

export async function DELETE(req: NextRequest, route: RouteCtx) {
  const gate = await requireTenantContext((await route.params).tenantId);
  if (!gate.ok) return gate.response;
  const ctx = gate.ctx;
  if (!canManageMembers(ctx)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as { userId?: string };
  if (!body.userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  const db = getDb();
  const currentRole = await getMembershipRole(db, ctx.tenantId, body.userId);
  if (!currentRole) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const guard = await assertNotSoleAdminChange({
    db,
    tenantId: ctx.tenantId,
    currentRole,
  });
  if (!guard.ok) {
    return NextResponse.json({ error: guard.message }, { status: 400 });
  }

  const [removed] = await db
    .delete(tenantMemberships)
    .where(
      and(
        eq(tenantMemberships.tenantId, ctx.tenantId),
        eq(tenantMemberships.userId, body.userId),
      ),
    )
    .returning();

  if (!removed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
