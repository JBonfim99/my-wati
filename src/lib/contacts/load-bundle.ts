import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import {
  contactCustomFieldDefinitions,
  contactCustomValues,
  contactTags,
  contacts,
  tags,
} from "@/lib/db/schema";

export type ContactTagDto = { id: string; name: string; slug: string };

export type CustomFieldDefDto = {
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

export async function loadContactsBundle(
  db: AppDb,
  tenantId: number,
): Promise<{
  contacts: ContactRowDto[];
  customFieldDefinitions: CustomFieldDefDto[];
  allTags: ContactTagDto[];
}> {
  const defs = await db
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

  const allTagsRows = await db
    .select({
      id: tags.id,
      name: tags.name,
      slug: tags.slug,
    })
    .from(tags)
    .where(eq(tags.tenantId, tenantId))
    .orderBy(asc(tags.name));

  const contactRows = await db
    .select()
    .from(contacts)
    .where(eq(contacts.tenantId, tenantId))
    .orderBy(desc(contacts.updatedAt));

  const ids = contactRows.map((c) => c.id);
  if (ids.length === 0) {
    return {
      contacts: [],
      customFieldDefinitions: defs,
      allTags: allTagsRows,
    };
  }

  const tagAssign = await db
    .select({
      contactId: contactTags.contactId,
      tagId: tags.id,
      tagName: tags.name,
      tagSlug: tags.slug,
    })
    .from(contactTags)
    .innerJoin(tags, eq(tags.id, contactTags.tagId))
    .where(inArray(contactTags.contactId, ids));

  const tagByContact = new Map<string, ContactTagDto[]>();
  for (const row of tagAssign) {
    const list = tagByContact.get(row.contactId) ?? [];
    list.push({
      id: row.tagId,
      name: row.tagName,
      slug: row.tagSlug,
    });
    tagByContact.set(row.contactId, list);
  }

  const valueRows = await db
    .select({
      contactId: contactCustomValues.contactId,
      fieldId: contactCustomValues.fieldId,
      value: contactCustomValues.value,
    })
    .from(contactCustomValues)
    .where(inArray(contactCustomValues.contactId, ids));

  const valuesByContact = new Map<string, Record<string, unknown>>();
  for (const row of valueRows) {
    const m = valuesByContact.get(row.contactId) ?? {};
    m[row.fieldId] = row.value;
    valuesByContact.set(row.contactId, m);
  }

  const out: ContactRowDto[] = contactRows.map((c) => ({
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

  return {
    contacts: out,
    customFieldDefinitions: defs,
    allTags: allTagsRows,
  };
}

/** Garante que o contato pertence ao tenant. */
export async function getContactForTenant(
  db: AppDb,
  tenantId: number,
  contactId: string,
) {
  const [row] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, contactId)))
    .limit(1);
  return row ?? null;
}
