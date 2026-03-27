import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { CONTACT_BULK_MAX_IDS } from "@/lib/contacts/contact-list-request";
import { validateAndNormalizeCustomValue } from "@/lib/contacts/validate-custom-value";
import type { FieldType } from "@/lib/contacts/validate-custom-value";
import type { ContactCustomFieldConfig } from "@/lib/db/schema";
import type { AppDb } from "@/lib/db";
import { getDb } from "@/lib/db";
import {
  contactCustomFieldDefinitions,
  contactCustomValues,
  contactListMembers,
  contactLists,
  contactTags,
  contacts,
  tags,
} from "@/lib/db/schema";
import { requireTenantContext } from "@/lib/api-tenant-context";
import { canWriteContacts } from "@/lib/rbac";

type RouteCtx = { params: Promise<{ tenantId: string }> };

const idsSchema = z
  .array(z.string().uuid())
  .min(1)
  .max(CONTACT_BULK_MAX_IDS);

const bulkSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("delete"), ids: idsSchema }),
  z.object({
    op: z.literal("add_tags"),
    ids: idsSchema,
    tagIds: z.array(z.string().uuid()).min(1).max(50),
  }),
  z.object({
    op: z.literal("remove_tags"),
    ids: idsSchema,
    tagIds: z.array(z.string().uuid()).min(1).max(50),
  }),
  z.object({
    op: z.literal("add_to_lists"),
    ids: idsSchema,
    listIds: z.array(z.string().uuid()).min(1).max(50),
  }),
  z.object({
    op: z.literal("remove_from_lists"),
    ids: idsSchema,
    listIds: z.array(z.string().uuid()).min(1).max(50),
  }),
  z.object({
    op: z.literal("set_custom_field"),
    ids: idsSchema,
    fieldId: z.string().uuid(),
    value: z.unknown(),
  }),
  z.object({
    op: z.literal("clear_custom_field"),
    ids: idsSchema,
    fieldId: z.string().uuid(),
  }),
]);

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function uniqueOwnedContactIds(
  db: AppDb,
  tenantId: number,
  ids: string[],
): Promise<{ ok: true; unique: string[] } | { ok: false }> {
  const unique = [...new Set(ids)];
  const owned = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), inArray(contacts.id, unique)));
  if (owned.length !== unique.length) return { ok: false };
  return { ok: true, unique };
}

async function assertTagsOwned(
  db: AppDb,
  tenantId: number,
  tagIds: string[],
): Promise<boolean> {
  const unique = [...new Set(tagIds)];
  const rows = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.tenantId, tenantId), inArray(tags.id, unique)));
  return rows.length === unique.length;
}

async function assertListsOwned(
  db: AppDb,
  tenantId: number,
  listIds: string[],
): Promise<boolean> {
  const unique = [...new Set(listIds)];
  const rows = await db
    .select({ id: contactLists.id })
    .from(contactLists)
    .where(
      and(eq(contactLists.tenantId, tenantId), inArray(contactLists.id, unique)),
    );
  return rows.length === unique.length;
}

