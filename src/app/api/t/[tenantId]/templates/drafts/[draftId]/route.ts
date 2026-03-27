import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/api-tenant-context";
import { getDb } from "@/lib/db";
import { canManageIntegration } from "@/lib/rbac";
import {
  deleteMessageTemplateDraft,
  updateMessageTemplateDraft,
} from "@/lib/templates/template-draft-queries";

type RouteCtx = {
  params: Promise<{ tenantId: string; draftId: string }>;
};

const patchBodySchema = z.object({
  payload: z.record(z.string(), z.unknown()),
});

export async function PATCH(req: NextRequest, route: RouteCtx) {
  const { tenantId: tp, draftId } = await route.params;
  const gate = await requireTenantContext(tp);
  if (!gate.ok) return gate.response;
  const ctx = gate.ctx;

  if (!canManageIntegration(ctx)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = patchBodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
      { status: 400 },
    );
  }

  const db = getDb();
  const row = await updateMessageTemplateDraft(
    db,
    ctx.tenantId,
    draftId,
    parsed.data.payload,
  );
  if (!row) {
    return NextResponse.json({ error: "Rascunho não encontrado" }, { status: 404 });
  }

  return NextResponse.json({
    item: {
      id: row.id,
      updatedAt: row.updatedAt.toISOString(),
    },
  });
}

export async function DELETE(_req: Request, route: RouteCtx) {
  const { tenantId: tp, draftId } = await route.params;
  const gate = await requireTenantContext(tp);
  if (!gate.ok) return gate.response;
  const ctx = gate.ctx;

  if (!canManageIntegration(ctx)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getDb();
  const ok = await deleteMessageTemplateDraft(db, ctx.tenantId, draftId);
  if (!ok) {
    return NextResponse.json({ error: "Rascunho não encontrado" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
