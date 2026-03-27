import { and, asc, desc, eq, inArray, lt, or } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import {
  contactCustomFieldDefinitions,
  contactCustomValues,
  contactTags,
  contacts,
  tags,
} from "@/lib/db/schema";

// ─── DTOs ────────────────────────────────────────────────────────────────────

export type ContactTagDto = { id: string; name: string; slug: string };

export type ContactCustomFieldDefDto = {
  id: string;
  key: string;
  label: string;
  fieldType: string;
  config: unknown;
  defaultValue: unknown;
  sortOrder: number;
};

export type ContactRowDto = {
  id: string;
  tenantId: number;
  phoneE164: string;
  name: string | null;
  email: string | null;
  createdAt: Date;
  updatedAt: Date;
  tags: ContactTagDto[];
  customValues: Record<string, unknown>;
};

export type ContactCursor = { updatedAt: string; id: string };

// ─── Queries ─────────────────────────────────────────────────────────────────

/**
 * Paginated list of contacts ordered by updatedAt DESC, id DESC.
 * Uses cursor-based pagination for stable results.
 */
export async function listContacts(
  db: AppDb,
  tenantId: number,
  opts: { limit: number; cursor?: ContactCursor },
): Promise<{ contacts: ContactRowDto[]; nextCursor: ContactCursor | null }> {
  const { limit, cursor } = opts;

  const tenantFilter = eq(contacts.tenantId, tenantId);
  const cursorFilter = cursor
    ? or(
        lt(contacts.updatedAt, new Date(cursor.updatedAt)),
        and(
          eq(contacts.updatedAt, new Date(cursor.updatedAt)),
          lt(contacts.id, cursor.id),
        ),
      )
    : undefined;

  const rows = await db
    .select()
    .from(contacts)
    .where(cursorFilter ? and(tenantFilter, cursorFilter) : tenantFilter)
    .orderBy(desc(contacts.updatedAt), desc(contacts.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const contactRows = hasMore ? rows.slice(0, limit) : rows;

  if (contactRows.length === 0) {
    return { contacts: [], nextCursor: null };
  }

  const ids = contactRows.map((c) => c.id);
  const [tagAssign, valueRows] = await Promise.all([
    db
      .select({
        contactId: contactTags.contactId,
        tagId: tags.id,
        tagName: tags.name,
        tagSlug: tags.slug,
      })
      .from(contactTags)
      .innerJoin(tags, eq(tags.id, contactTags.tagId))
      .where(inArray(contactTags.contactId, ids)),
    db
      .select({
        contactId: contactCustomValues.contactId,
        fieldId: contactCustomValues.fieldId,
        value: contactCustomValues.value,
      })
      .from(contactCustomValues)
      .where(inArray(contactCustomValues.contactId, ids)),
  ]);

  const tagByContact = new Map<string, ContactTagDto[]>();
  for (const row of tagAssign) {
    const list = tagByContact.get(row.contactId) ?? [];
    list.push({ id: row.tagId, name: row.tagName, slug: row.tagSlug });
    tagByContact.set(row.contactId, list);
  }

  const valuesByContact = new Map<string, Record<string, unknown>>();
  for (const row of valueRows) {
    const m = valuesByContact.get(row.contactId) ?? {};
    m[row.fieldId] = row.value;
    valuesByContact.set(row.contactId, m);
  }

  const result: ContactRowDto[] = contactRows.map((c) => ({
    id: c.id,
    tenantId: c.tenantId,
    phoneE164: c.phoneE164,
    name: c.name,
    email: c.email,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    tags: tagByContact.get(c.id) ?? [],
    customValues: valuesByContact.get(c.id) ?? {},
  }));

  const last = contactRows[contactRows.length - 1];
  const nextCursor: ContactCursor | null =
    hasMore && last
      ? { updatedAt: last.updatedAt.toISOString(), id: last.id }
      : null;

  return { contacts: result, nextCursor };
}

/**
 * Fetches a single contact with its tags and custom values.
 * Use this after mutations — never load the full bundle to return one record.
 */
export async function getContactWithDetails(
  db: AppDb,
  tenantId: number,
  contactId: string,
): Promise<ContactRowDto | null> {
  const [row] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, contactId)))
    .limit(1);

  if (!row) return null;

  const [tagAssign, valueRows] = await Promise.all([
    db
      .select({ tagId: tags.id, tagName: tags.name, tagSlug: tags.slug })
      .from(contactTags)
      .innerJoin(tags, eq(tags.id, contactTags.tagId))
      .where(eq(contactTags.contactId, contactId)),
    db
      .select({
        fieldId: contactCustomValues.fieldId,
        value: contactCustomValues.value,
      })
      .from(contactCustomValues)
      .where(eq(contactCustomValues.contactId, contactId)),
  ]);

  return {
    id: row.id,
    tenantId: row.tenantId,
    phoneE164: row.phoneE164,
    name: row.name,
    email: row.email,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    tags: tagAssign.map((t) => ({ id: t.tagId, name: t.tagName, slug: t.tagSlug })),
    customValues: Object.fromEntries(valueRows.map((v) => [v.fieldId, v.value])),
  };
}

/** Fetch all custom field definitions for a tenant, ordered by sortOrder. */
export async function listContactFieldDefs(
  db: AppDb,
  tenantId: number,
): Promise<ContactCustomFieldDefDto[]> {
  return db
    .select({
      id: contactCustomFieldDefinitions.id,
      key: contactCustomFieldDefinitions.key,
      label: contactCustomFieldDefinitions.label,
      fieldType: contactCustomFieldDefinitions.fieldType,
      config: contactCustomFieldDefinitions.config,
      defaultValue: contactCustomFieldDefinitions.defaultValue,
      sortOrder: contactCustomFieldDefinitions.sortOrder,
    })
    .from(contactCustomFieldDefinitions)
    .where(eq(contactCustomFieldDefinitions.tenantId, tenantId))
    .orderBy(asc(contactCustomFieldDefinitions.sortOrder));
}

/** All tags for a tenant, ordered by name. */
export async function listAllTags(
  db: AppDb,
  tenantId: number,
): Promise<ContactTagDto[]> {
  return db
    .select({ id: tags.id, name: tags.name, slug: tags.slug })
    .from(tags)
    .where(eq(tags.tenantId, tenantId))
    .orderBy(asc(tags.name));
}
