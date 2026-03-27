import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  contactListMembers,
  contactLists,
  contacts,
} from "@/lib/db/schema";
import { requireTenantContext } from "@/lib/api-tenant-context";
import { canWriteContacts } from "@/lib/rbac";

type RouteCtx = { params: Promise<{ tenantId: string }> };

const createListSchema = z.object({
  name: z.string().trim().min(1, "name required").max(200),
  contactIds: z.array(z.string().uuid()).optional(),
});

export async function GET(_req: Request, route: RouteCtx) {
  const gate = await requireTenantContext((await route.params).tenantId);
  if (!gate.ok) return gate.response;
  const ctx = gate.ctx;
  const db = getDb();
  const lists = await db
    .select()
    .from(contactLists)
    .where(eq(contactLists.tenantId, ctx.tenantId));
  return NextResponse.json({ lists });
}

export async function POST(req: NextRequest, route: RouteCtx) {
  const gate = await requireTenantContext((await route.params).tenantId);
  if (!gate.ok) return gate.response;
  const ctx = gate.ctx;
  if (!canWriteContacts(ctx)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = createListSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
      { status: 400 },
    );
  }
  const { name, contactIds } = parsed.data;

  const db = getDb();
  const [list] = await db
    .insert(contactLists)
    .values({ tenantId: ctx.tenantId, name })
    .returning();

  if (contactIds?.length && list) {
    const valid = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.tenantId, ctx.tenantId)));
    const allowed = new Set(valid.map((v) => v.id));
    const rows = contactIds
      .filter((id) => allowed.has(id))
      .map((contactId) => ({ listId: list.id, contactId }));
    if (rows.length) {
      await db.insert(contactListMembers).values(rows).onConflictDoNothing();
    }
  }

  return NextResponse.json({ list });
}
