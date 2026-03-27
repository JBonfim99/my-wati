import type { Job } from "bullmq";
import { UnrecoverableError } from "bullmq";
import { and, eq, inArray } from "drizzle-orm";
import {
  bulkContactsJobSchema,
  type BulkContactsJob,
} from "@/lib/contacts/bulk-schema";
import { validateAndNormalizeCustomValue } from "@/lib/contacts/validate-custom-value";
import type { FieldType } from "@/lib/contacts/validate-custom-value";
import type { AppDb } from "@/lib/db";
import { getDb } from "@/lib/db";
import {
  type ContactCustomFieldConfig,
  contactCustomFieldDefinitions,
  contactCustomValues,
  contactListMembers,
  contactLists,
  contactTags,
  contacts,
  tags,
} from "@/lib/db/schema";

const CONTACT_ID_IN_CHUNK = 2000;
const TAG_LIST_IN_CHUNK = 200;
const INSERT_PAIR_CHUNK = 800;
const UPSERT_VALUE_CHUNK = 500;
const DELETE_CV_CHUNK = 2000;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Resolve contact IDs that exist for the tenant (ignores unknown / other-tenant IDs). */
export async function resolveValidContactIdsForTenant(
  db: AppDb,
  tenantId: number,
  ids: number[],
): Promise<number[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const parts = chunk(unique, CONTACT_ID_IN_CHUNK);
  const batches = await Promise.all(
    parts.map((p) =>
      db
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.tenantId, tenantId), inArray(contacts.id, p))),
    ),
  );
  return batches.flat().map((r) => r.id);
}

async function resolveValidTagIdsForTenant(
  db: AppDb,
  tenantId: number,
  tagIds: number[],
): Promise<number[]> {
  const unique = [...new Set(tagIds)];
  if (unique.length === 0) return [];
  const parts = chunk(unique, TAG_LIST_IN_CHUNK);
  const batches = await Promise.all(
    parts.map((p) =>
      db
        .select({ id: tags.id })
        .from(tags)
        .where(and(eq(tags.tenantId, tenantId), inArray(tags.id, p))),
    ),
  );
  return batches.flat().map((r) => r.id);
}

async function resolveValidListIdsForTenant(
  db: AppDb,
  tenantId: number,
  listIds: number[],
): Promise<number[]> {
  const unique = [...new Set(listIds)];
  if (unique.length === 0) return [];
  const parts = chunk(unique, TAG_LIST_IN_CHUNK);
  const batches = await Promise.all(
    parts.map((p) =>
      db
        .select({ id: contactLists.id })
        .from(contactLists)
        .where(
          and(eq(contactLists.tenantId, tenantId), inArray(contactLists.id, p)),
        ),
    ),
  );
  return batches.flat().map((r) => r.id);
}

type ProgressPayload = {
  stage: string;
  completed?: number;
  total?: number;
  validContacts?: number;
  requestedContacts?: number;
};

async function runSequentialChunks<T>(
  job: Job,
  parts: T[][],
  label: string,
  runOne: (part: T[]) => Promise<void>,
): Promise<void> {
  const total = parts.length;
  if (total === 0) {
    await job.updateProgress({
      stage: label,
      completed: 1,
      total: 1,
    } satisfies ProgressPayload);
    return;
  }
  await parts.reduce<Promise<void>>(
    (chain, part, idx) =>
      chain.then(async () => {
        await runOne(part);
        await job.updateProgress({
          stage: label,
          completed: idx + 1,
          total,
        } satisfies ProgressPayload);
      }),
    Promise.resolve(),
  );
}

export type BulkJobResult = {
  op: BulkContactsJob["op"];
  requestedContactIds: number;
  validContactIds: number;
};

