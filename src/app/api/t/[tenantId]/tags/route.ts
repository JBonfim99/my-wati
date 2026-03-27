import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { slugify } from "@/lib/contacts/slug";
import { getDb } from "@/lib/db";
import { tags } from "@/lib/db/schema";
import { requireTenantContext } from "@/lib/api-tenant-context";
import { canWriteContacts } from "@/lib/rbac";

type RouteCtx = { params: Promise<{ tenantId: string }> };

export async function GET(_req: Request, route: RouteCtx) {
  const gate = await requireTenantContext((await route.params).tenantId);
  if (!gate.ok) return gate.response;
  const ctx = gate.ctx;
  const db = getDb();
  const rows = await db
    .select({
      id: tags.id,
      name: tags.name,
      slug: tags.slug,
      createdAt: tags.createdAt,
    })
    .from(tags)
    .where(eq(tags.tenantId, ctx.tenantId))
    .orderBy(asc(tags.name));
  return NextResponse.json({
    tags: rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      createdAt: r.createdAt.toISOString(),
    })),
    role: ctx.role,
  });
}

export async function POST(req: NextRequest, route: RouteCtx) {
  const gate = await requireTenantContext((await route.params).tenantId);
  if (!gate.ok) return gate.response;
  const ctx = gate.ctx;
  if (!canWriteContacts(ctx)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as { name?: string };
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });
  }

  let key = slugify(name);
  const db = getDb();
  let n = 0;
  let candidate = key;
  while (n < 50) {
    const [taken] = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.tenantId, ctx.tenantId), eq(tags.slug, candidate)))
      .limit(1);
    if (!taken) break;
    n += 1;
    candidate = `${key}-${n}`;
  }

  const [row] = await db
    .insert(tags)
    .values({
      tenantId: ctx.tenantId,
      name,
      slug: candidate,
    })
    .returning({
      id: tags.id,
      name: tags.name,
      slug: tags.slug,
      createdAt: tags.createdAt,
    });

  if (!row) {
    return NextResponse.json({ error: "Erro ao criar" }, { status: 500 });
  }

  return NextResponse.json(
    {
      tag: {
        id: row.id,
        name: row.name,
        slug: row.slug,
        createdAt: row.createdAt.toISOString(),
      },
    },
    { status: 201 },
  );
}
