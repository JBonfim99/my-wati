import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import type { ContactCustomFieldConfig } from "@/lib/db/schema";
import { contactCustomFieldDefinitions } from "@/lib/db/schema";
import { requireTenantContext } from "@/lib/api-tenant-context";
import { canWriteContacts } from "@/lib/rbac";
import {
  validateAndNormalizeDefaultValue,
  type FieldType,
} from "@/lib/contacts/validate-custom-value";

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

  const body = (await req.json()) as {
    label?: string;
    config?: ContactCustomFieldConfig | null;
    sortOrder?: number;
    defaultValue?: unknown;
  };

  const cfg =
    body.config !== undefined ? body.config : def.config;

  let nextDefault = def.defaultValue;
  if (body.defaultValue !== undefined) {
    const dv = validateAndNormalizeDefaultValue(
      def.fieldType as FieldType,
      body.defaultValue,
      cfg,
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
      config: body.config !== undefined ? body.config : def.config,
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
