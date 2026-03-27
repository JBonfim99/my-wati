import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import type { ContactCustomFieldConfig } from "@/lib/db/schema";
import { contactCustomFieldDefinitions } from "@/lib/db/schema";
import { requireTenantContext } from "@/lib/api-tenant-context";
import { canWriteContacts } from "@/lib/rbac";
import {
  validateAndNormalizeDefaultValue,
  type FieldType,
} from "@/lib/contacts/validate-custom-value";

const patchFieldDefSchema = z.object({
  label: z.string().trim().min(1, "rótulo obrigatório").max(100).optional(),
  description: z.union([z.string().max(2000), z.null()]).optional(),
  config: z
    .object({
      options: z
        .array(z.object({ value: z.string(), label: z.string() }))
        .optional(),
      description: z.string().optional(),
    })
    .nullable()
    .optional(),
  sortOrder: z.number().int().optional(),
  defaultValue: z.unknown().optional(),
});

type Ctx = { params: Promise<{ tenantId: string; id: string }> };

export async function PATCH(req: NextRequest, route: Ctx) {
  const { tenantId: tp, id } = await route.params;
  const gate = await requireTenantContext(tp);
  if (!gate.ok) return gate.response;
  const session = gate.ctx;
  if (!canWriteContacts(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const db = getDb();
  const [def] = await db
    .select()
    .from(contactCustomFieldDefinitions)
    .where(
      and(
        eq(contactCustomFieldDefinitions.tenantId, session.tenantId),
        eq(contactCustomFieldDefinitions.id, id),
      ),
    )
    .limit(1);
  if (!def) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = patchFieldDefSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
      { status: 400 },
    );
  }
  const body = parsed.data;

  let nextConfig: ContactCustomFieldConfig | null =
    body.config !== undefined
      ? body.config === null
        ? null
        : { ...body.config }
      : def.config === null
        ? null
        : { ...(def.config ?? {}) };

  if (nextConfig !== null && Object.keys(nextConfig).length === 0) {
    nextConfig = null;
  }

  if (body.description !== undefined) {
    const merged: ContactCustomFieldConfig = { ...(nextConfig ?? {}) };
    if (body.description === null || body.description.trim() === "") {
      delete merged.description;
    } else {
      merged.description = body.description.trim();
    }
    nextConfig = Object.keys(merged).length > 0 ? merged : null;
  }

  const cfgForValidation: ContactCustomFieldConfig | null = nextConfig;

  let nextDefault = def.defaultValue;
  if (body.defaultValue !== undefined) {
    const dv = validateAndNormalizeDefaultValue(
      def.fieldType as FieldType,
      body.defaultValue,
      cfgForValidation,
    );
    if (!dv.ok) {
      return NextResponse.json({ error: dv.error }, { status: 400 });
    }
    nextDefault = dv.value;
  }

  await db
    .update(contactCustomFieldDefinitions)
    .set({
      label: body.label?.trim() ?? def.label,
      config: nextConfig,
      sortOrder:
        body.sortOrder !== undefined ? body.sortOrder : def.sortOrder,
      defaultValue:
        body.defaultValue !== undefined ? nextDefault : def.defaultValue,
    })
    .where(
      and(
        eq(contactCustomFieldDefinitions.tenantId, session.tenantId),
        eq(contactCustomFieldDefinitions.id, id),
      ),
    );

  const [next] = await db
    .select()
    .from(contactCustomFieldDefinitions)
    .where(
      and(
        eq(contactCustomFieldDefinitions.tenantId, session.tenantId),
        eq(contactCustomFieldDefinitions.id, id),
      ),
    )
    .limit(1);

  return NextResponse.json({ definition: next });
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
  const [def] = await db
    .select()
    .from(contactCustomFieldDefinitions)
    .where(
      and(
        eq(contactCustomFieldDefinitions.tenantId, session.tenantId),
        eq(contactCustomFieldDefinitions.id, id),
      ),
    )
    .limit(1);
  if (!def) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db
    .delete(contactCustomFieldDefinitions)
    .where(
      and(
        eq(contactCustomFieldDefinitions.tenantId, session.tenantId),
        eq(contactCustomFieldDefinitions.id, id),
      ),
    );

  return NextResponse.json({ ok: true });
}
