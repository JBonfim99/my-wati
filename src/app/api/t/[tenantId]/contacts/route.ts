import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { normalizeE164 } from "@/lib/contacts/phone";
import { slugify } from "@/lib/contacts/slug";
import { loadContactsBundle } from "@/lib/contacts/load-bundle";
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

type RouteCtx = { params: Promise<{ tenantId: string }> };

function serializeContact(c: {
  id: string;
  tenantId: number;
  phoneE164: string;
  name: string | null;
  email: string | null;
  createdAt: Date;
  updatedAt: Date;
  tags: { id: string; name: string; slug: string }[];
  customValues: Record<string, unknown>;
}) {
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

export async function GET(_req: Request, route: RouteCtx) {
  const gate = await requireTenantContext((await route.params).tenantId);
  if (!gate.ok) return gate.response;
  const ctx = gate.ctx;
  const db = getDb();
  const bundle = await loadContactsBundle(db, ctx.tenantId);
  return NextResponse.json({
    contacts: bundle.contacts.map(serializeContact),
    customFieldDefinitions: bundle.customFieldDefinitions,
    allTags: bundle.allTags,
    role: ctx.role,
  });
}

export async function POST(req: NextRequest, route: RouteCtx) {
  const gate = await requireTenantContext((await route.params).tenantId);
  if (!gate.ok) return gate.response;
  const ctx = gate.ctx;
  if (!canWriteContacts(ctx)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as {
    phone?: string;
    name?: string | null;
    email?: string | null;
    tagIds?: string[];
    newTagNames?: string[];
    customValues?: Record<string, unknown>;
  };

  const phone = body.phone ? normalizeE164(body.phone) : null;
  if (!phone) {
    return NextResponse.json({ error: "Telefone inválido" }, { status: 400 });
  }

  const db = getDb();
  const defs = await db
    .select()
    .from(contactCustomFieldDefinitions)
    .where(eq(contactCustomFieldDefinitions.tenantId, ctx.tenantId));

  const customEntries = Object.entries(body.customValues ?? {});
  const normalizedCustom: { fieldId: string; value: unknown }[] = [];
  for (const [fieldId, raw] of customEntries) {
    const def = defs.find((d) => d.id === fieldId);
    if (!def) {
      return NextResponse.json(
        { error: `Campo personalizado desconhecido: ${fieldId}` },
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
    if (
      v.value === null ||
      sameNormalizedCustomValue(
        def.fieldType as FieldType,
        v.value,
        def.defaultValue,
        def.config,
      )
    ) {
      continue;
    }
    normalizedCustom.push({ fieldId, value: v.value });
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(contacts)
        .values({
          tenantId: ctx.tenantId,
          phoneE164: phone,
          name: body.name?.trim() || null,
          email: body.email?.trim() || null,
        })
        .onConflictDoNothing()
        .returning();

      let contact = row;
      if (!contact) {
        const [existing] = await tx
          .select()
          .from(contacts)
          .where(
            and(
              eq(contacts.tenantId, ctx.tenantId),
              eq(contacts.phoneE164, phone),
            ),
          )
          .limit(1);
        if (!existing) throw new Error("insert_failed");
        contact = existing;
      }

      const tagIdSet = new Set(body.tagIds ?? []);
      for (const label of body.newTagNames ?? []) {
        const name = label.trim();
        if (!name) continue;
        const slug = slugify(name);
        const [tg] = await tx
          .insert(tags)
          .values({ tenantId: ctx.tenantId, name, slug })
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
          .where(and(eq(tags.id, tid), eq(tags.tenantId, ctx.tenantId)))
          .limit(1);
        if (!okTag) continue;
        await tx
          .insert(contactTags)
          .values({ contactId: contact.id, tagId: tid })
          .onConflictDoNothing();
      }

      for (const { fieldId, value } of normalizedCustom) {
        if (value === null || value === undefined) continue;
        await tx
          .insert(contactCustomValues)
          .values({
            contactId: contact.id,
            fieldId,
            value,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [contactCustomValues.contactId, contactCustomValues.fieldId],
            set: { value, updatedAt: new Date() },
          });
      }

      return contact;
    });

    const bundle = await loadContactsBundle(db, ctx.tenantId);
    const full = bundle.contacts.find((c) => c.id === result.id);
    return NextResponse.json({
      contact: full ? serializeContact(full) : null,
    });
  } catch {
    const [existing] = await db
      .select()
      .from(contacts)
      .where(
        and(eq(contacts.tenantId, ctx.tenantId), eq(contacts.phoneE164, phone)),
      )
      .limit(1);
    if (existing) {
      const bundle = await loadContactsBundle(db, ctx.tenantId);
      const full = bundle.contacts.find((c) => c.id === existing.id);
      return NextResponse.json({
        contact: full ? serializeContact(full) : null,
        existed: true,
      });
    }
    return NextResponse.json({ error: "Erro ao criar" }, { status: 500 });
  }
}
