import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listContactListsWithMemberCounts } from "@/lib/lists/queries";
import { getDb } from "@/lib/db";
import { contactLists } from "@/lib/db/schema";
import { requireTenantContext } from "@/lib/api-tenant-context";
import { canWriteContacts } from "@/lib/rbac";

type RouteCtx = { params: Promise<{ tenantId: string }> };

const createListSchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório").max(200),
});

export async function GET(_req: Request, route: RouteCtx) {
  const gate = await requireTenantContext((await route.params).tenantId);
  if (!gate.ok) return gate.response;
  const ctx = gate.ctx;
  const db = getDb();
  const rows = await listContactListsWithMemberCounts(db, ctx.tenantId);
  return NextResponse.json({
    lists: rows.map((l) => ({
      id: l.id,
      name: l.name,
      createdAt: l.createdAt.toISOString(),
      memberCount: l.memberCount,
    })),
  });
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
  const { name } = parsed.data;

  const db = getDb();
  const [list] = await db
    .insert(contactLists)
    .values({ tenantId: ctx.tenantId, name })
    .returning({
      id: contactLists.id,
      name: contactLists.name,
      createdAt: contactLists.createdAt,
    });

  if (!list) {
    return NextResponse.json({ error: "Erro ao criar" }, { status: 500 });
  }

  return NextResponse.json(
    {
      list: {
        id: list.id,
        name: list.name,
        createdAt: list.createdAt.toISOString(),
        memberCount: 0,
      },
    },
    { status: 201 },
  );
}
