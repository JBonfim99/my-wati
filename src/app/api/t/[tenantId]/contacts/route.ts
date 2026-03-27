import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { normalizeE164 } from "@/lib/contacts/phone";
import { slugify } from "@/lib/contacts/slug";
import {
  CONTACTS_PAGE_MAX,
  CONTACTS_PAGE_SIZE,
  parseContactListFiltersFromSearchParams,
} from "@/lib/contacts/contact-list-request";
import {
  countContacts,
  listContacts,
  listContactFieldDefs,
  listAllTags,
  getContactWithDetails,
} from "@/lib/contacts/queries";
import { serializeContact, decodeCursor, encodeCursor } from "@/lib/contacts/dto";
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

const createContactSchema = z.object({
  phone: z.string().min(1),
  name: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  tagIds: z.array(z.string().uuid()).optional(),
  newTagNames: z.array(z.string()).optional(),
  customValues: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(req: Request, route: RouteCtx) {
  const gate = await requireTenantContext((await route.params).tenantId);
  if (!gate.ok) return gate.response;
  const ctx = gate.ctx;
  const db = getDb();

  const url = new URL((req as NextRequest).url);
  const rawCursor = url.searchParams.get("cursor");
  const cursor = rawCursor ? decodeCursor(rawCursor) : undefined;

  const limitRaw = Number.parseInt(
    url.searchParams.get("limit") ?? String(CONTACTS_PAGE_SIZE),
    10,
  );
  const limit = Math.min(
    CONTACTS_PAGE_MAX,
    Math.max(1, Number.isNaN(limitRaw) ? CONTACTS_PAGE_SIZE : limitRaw),
  );

  const includeTotal = url.searchParams.get("total") === "1" && !cursor;

  const [fieldDefs, allTags] = await Promise.all([
    listContactFieldDefs(db, ctx.tenantId),
    listAllTags(db, ctx.tenantId),
  ]);

  const parsedFilters = parseContactListFiltersFromSearchParams(
    url.searchParams,
    fieldDefs,
  );
  if (!parsedFilters.ok) return parsedFilters.response;
  const filters = parsedFilters.filters;

  const [listResult, totalCount] = await Promise.all([
    listContacts(db, ctx.tenantId, {
      limit,
      cursor: cursor ?? undefined,
      filters,
    }),
    includeTotal
      ? countContacts(db, ctx.tenantId, filters)
      : Promise.resolve(undefined as number | undefined),
  ]);

  const { contacts: contactList, nextCursor } = listResult;

  return NextResponse.json({
    contacts: contactList.map(serializeContact),
    nextCursor: nextCursor
      ? encodeCursor(nextCursor.updatedAt, nextCursor.id)
      : null,
    ...(includeTotal && totalCount !== undefined ? { total: totalCount } : {}),
    customFieldDefinitions: fieldDefs,
    allTags,
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

  const parsed = createContactSchema.safeParse(await req.json());
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Dados inválidos";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  const body = parsed.data;

  const phone = normalizeE164(body.phone);
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
          .values({ contactId: contact.id, fieldId, value, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: [contactCustomValues.contactId, contactCustomValues.fieldId],
            set: { value, updatedAt: new Date() },
          });
      }

      return contact;
    });

    // Return only the created contact — no full-bundle reload.
    const full = await getContactWithDetails(db, ctx.tenantId, result.id);
    return NextResponse.json({ contact: full ? serializeContact(full) : null });
  } catch {
    const [existing] = await db
      .select()
      .from(contacts)
      .where(
        and(eq(contacts.tenantId, ctx.tenantId), eq(contacts.phoneE164, phone)),
      )
      .limit(1);
    if (existing) {
      const full = await getContactWithDetails(db, ctx.tenantId, existing.id);
      return NextResponse.json({
        contact: full ? serializeContact(full) : null,
        existed: true,
      });
    }
    return NextResponse.json({ error: "Erro ao criar" }, { status: 500 });
  }
}
