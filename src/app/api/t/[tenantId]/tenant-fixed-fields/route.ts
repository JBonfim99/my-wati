import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireTenantContext } from "@/lib/api-tenant-context";
import { canWriteContacts } from "@/lib/rbac";
import {
  allocateTenantFixedFieldKey,
  createTenantFixedField,
  listTenantFixedFields,
  normalizeTenantFixedFieldKey,
  TENANT_FIXED_LABEL_MAX,
  TENANT_FIXED_VALUE_MAX,
  validateNewTenantFixedFieldKey,
} from "@/lib/tenant-fixed-fields/queries";

type RouteCtx = { params: Promise<{ tenantId: string }> };

const createSchema = z.object({
  key: z.string().trim().max(64).optional(),
  label: z.string().trim().min(1).max(TENANT_FIXED_LABEL_MAX),
  value: z.string().max(TENANT_FIXED_VALUE_MAX).optional().default(""),
});

export async function GET(_req: Request, route: RouteCtx) {
  const gate = await requireTenantContext((await route.params).tenantId);
  if (!gate.ok) return gate.response;

  const db = getDb();
  const items = await listTenantFixedFields(db, gate.ctx.tenantId);
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest, route: RouteCtx) {
  const gate = await requireTenantContext((await route.params).tenantId);
  if (!gate.ok) return gate.response;
  if (!canWriteContacts(gate.ctx)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
      { status: 400 },
    );
  }

  const db = getDb();
  const { label, value } = parsed.data;

  let finalKey: string;
  if (parsed.data.key?.trim()) {
    finalKey = normalizeTenantFixedFieldKey(parsed.data.key);
    const err = await validateNewTenantFixedFieldKey(
      db,
      gate.ctx.tenantId,
      finalKey,
    );
    if (err) {
      return NextResponse.json({ error: err }, { status: 400 });
    }
  } else {
    const alloc = await allocateTenantFixedFieldKey(
      db,
      gate.ctx.tenantId,
      label,
    );
    if (!alloc.ok) {
      return NextResponse.json({ error: alloc.error }, { status: 400 });
    }
    finalKey = alloc.key;
  }

  const created = await createTenantFixedField(db, gate.ctx.tenantId, {
    key: finalKey,
    label,
    value,
  });
  if (!created.ok) {
    return NextResponse.json({ error: created.error }, { status: 400 });
  }

  return NextResponse.json({ item: created.item }, { status: 201 });
}
