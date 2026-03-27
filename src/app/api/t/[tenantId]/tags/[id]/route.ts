import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { slugify } from "@/lib/contacts/slug";
import { getDb } from "@/lib/db";
import { tags } from "@/lib/db/schema";
import { requireTenantContext } from "@/lib/api-tenant-context";
import { canWriteContacts } from "@/lib/rbac";

type Ctx = { params: Promise<{ tenantId: string; id: string }> };

const patchTagSchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório").max(100),
});

export async function PATCH(req: NextRequest, route: Ctx) {
  const { tenantId: tp, id } = await route.params;
  const gate = await requireTenantContext(tp);
  if (!gate.ok) return gate.response;
  const session = gate.ctx;
  if (!canWriteContacts(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = patchTagSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
      { status: 400 },
    );
  }
  const { name } = parsed.data;

  const db = getDb();
  const [existing] = await db
    .select()
    .from(tags)
    .where(and(eq(tags.tenantId, session.tenantId), eq(tags.id, id)))
    .limit(1);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const key = slugify(name);
  let n = 0;
  let candidate = key;
  while (n < 50) {
    const [taken] = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.tenantId, session.tenantId), eq(tags.slug, candidate)))
      .limit(1);
    if (!taken || taken.id === id) break;
    n += 1;
    candidate = `${key}-${n}`;
  }

  const [row] = await db
    .update(tags)
    .set({ name, slug: candidate })
    .where(and(eq(tags.tenantId, session.tenantId), eq(tags.id, id)))
    .returning({ id: tags.id, name: tags.name, slug: tags.slug, createdAt: tags.createdAt });

  return NextResponse.json({
    tag: row
      ? { id: row.id, name: row.name, slug: row.slug, createdAt: row.createdAt.toISOString() }
      : null,
  });
}

export async function DELETE(_req: NextRequest, route: Ctx) {
  const { tenantId: tp, id } = await route.params;
  const gate = await requireTenantContext(tp);
  if (!gate.ok) return gate.response;
  const session = gate.ctx;
  if (!canWriteContacts(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const db = getDb();
  const [existing] = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.tenantId, session.tenantId), eq(tags.id, id)))
    .limit(1);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db
    .delete(tags)
    .where(and(eq(tags.tenantId, session.tenantId), eq(tags.id, id)));

  return NextResponse.json({ ok: true });
}