export async function processBulkContactsJob(
  job: Job<BulkContactsJob>,
): Promise<BulkJobResult> {
  const parsed = bulkContactsJobSchema.safeParse(job.data);
  if (!parsed.success) {
    throw new UnrecoverableError(
      parsed.error.issues[0]?.message ?? "Payload do job inválido",
    );
  }
  const data = parsed.data;
  const db = getDb();
  const tenantId = data.tenantId;

  const requestedUnique = [...new Set(data.ids)];
  const validContactIds = await resolveValidContactIdsForTenant(
    db,
    tenantId,
    requestedUnique,
  );

  await job.updateProgress({
    stage: "resolved_contacts",
    validContacts: validContactIds.length,
    requestedContacts: requestedUnique.length,
  } satisfies ProgressPayload);

  if (validContactIds.length === 0) {
    await job.updateProgress({
      stage: "done",
      completed: 1,
      total: 1,
    } satisfies ProgressPayload);
    return {
      op: data.op,
      requestedContactIds: requestedUnique.length,
      validContactIds: 0,
    };
  }

  switch (data.op) {
    case "delete": {
      const parts = chunk(validContactIds, CONTACT_ID_IN_CHUNK);
      await runSequentialChunks(job, parts, "delete", async (part) => {
        const ids = part as number[];
        await db
          .delete(contacts)
          .where(
            and(eq(contacts.tenantId, tenantId), inArray(contacts.id, ids)),
          );
      });
      break;
    }
    case "add_tags": {
      const validTags = await resolveValidTagIdsForTenant(
        db,
        tenantId,
        data.tagIds,
      );
      if (validTags.length === 0) break;
      const rows: { contactId: number; tagId: number }[] = [];
      for (const cid of validContactIds) {
        for (const tid of validTags) {
          rows.push({ contactId: cid, tagId: tid });
        }
      }
      const parts = chunk(rows, INSERT_PAIR_CHUNK);
      await runSequentialChunks(job, parts, "add_tags", async (part) => {
        const batch = part as { contactId: number; tagId: number }[];
        await db.insert(contactTags).values(batch).onConflictDoNothing();
      });
      break;
    }
    case "remove_tags": {
      const validTags = await resolveValidTagIdsForTenant(
        db,
        tenantId,
        data.tagIds,
      );
      if (validTags.length === 0) break;
      await db
        .delete(contactTags)
        .where(
          and(
            inArray(contactTags.contactId, validContactIds),
            inArray(contactTags.tagId, validTags),
          ),
        );
      await job.updateProgress({
        stage: "remove_tags",
        completed: 1,
        total: 1,
      } satisfies ProgressPayload);
      break;
    }
    case "add_to_lists": {
      const validLists = await resolveValidListIdsForTenant(
        db,
        tenantId,
        data.listIds,
      );
      if (validLists.length === 0) break;
      const rows: { listId: number; contactId: number }[] = [];
      for (const cid of validContactIds) {
        for (const lid of validLists) {
          rows.push({ listId: lid, contactId: cid });
        }
      }
      const parts = chunk(rows, INSERT_PAIR_CHUNK);
      await runSequentialChunks(job, parts, "add_to_lists", async (part) => {
        const batch = part as { listId: number; contactId: number }[];
        await db.insert(contactListMembers).values(batch).onConflictDoNothing();
      });
      break;
    }
    case "remove_from_lists": {
      const validLists = await resolveValidListIdsForTenant(
        db,
        tenantId,
        data.listIds,
      );
      if (validLists.length === 0) break;
      await db
        .delete(contactListMembers)
        .where(
          and(
            inArray(contactListMembers.contactId, validContactIds),
            inArray(contactListMembers.listId, validLists),
          ),
        );
      await job.updateProgress({
        stage: "remove_from_lists",
        completed: 1,
        total: 1,
      } satisfies ProgressPayload);
      break;
    }
    case "set_custom_field": {
      const [def] = await db
        .select()
        .from(contactCustomFieldDefinitions)
        .where(
          and(
            eq(contactCustomFieldDefinitions.tenantId, tenantId),
            eq(contactCustomFieldDefinitions.id, data.fieldId),
          ),
        )
        .limit(1);
      if (!def) {
        throw new UnrecoverableError("Campo personalizado não encontrado.");
      }
      const v = validateAndNormalizeCustomValue(
        def.fieldType as FieldType,
        data.value,
        def.config as ContactCustomFieldConfig | null,
      );
      if (!v.ok) {
        throw new UnrecoverableError(v.error);
      }
      if (v.value === null || v.value === undefined) {
        throw new UnrecoverableError("Valor inválido para este tipo de campo.");
      }
      const now = new Date();
      const valueRows = validContactIds.map((contactId) => ({
        contactId,
        fieldId: data.fieldId,
        value: v.value,
        updatedAt: now,
      }));
      const parts = chunk(valueRows, UPSERT_VALUE_CHUNK);
      await runSequentialChunks(job, parts, "set_custom_field", async (part) => {
        const batch = part as (typeof valueRows)[number][];
        await db
          .insert(contactCustomValues)
          .values(batch)
          .onConflictDoUpdate({
            target: [
              contactCustomValues.contactId,
              contactCustomValues.fieldId,
            ],
            set: { value: v.value, updatedAt: now },
          });
      });
      break;
    }
    case "clear_custom_field": {
      const [def] = await db
        .select({ id: contactCustomFieldDefinitions.id })
        .from(contactCustomFieldDefinitions)
        .where(
          and(
            eq(contactCustomFieldDefinitions.tenantId, tenantId),
            eq(contactCustomFieldDefinitions.id, data.fieldId),
          ),
        )
        .limit(1);
      if (!def) {
        throw new UnrecoverableError("Campo personalizado não encontrado.");
      }
      const parts = chunk(validContactIds, DELETE_CV_CHUNK);
      await runSequentialChunks(job, parts, "clear_custom_field", async (part) => {
        const ids = part as number[];
        await db
          .delete(contactCustomValues)
          .where(
            and(
              inArray(contactCustomValues.contactId, ids),
              eq(contactCustomValues.fieldId, data.fieldId),
            ),
          );
      });
      break;
    }
  }

  await job.updateProgress({
    stage: "done",
    completed: 1,
    total: 1,
  } satisfies ProgressPayload);

  return {
    op: data.op,
    requestedContactIds: requestedUnique.length,
    validContactIds: validContactIds.length,
  };
}
