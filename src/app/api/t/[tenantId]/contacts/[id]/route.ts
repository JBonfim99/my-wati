import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { normalizeE164 } from "@/lib/contacts/phone";
import { slugify } from "@/lib/contacts/slug";
import { getContactForTenant, loadContactsBundle } from "@/lib/contacts/load-bundle";
import { sameNormalizedCustomValue } from "@/lib/contacts/same-normalized-custom-value";
import { validateAndNormalizeCustomValue } from "@/lib/contacts/validate-custom-value";
import type { FieldType } from "@/lib/contacts/validate-custom-value";
import { getDb } from "@/lib/db";
import {
  contactCustomFieldDefinitions,
  contactCustomValues,
  contactTags,
  contacts,
  tags,
} from "@/lib/db/schema";
import { requireTenantContext } from "@/lib/api-tenant-context";
import { canWriteContacts } from "@/lib/rbac";

type Ctx = { params: Promise<{ tenantId: string; id: string }> };

function serializeContact(c: Awaited<ReturnType<typeof loadContactsBundle>>["contacts"][0]) {
  return {
    id: c.id,
    tenantId: c.tenantId,
    phoneE164: c.phoneE164,
    name: c.name,
    email: c.email,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    tags: c.tags,
    customValues: c.customValues,
  };
}

export async function GET(_req: NextRequest, route: Ctx) {
  const { tenantId: tp, id } = await route.params;
  const gate = await requireTenantContext(tp);
  if (!gate.ok) return gate.response;
  const session = gate.ctx;
  const db = getDb();
  const bundle = await loadContactsBundle(db, session.tenantId);
  const c = bundle.contacts.find((x) => x.id === id);
  if (!c) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({
    contact: serializeContact(c),
    customFieldDefinitions: bundle.customFieldDefinitions,
    allTags: bundle.allTags,
  });
}

export async function PATCH(req: NextRequest, route: Ctx) {
  const { tenantId: tp, id } = await route.params;
  const gate = await requireTenantContext(tp);
  if (!gate.ok) return gate.response;
  const session = gate.ctx;
  if (!canWriteContacts(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const db = getDb();
  const existing = await getContactForTenant(db, session.tenantId, id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await req.json()) as {
    phone?: string;
    name?: string | null;
    email?: string | null;
    tagIds?: string[];
    newTagNames?: string[];
    customValues?: Record<string, unknown>;
  };

  const defs = await db
    .select()
    .from(contactCustomFieldDefinitions)
    .where(eq(contactCustomFieldDefinitions.tenantId, session.tenantId));

  const normalizedCustom: { fieldId: string; value: unknown }[] = [];
  if (body.customValues) {
    for (const [fieldId, raw] of Object.entries(body.customValues)) {
      const def = defs.find((d) => d.id === fieldId);
      if (!def) {
        return NextResponse.json(
          { error: `Campo desconhecido: ${fieldId}` },
          { status: 400 },
        );
      }
      const v = validateAndNormalizeCustomValue(
        def.fieldType as FieldType,
        raw,
        def.config,
      );
      if (!v.ok) {
        return NextResponse.json({ error: v.error }, { status: 400 });
      }
      normalizedCustom.push({ fieldId, value: v.value });
    }
  }

  let nextPhone = existing.phoneE164;
  if (body.phone !== undefined) {
    const p = normalizeE164(body.phone);
    if (!p) {
      return NextResponse.json({ error: "Telefone inválido" }, { status: 400 });
    }
    if (p !== existing.phoneE164) {
      const [dup] = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(
          and(
            eq(contacts.tenantId, session.tenantId),
            eq(contacts.phoneE164, p),
          ),
        )
        .limit(1);
      if (dup && dup.id !== id) {
        return NextResponse.json(
          { error: "Já existe um contato com este telefone." },
          { status: 409 },
        );
      }
    }
    nextPhone = p;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(contacts)
      .set({
        phoneE164: nextPhone,
        name:
          body.name !== undefined
            ? body.name?.trim() || null
            : existing.name,
        email:
          body.email !== undefined
            ? body.email?.trim() || null
            : existing.email,
        updatedAt: new Date(),
      })
      .where(and(eq(contacts.tenantId, session.tenantId), eq(contacts.id, id)));

    if (body.tagIds !== undefined || body.newTagNames !== undefined) {
      await tx.delete(contactTags).where(eq(contactTags.contactId, id));

      const tagIdSet = new Set(body.tagIds ?? []);
      for (const label of body.newTagNames ?? []) {
        const name = label.trim();
        if (!name) continue;
        const slug = slugify(name);
        const [tg] = await tx
          .insert(tags)
          .values({ tenantId: session.tenantId, name, slug })
          .onConflictDoUpdate({
            target: [tags.tenantId, tags.slug],
            set: { name },
          })
          .returning({ id: tags.id });
        if (tg) tagIdSet.add(tg.id);
      }

      for (const tid of tagIdSet) {
        const [okTag] = await tx
          .select({ id: tags.id })
          .from(tags)
          .where(and(eq(tags.id, tid), eq(tags.tenantId, session.tenantId)))
          .limit(1);
        if (okTag) {
          await tx
            .insert(contactTags)
            .values({ contactId: id, tagId: tid })
            .onConflictDoNothing();
        }
      }
    }

    for (const { fieldId, value } of normalizedCustom) {
      const def = defs.find((d) => d.id === fieldId);
      const redundant =
        value === null ||
        value === undefined ||
        (def &&
          sameNormalizedCustomValue(
            def.fieldType as FieldType,
            value,
            def.defaultValue,
            def.config,
          ));
      if (redundant) {
        await tx
          .delete(contactCustomValues)
          .where(
            and(
              eq(contactCustomValues.contactId, id),
              eq(contactCustomValues.fieldId, fieldId),
            ),
          );
      } else {
        await tx
          .insert(contactCustomValues)
          .values({
            contactId: id,
            fieldId,
            value,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [
              contactCustomValues.contactId,
              contactCustomValues.fieldId,
            ],
            set: { value, updatedAt: new Date() },
          });
      }
    }
  });

  const bundle = await loadContactsBundle(db, session.tenantId);
  const c = bundle.contacts.find((x) => x.id === id);
  return NextResponse.json({ contact: c ? serializeContact(c) : null });
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
  const existing = await getContactForTenant(db, session.tenantId, id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.delete(contacts).where(eq(contacts.id, id));
  return NextResponse.json({ ok: true });
}
