import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
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

const TYPES: CustomFieldType[] = ["text", "number", "boolean", "date"];

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

  const body = (await req.json()) as {
    label?: string;
    key?: string;
    fieldType?: string;
    config?: ContactCustomFieldConfig | null;
    sortOrder?: number;
    defaultValue?: unknown;
  };

  if (!body.label?.trim()) {
    return NextResponse.json({ error: "label obrigatório" }, { status: 400 });
  }
  const fieldType = body.fieldType as CustomFieldType;
  if (!fieldType || !TYPES.includes(fieldType)) {
    return NextResponse.json({ error: "fieldType inválido" }, { status: 400 });
  }

  const cfg = body.config ?? null;
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
