import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireTenantContext } from "@/lib/api-tenant-context";
import { canWriteContacts } from "@/lib/rbac";
import {
  deleteTenantFixedField,
  TENANT_FIXED_LABEL_MAX,
  TENANT_FIXED_VALUE_MAX,
  updateTenantFixedField,
} from "@/lib/tenant-fixed-fields/queries";

type RouteCtx = {
  params: Promise<{ tenantId: string; fieldId: string }>;
};

const patchSchema = z
  .object({
    label: z.string().trim().min(1).max(TENANT_FIXED_LABEL_MAX).optional(),
    value: z.string().max(TENANT_FIXED_VALUE_MAX).optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .refine(
    (d) =>
      d.label !== undefined ||
      d.value !== undefined ||
      d.sortOrder !== undefined,
    { message: "Informe ao menos um campo para atualizar." },
  );

export async function PATCH(req: NextRequest, route: RouteCtx) {
  const gate = await requireTenantContext((await route.params).tenantId);
  if (!gate.ok) return gate.response;
  if (!canWriteContacts(gate.ctx)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { fieldId } = await route.params;
  if (!z.string().uuid().safeParse(fieldId).success) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
      { status: 400 },
    );
  }

  const db = getDb();
  const updated = await updateTenantFixedField(
    db,
    gate.ctx.tenantId,
    fieldId,
    parsed.data,
  );
  if (!updated.ok) {
    return NextResponse.json({ error: updated.error }, { status: 404 });
  }

  return NextResponse.json({ item: updated.item });
}

export async function DELETE(_req: Request, route: RouteCtx) {
  const gate = await requireTenantContext((await route.params).tenantId);
  if (!gate.ok) return gate.response;
  if (!canWriteContacts(gate.ctx)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { fieldId } = await route.params;
  if (!z.string().uuid().safeParse(fieldId).success) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const db = getDb();
  const ok = await deleteTenantFixedField(db, gate.ctx.tenantId, fieldId);
  if (!ok) {
    return NextResponse.json({ error: "Campo não encontrado" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