export async function POST(req: NextRequest, route: RouteCtx) {
  const gate = await requireTenantContext((await route.params).tenantId);
  if (!gate.ok) return gate.response;
  const ctx = gate.ctx;
  if (!canWriteContacts(ctx)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bulkSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
      { status: 400 },
    );
  }
  const body = parsed.data;
  const db = getDb();

  const owned = await uniqueOwnedContactIds(db, ctx.tenantId, body.ids);
  if (!owned.ok) {
    return NextResponse.json(
      { error: "Um ou mais contatos não existem nesta organização." },
      { status: 400 },
    );
  }
  const contactIds = owned.unique;

  if (body.op === "add_tags" || body.op === "remove_tags") {
    const okTags = await assertTagsOwned(db, ctx.tenantId, body.tagIds);
    if (!okTags) {
      return NextResponse.json(
        { error: "Uma ou mais tags não existem nesta organização." },
        { status: 400 },
      );
    }
  }

  if (body.op === "add_to_lists" || body.op === "remove_from_lists") {
    const okLists = await assertListsOwned(db, ctx.tenantId, body.listIds);
    if (!okLists) {
      return NextResponse.json(
        { error: "Uma ou mais listas não existem nesta organização." },
        { status: 400 },
      );
    }
  }

  let normalizedCustom:
    | { fieldId: string; value: unknown }
    | undefined;

  if (body.op === "set_custom_field") {
    const [def] = await db
      .select()
      .from(contactCustomFieldDefinitions)
      .where(
        and(
          eq(contactCustomFieldDefinitions.tenantId, ctx.tenantId),
          eq(contactCustomFieldDefinitions.id, body.fieldId),
        ),
      )
      .limit(1);
    if (!def) {
      return NextResponse.json(
        { error: "Campo personalizado não encontrado." },
        { status: 400 },
      );
    }
    const v = validateAndNormalizeCustomValue(
      def.fieldType as FieldType,
      body.value,
      def.config as ContactCustomFieldConfig | null,
    );
    if (!v.ok) {
      return NextResponse.json({ error: v.error }, { status: 400 });
    }
    if (v.value === null || v.value === undefined) {
      return NextResponse.json(
        { error: "Valor inválido para este tipo de campo." },
        { status: 400 },
      );
    }
    normalizedCustom = { fieldId: body.fieldId, value: v.value };
  }

  if (body.op === "clear_custom_field") {
    const [def] = await db
      .select({ id: contactCustomFieldDefinitions.id })
      .from(contactCustomFieldDefinitions)
      .where(
        and(
          eq(contactCustomFieldDefinitions.tenantId, ctx.tenantId),
          eq(contactCustomFieldDefinitions.id, body.fieldId),
        ),
      )
      .limit(1);
    if (!def) {
      return NextResponse.json(
        { error: "Campo personalizado não encontrado." },
        { status: 400 },
      );
    }
  }

  try {
    await db.transaction(async (tx) => {
      switch (body.op) {
        case "delete": {
          await tx
            .delete(contacts)
            .where(
              and(
                eq(contacts.tenantId, ctx.tenantId),
                inArray(contacts.id, contactIds),
              ),
            );
          break;
        }
        case "add_tags": {
          const tagSet = [...new Set(body.tagIds)];
          const rows: { contactId: string; tagId: string }[] = [];
          for (const cid of contactIds) {
            for (const tid of tagSet) rows.push({ contactId: cid, tagId: tid });
          }
          for (const part of chunk(rows, 800)) {
            if (part.length === 0) continue;
            await tx.insert(contactTags).values(part).onConflictDoNothing();
          }
          break;
        }
        case "remove_tags": {
          const tagSet = [...new Set(body.tagIds)];
          await tx
            .delete(contactTags)
            .where(
              and(
                inArray(contactTags.contactId, contactIds),
                inArray(contactTags.tagId, tagSet),
              ),
            );
          break;
        }
        case "add_to_lists": {
          const listSet = [...new Set(body.listIds)];
          const rows: { listId: string; contactId: string }[] = [];
          for (const cid of contactIds) {
            for (const lid of listSet) {
              rows.push({ listId: lid, contactId: cid });
            }
          }
          for (const part of chunk(rows, 800)) {
            if (part.length === 0) continue;
            await tx.insert(contactListMembers).values(part).onConflictDoNothing();
          }
          break;
        }
        case "remove_from_lists": {
          const listSet = [...new Set(body.listIds)];
          await tx
            .delete(contactListMembers)
            .where(
              and(
                inArray(contactListMembers.contactId, contactIds),
                inArray(contactListMembers.listId, listSet),
              ),
            );
          break;
        }
        case "set_custom_field": {
          if (!normalizedCustom) break;
          const now = new Date();
          const valueRows = contactIds.map((contactId) => ({
            contactId,
            fieldId: normalizedCustom.fieldId,
            value: normalizedCustom.value,
            updatedAt: now,
          }));
          for (const part of chunk(valueRows, 500)) {
            await tx
              .insert(contactCustomValues)
              .values(part)
              .onConflictDoUpdate({
                target: [
                  contactCustomValues.contactId,
                  contactCustomValues.fieldId,
                ],
                set: {
                  value: normalizedCustom.value,
                  updatedAt: now,
                },
              });
          }
          break;
        }
        case "clear_custom_field": {
          for (const part of chunk(contactIds, 2000)) {
            await tx
              .delete(contactCustomValues)
              .where(
                and(
                  inArray(contactCustomValues.contactId, part),
                  eq(contactCustomValues.fieldId, body.fieldId),
                ),
              );
          }
          break;
        }
      }
    });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível concluir a operação em massa. Tente novamente." },
      { status: 500 },
    );
  }

  switch (body.op) {
    case "delete":
      return NextResponse.json({ deleted: contactIds.length });
    default:
      return NextResponse.json({ affected: contactIds.length });
  }
}
