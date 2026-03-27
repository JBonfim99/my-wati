import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { countListMembers } from "@/lib/lists/queries";
import { getDb } from "@/lib/db";
import { contactLists } from "@/lib/db/schema";
import { requireTenantContext } from "@/lib/api-tenant-context";
import { parsePublicEightDigitParam } from "@/lib/ids/eight-digit";
import { canWriteContacts } from "@/lib/rbac";

type Ctx = { params: Promise<{ tenantId: string; id: string }> };

const patchListSchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório").max(200),
});

export async function PATCH(req: NextRequest, route: Ctx) {
  const { tenantId: tp, id: idParam } = await route.params;
  const listId = parsePublicEightDigitParam(idParam);
  if (listId === null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const gate = await requireTenantContext(tp);
  if (!gate.ok) return gate.response;
  const session = gate.ctx;
  if (!canWriteContacts(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = patchListSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
      { status: 400 },
    );
  }
  const { name } = parsed.data;

  const db = getDb();
  const [existing] = await db
    .select({ id: contactLists.id })
    .from(contactLists)
    .where(
      and(eq(contactLists.tenantId, session.tenantId), eq(contactLists.id, listId)),
    )
    .limit(1);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [row] = await db
    .update(contactLists)
    .set({ name })
    .where(
      and(eq(contactLists.tenantId, session.tenantId), eq(contactLists.id, listId)),
    )
    .returning({
      id: contactLists.id,
      name: contactLists.name,
      createdAt: contactLists.createdAt,
    });

  const memberCount = await countListMembers(db, session.tenantId, listId);

  return NextResponse.json({
    list: row
      ? {
          id: row.id,
          name: row.name,
          createdAt: row.createdAt.toISOString(),
          memberCount,
        }
      : null,
  });
}

export async function DELETE(_req: NextRequest, route: Ctx) {
  const { tenantId: tp, id: idParam } = await route.params;
  const listId = parsePublicEightDigitParam(idParam);
  if (listId === null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const gate = await requireTenantContext(tp);
  if (!gate.ok) return gate.response;
  const session = gate.ctx;
  if (!canWriteContacts(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getDb();
  const [existing] = await db
    .select({ id: contactLists.id })
    .from(contactLists)
    .where(
      and(eq(contactLists.tenantId, session.tenantId), eq(contactLists.id, listId)),
    )
    .limit(1);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db
    .delete(contactLists)
    .where(
      and(eq(contactLists.tenantId, session.tenantId), eq(contactLists.id, listId)),
    );

  return NextResponse.json({ ok: true });
}
