import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { normalizeE164 } from "@/lib/contacts/phone";
import { slugify } from "@/lib/contacts/slug";
import {
  getContactWithDetails,
  listContactFieldDefs,
  listAllTags,
} from "@/lib/contacts/queries";
import { serializeContact } from "@/lib/contacts/dto";
import { sameNormalizedCustomValue } from "@/lib/contacts/same-normalized-custom-value";
import { validateAndNormalizeCustomValue } from "@/lib/contacts/validate-custom-value";
import type { FieldType } from "@/lib/contacts/validate-custom-value";
import type { ContactCustomFieldConfig } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import {
  contactCustomValues,
  contactTags,
  contacts,
  tags,
} from "@/lib/db/schema";
import { requireTenantContext } from "@/lib/api-tenant-context";
import {
  parsePublicEightDigitParam,
  zEightDigitIdArray,
} from "@/lib/ids/eight-digit";
import { canWriteContacts } from "@/lib/rbac";

type Ctx = { params: Promise<{ tenantId: string; id: string }> };

const patchContactSchema = z.object({
  phone: z.string().optional(),
  name: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  tagIds: zEightDigitIdArray.optional(),
  newTagNames: z.array(z.string()).optional(),
  customValues: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(_req: NextRequest, route: Ctx) {
  const { tenantId: tp, id: idParam } = await route.params;
  const contactId = parsePublicEightDigitParam(idParam);
  if (contactId === null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const gate = await requireTenantContext(tp);
  if (!gate.ok) return gate.response;
  const session = gate.ctx;
  const db = getDb();

  const [contact, fieldDefs, allTags] = await Promise.all([
    getContactWithDetails(db, session.tenantId, contactId),
    listContactFieldDefs(db, session.tenantId),
    listAllTags(db, session.tenantId),
  ]);

  if (!contact) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    contact: serializeContact(contact),
    customFieldDefinitions: fieldDefs,
    allTags,
  });
}

export async function PATCH(req: NextRequest, route: Ctx) {
  const { tenantId: tp, id: idParam } = await route.params;
  const contactId = parsePublicEightDigitParam(idParam);
  if (contactId === null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const gate = await requireTenantContext(tp);
  if (!gate.ok) return gate.response;
  const session = gate.ctx;
  if (!canWriteContacts(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = patchContactSchema.safeParse(await req.json());
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Dados inválidos";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  const body = parsed.data;

  const db = getDb();

  // Load existing contact + field defs before the transaction
  const [existing, allDefs] = await Promise.all([
    getContactWithDetails(db, session.tenantId, contactId),
    listContactFieldDefs(db, session.tenantId),
  ]);

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Validate and normalize custom values
  const normalizedCustom: { fieldId: string; value: unknown }[] = [];
  if (body.customValues) {
    for (const [fieldId, raw] of Object.entries(body.customValues)) {
      const def = allDefs.find((d) => d.id === fieldId);
      if (!def) {
        return NextResponse.json(
          { error: `Campo desconhecido: ${fieldId}` },
          { status: 400 },
        );
      }
      const v = validateAndNormalizeCustomValue(
        def.fieldType as FieldType,
        raw,
        def.config as ContactCustomFieldConfig | null,
      );
      if (!v.ok) {
        return NextResponse.json({ error: v.error }, { status: 400 });
      }
      normalizedCustom.push({ fieldId, value: v.value });
    }
  }

  // Phone uniqueness check
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
      if (dup && dup.id !== contactId) {
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
          body.name !== undefined ? body.name?.trim() || null : existing.name,
        email:
          body.email !== undefined
            ? body.email?.trim() || null
            : existing.email,
        updatedAt: new Date(),
      })
      .where(
        and(eq(contacts.tenantId, session.tenantId), eq(contacts.id, contactId)),
      );

    if (body.tagIds !== undefined || body.newTagNames !== undefined) {
      await tx.delete(contactTags).where(eq(contactTags.contactId, contactId));

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
            .values({ contactId: contactId, tagId: tid })
            .onConflictDoNothing();
        }
      }
    }

    for (const { fieldId, value } of normalizedCustom) {
      const def = allDefs.find((d) => d.id === fieldId);
      const redundant =
        value === null ||
        value === undefined ||
        (def &&
          sameNormalizedCustomValue(
            def.fieldType as FieldType,
            value,
            def.defaultValue,
            def.config as ContactCustomFieldConfig | null,
          ));
      if (redundant) {
        await tx.delete(contactCustomValues).where(
          and(
            eq(contactCustomValues.contactId, contactId),
            eq(contactCustomValues.fieldId, fieldId),
          ),
        );
      } else {
        await tx
          .insert(contactCustomValues)
          .values({
            contactId: contactId,
            fieldId,
            value,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [contactCustomValues.contactId, contactCustomValues.fieldId],
            set: { value, updatedAt: new Date() },
          });
      }
    }
  });

  // Return only the updated contact — no full-bundle reload.
  const updated = await getContactWithDetails(db, session.tenantId, contactId);
  return NextResponse.json({ contact: updated ? serializeContact(updated) : null });
}

export async function DELETE(_req: NextRequest, route: Ctx) {
  const { tenantId: tp, id: idParam } = await route.params;
  const contactId = parsePublicEightDigitParam(idParam);
  if (contactId === null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const gate = await requireTenantContext(tp);
  if (!gate.ok) return gate.response;
  const session = gate.ctx;
  if (!canWriteContacts(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const db = getDb();
  const existing = await getContactWithDetails(db, session.tenantId, contactId);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.delete(contacts).where(eq(contacts.id, contactId));
  return NextResponse.json({ ok: true });
}
