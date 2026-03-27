import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { slugify } from "@/lib/contacts/slug";
import type { CustomFieldType } from "@/lib/contacts/system-fields";
import {
  validateAndNormalizeDefaultValue,
  type FieldType,
} from "@/lib/contacts/validate-custom-value";
import { getDb } from "@/lib/db";
import type { ContactCustomFieldConfig } from "@/lib/db/schema";
import { contactCustomFieldDefinitions } from "@/lib/db/schema";
import { requireTenantContext } from "@/lib/api-tenant-context";
import { canWriteContacts } from "@/lib/rbac";

type RouteCtx = { params: Promise<{ tenantId: string }> };

const FIELD_TYPES = ["text", "number", "boolean", "date"] as const;

const createFieldDefSchema = z.object({
  label: z.string().trim().min(1, "label obrigatório").max(100),
  key: z.string().trim().optional(),
  fieldType: z.enum(FIELD_TYPES, { error: "fieldType inválido" }),
  config: z
    .object({
      options: z
        .array(z.object({ value: z.string(), label: z.string() }))
        .optional(),
    })
    .nullable()
    .optional(),
  sortOrder: z.number().int().optional(),
  defaultValue: z.unknown().optional(),
});

export async function GET(_req: Request, route: RouteCtx) {
  const gate = await requireTenantContext((await route.params).tenantId);
  if (!gate.ok) return gate.response;
  const ctx = gate.ctx;
  const db = getDb();
  const rows = await db
    .select()
    .from(contactCustomFieldDefinitions)
    .where(eq(contactCustomFieldDefinitions.tenantId, ctx.tenantId))
    .orderBy(asc(contactCustomFieldDefinitions.sortOrder));
  return NextResponse.json({ definitions: rows });
}

export async function POST(req: NextRequest, route: RouteCtx) {
  const gate = await requireTenantContext((await route.params).tenantId);
  if (!gate.ok) return gate.response;
  const ctx = gate.ctx;
  if (!canWriteContacts(ctx)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = createFieldDefSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
      { status: 400 },
    );
  }
  const body = parsed.data;
  const fieldType = body.fieldType as CustomFieldType;
  const cfg = (body.config ?? null) as ContactCustomFieldConfig | null;

  const dv = validateAndNormalizeDefaultValue(
    fieldType as FieldType,
    body.defaultValue,
    cfg,
  );
  if (!dv.ok) {
    return NextResponse.json({ error: dv.error }, { status: 400 });
  }

  let key = body.key?.trim()
    ? slugify(body.key.trim())
    : slugify(body.label.trim());
  const db = getDb();

  let n = 0;
  let candidate = key;
  while (n < 50) {
    const [taken] = await db
      .select({ id: contactCustomFieldDefinitions.id })
      .from(contactCustomFieldDefinitions)
      .where(
        and(
          eq(contactCustomFieldDefinitions.tenantId, ctx.tenantId),
          eq(contactCustomFieldDefinitions.key, candidate),
        ),
      )
      .limit(1);
    if (!taken) break;
    n += 1;
    candidate = `${key}-${n}`;
  }
  key = candidate;

  const [row] = await db
    .insert(contactCustomFieldDefinitions)
    .values({
      tenantId: ctx.tenantId,
      key,
      label: body.label.trim(),
      fieldType,
      config: cfg,
      defaultValue: dv.value,
      sortOrder: body.sortOrder ?? 0,
    })
    .returning();

  return NextResponse.json({ definition: row }, { status: 201 });
}
