import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/api-tenant-context";
import { getDb } from "@/lib/db";
import { canManageIntegration } from "@/lib/rbac";
import {
  insertMessageTemplateDraft,
  listMessageTemplateDrafts,
} from "@/lib/templates/template-draft-queries";

type RouteCtx = { params: Promise<{ tenantId: string }> };

const createBodySchema = z.object({
  payload: z.record(z.string(), z.unknown()),
});

export async function GET(_req: Request, route: RouteCtx) {
  const gate = await requireTenantContext((await route.params).tenantId);
  if (!gate.ok) return gate.response;
  const ctx = gate.ctx;

  if (!canManageIntegration(ctx)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getDb();
  const rows = await listMessageTemplateDrafts(db, ctx.tenantId);
  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      updatedAt: r.updatedAt.toISOString(),
      payload: r.payload,
    })),
  });
}

export async function POST(req: NextRequest, route: RouteCtx) {
  const gate = await requireTenantContext((await route.params).tenantId);
  if (!gate.ok) return gate.response;
  const ctx = gate.ctx;

  if (!canManageIntegration(ctx)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = createBodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
      { status: 400 },
    );
  }

  const db = getDb();
  const row = await insertMessageTemplateDraft(db, {
    tenantId: ctx.tenantId,
    payload: parsed.data.payload,
    createdBy: ctx.userId,
  });

  return NextResponse.json({
    item: {
      id: row.id,
      updatedAt: row.updatedAt.toISOString(),
    },
  });
}
