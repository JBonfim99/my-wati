import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  contactListMembers,
  contactLists,
  contacts,
} from "@/lib/db/schema";
import { requireTenantContext } from "@/lib/api-tenant-context";
import { canWriteContacts } from "@/lib/rbac";

type RouteCtx = { params: Promise<{ tenantId: string }> };

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
  const body = (await req.json()) as { name?: string; contactIds?: string[] };
  if (!body.name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  const db = getDb();
  const [list] = await db
    .insert(contactLists)
    .values({ tenantId: ctx.tenantId, name: body.name })
    .returning();

  if (body.contactIds?.length && list) {
    const valid = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(eq(contacts.tenantId, ctx.tenantId)),
      );
    const allowed = new Set(valid.map((v) => v.id));
    const rows = body.contactIds
      .filter((id) => allowed.has(id))
      .map((contactId) => ({ listId: list.id, contactId }));
    if (rows.length) {
      await db.insert(contactListMembers).values(rows).onConflictDoNothing();
    }
  }

  return NextResponse.json({ list });
}
