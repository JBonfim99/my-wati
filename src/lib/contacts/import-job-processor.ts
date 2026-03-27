import type { Job } from "bullmq";
import { UnrecoverableError } from "bullmq";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  contactsImportJobSchema,
  type ContactImportColumnMapping,
  type ContactsImportJob,
} from "@/lib/contacts/import-schema";
import { normalizeE164 } from "@/lib/contacts/phone";
import { sameNormalizedCustomValue } from "@/lib/contacts/same-normalized-custom-value";
import { validateAndNormalizeCustomValue } from "@/lib/contacts/validate-custom-value";
import type { FieldType } from "@/lib/contacts/validate-custom-value";
import { getDb } from "@/lib/db";
import {
  type ContactCustomFieldConfig,
  contactCustomFieldDefinitions,
  contactCustomValues,
  contactTags,
  contacts,
  tags,
} from "@/lib/db/schema";

const ROW_CHUNK = 120;
const TAG_PAIR_CHUNK = 800;
const CV_CHUNK = 400;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

type PreparedImportRow = {
  phoneE164: string;
  name: string | null;
  email: string | null;
  custom: { fieldId: string; value: unknown }[];
};

type ProgressPayload = {
  stage: string;
  completed?: number;
  total?: number;
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

function normalizeEmail(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const r = z.string().email().safeParse(t);
  return r.success ? t : null;
}

function prepareRow(
  headers: string[],
  row: string[],
  mapping: Record<string, ContactImportColumnMapping>,
  defsById: Map<
    string,
    {
      fieldType: FieldType;
      config: ContactCustomFieldConfig | null;
      defaultValue: unknown;
    }
  >,
): PreparedImportRow | null {
  let phoneRaw = "";
  let name: string | null = null;
  let email: string | null = null;
  const custom: { fieldId: string; value: unknown }[] = [];

  headers.forEach((h, idx) => {
    const m = mapping[h];
    if (!m || m.kind === "skip") return;
    const cell = (row[idx] ?? "").trim();
    if (m.kind === "system") {
      if (m.field === "phone") phoneRaw = cell;
      else if (m.field === "name") name = cell ? cell : null;
      else if (m.field === "email") email = normalizeEmail(cell);
    } else {
      const def = defsById.get(m.fieldId);
      if (!def || !cell) return;
      const v = validateAndNormalizeCustomValue(
        def.fieldType,
        cell,
        def.config,
      );
      if (!v.ok || v.value === null || v.value === undefined) return;
      if (
        sameNormalizedCustomValue(
          def.fieldType,
          v.value,
          def.defaultValue,
          def.config,
        )
      ) {
        return;
      }
      custom.push({ fieldId: m.fieldId, value: v.value });
    }
  });

  const phoneE164 = normalizeE164(phoneRaw);
  if (!phoneE164) return null;

  return { phoneE164, name, email, custom };
}

export type ContactsImportJobResult = {
  rowsTotal: number;
  rowsSkippedNoPhone: number;
  rowsWithValidPhone: number;
  tagCount: number;
};

export async function processContactsImportJob(
  job: Job<ContactsImportJob>,
): Promise<ContactsImportJobResult> {
  const parsed = contactsImportJobSchema.safeParse(job.data);
  if (!parsed.success) {
    throw new UnrecoverableError(
      parsed.error.issues[0]?.message ?? "Payload do job inválido",
    );
  }
  const data = parsed.data;
  const db = getDb();
  const tenantId = data.tenantId;

  const defs = await db
    .select()
    .from(contactCustomFieldDefinitions)
    .where(eq(contactCustomFieldDefinitions.tenantId, tenantId));

  const defsById = new Map(
    defs.map((d) => [
      d.id,
      {
        fieldType: d.fieldType as FieldType,
        config: d.config as ContactCustomFieldConfig | null,
        defaultValue: d.defaultValue,
      },
    ]),
  );

  for (const [, m] of Object.entries(data.mapping)) {
    if (m.kind === "custom" && !defsById.has(m.fieldId)) {
      throw new UnrecoverableError("Campo personalizado inválido no mapeamento.");
    }
  }

  const tagUnique = [...new Set(data.tagIds)];
  let validTagIds: string[] = [];
  if (tagUnique.length > 0) {
    const tagRows = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.tenantId, tenantId), inArray(tags.id, tagUnique)));
    validTagIds = tagRows.map((r) => r.id);
  }

  let rowsSkippedNoPhone = 0;
  const preparedAll: PreparedImportRow[] = [];

  for (const row of data.rows) {
    const p = prepareRow(data.headers, row, data.mapping, defsById);
    if (!p) {
      rowsSkippedNoPhone += 1;
      continue;
    }
    preparedAll.push(p);
  }

  const rowsWithValidPhone = preparedAll.length;
  const rowsTotal = data.rows.length;

  await job.updateProgress({
    stage: "parsed",
    completed: 1,
    total: 1,
  } satisfies ProgressPayload);

  if (preparedAll.length === 0) {
    await job.updateProgress({
      stage: "done",
      completed: 1,
      total: 1,
    } satisfies ProgressPayload);
    return {
      rowsTotal,
      rowsSkippedNoPhone,
      rowsWithValidPhone: 0,
      tagCount: validTagIds.length,
    };
  }

  const rowChunks = chunk(preparedAll, ROW_CHUNK);

  await runSequentialChunks(job, rowChunks, "import_chunks", async (chunkRows) => {
    const byPhone = new Map<string, PreparedImportRow>();
    for (const r of chunkRows) {
      byPhone.set(r.phoneE164, r);
    }
    const uniqueRows = [...byPhone.values()];
    const now = new Date();

    await db.transaction(async (tx) => {
      await tx
        .insert(contacts)
        .values(
          uniqueRows.map((r) => ({
            tenantId,
            phoneE164: r.phoneE164,
            name: r.name,
            email: r.email,
            updatedAt: now,
          })),
        )
        .onConflictDoNothing();

      const phones = uniqueRows.map((r) => r.phoneE164);
      const idRows = await tx
        .select({ id: contacts.id, phoneE164: contacts.phoneE164 })
        .from(contacts)
        .where(
          and(eq(contacts.tenantId, tenantId), inArray(contacts.phoneE164, phones)),
        );

      const phoneToId = new Map(idRows.map((x) => [x.phoneE164, x.id]));

      if (validTagIds.length > 0) {
        const tagPairs: { contactId: string; tagId: string }[] = [];
        for (const r of uniqueRows) {
          const cid = phoneToId.get(r.phoneE164);
          if (!cid) continue;
          for (const tid of validTagIds) {
            tagPairs.push({ contactId: cid, tagId: tid });
          }
        }
        for (const part of chunk(tagPairs, TAG_PAIR_CHUNK)) {
          if (part.length === 0) continue;
          await tx.insert(contactTags).values(part).onConflictDoNothing();
        }
      }

      const cvRows: {
        contactId: string;
        fieldId: string;
        value: unknown;
        updatedAt: Date;
      }[] = [];

      for (const r of uniqueRows) {
        const cid = phoneToId.get(r.phoneE164);
        if (!cid) continue;
        for (const c of r.custom) {
          cvRows.push({
            contactId: cid,
            fieldId: c.fieldId,
            value: c.value,
            updatedAt: now,
          });
        }
      }

      for (const part of chunk(cvRows, CV_CHUNK)) {
        if (part.length === 0) continue;
        await tx.insert(contactCustomValues).values(part).onConflictDoUpdate({
          target: [
            contactCustomValues.contactId,
            contactCustomValues.fieldId,
          ],
          set: {
            value: sql`excluded.value`,
            updatedAt: now,
          },
        });
      }
    });
  });

  await job.updateProgress({
    stage: "done",
    completed: 1,
    total: 1,
  } satisfies ProgressPayload);

  return {
    rowsTotal,
    rowsSkippedNoPhone,
    rowsWithValidPhone,
    tagCount: validTagIds.length,
  };
}
