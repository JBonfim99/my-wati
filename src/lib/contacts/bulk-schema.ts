import { z } from "zod";
import { CONTACT_BULK_MAX_IDS } from "@/lib/contacts/contact-list-request";
import { zEightDigitIdArray } from "@/lib/ids/eight-digit";

export const bulkContactIdsSchema = zEightDigitIdArray
  .min(1)
  .max(CONTACT_BULK_MAX_IDS);

/** UUID do campo personalizado: aceita string ou valor JSON numérico (coerção → string) antes de validar. */
export const customFieldDefinitionIdSchema = z.coerce
  .string()
  .pipe(z.string().uuid());

const tenantIdInJobSchema = z.coerce.number().int().positive();

/** Payload do POST /contacts/bulk (sem tenantId). */
export const bulkContactsPayloadSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("delete"), ids: bulkContactIdsSchema }),
  z.object({
    op: z.literal("add_tags"),
    ids: bulkContactIdsSchema,
    tagIds: zEightDigitIdArray.min(1).max(50),
  }),
  z.object({
    op: z.literal("remove_tags"),
    ids: bulkContactIdsSchema,
    tagIds: zEightDigitIdArray.min(1).max(50),
  }),
  z.object({
    op: z.literal("add_to_lists"),
    ids: bulkContactIdsSchema,
    listIds: zEightDigitIdArray.min(1).max(50),
  }),
  z.object({
    op: z.literal("remove_from_lists"),
    ids: bulkContactIdsSchema,
    listIds: zEightDigitIdArray.min(1).max(50),
  }),
  z.object({
    op: z.literal("set_custom_field"),
    ids: bulkContactIdsSchema,
    fieldId: customFieldDefinitionIdSchema,
    value: z.unknown(),
  }),
  z.object({
    op: z.literal("clear_custom_field"),
    ids: bulkContactIdsSchema,
    fieldId: customFieldDefinitionIdSchema,
  }),
]);

export type BulkContactsPayload = z.infer<typeof bulkContactsPayloadSchema>;

/**
 * Dados do job BullMQ: mesmo discriminated union do payload + `tenantId` em cada ramo
 * (evita `schema.and()` + interseção no Zod 4) e coerção de `tenantId` vindo do Redis.
 */
export const bulkContactsJobSchema = z.discriminatedUnion("op", [
  z.object({
    tenantId: tenantIdInJobSchema,
    op: z.literal("delete"),
    ids: bulkContactIdsSchema,
  }),
  z.object({
    tenantId: tenantIdInJobSchema,
    op: z.literal("add_tags"),
    ids: bulkContactIdsSchema,
    tagIds: zEightDigitIdArray.min(1).max(50),
  }),
  z.object({
    tenantId: tenantIdInJobSchema,
    op: z.literal("remove_tags"),
    ids: bulkContactIdsSchema,
    tagIds: zEightDigitIdArray.min(1).max(50),
  }),
  z.object({
    tenantId: tenantIdInJobSchema,
    op: z.literal("add_to_lists"),
    ids: bulkContactIdsSchema,
    listIds: zEightDigitIdArray.min(1).max(50),
  }),
  z.object({
    tenantId: tenantIdInJobSchema,
    op: z.literal("remove_from_lists"),
    ids: bulkContactIdsSchema,
    listIds: zEightDigitIdArray.min(1).max(50),
  }),
  z.object({
    tenantId: tenantIdInJobSchema,
    op: z.literal("set_custom_field"),
    ids: bulkContactIdsSchema,
    fieldId: customFieldDefinitionIdSchema,
    value: z.unknown(),
  }),
  z.object({
    tenantId: tenantIdInJobSchema,
    op: z.literal("clear_custom_field"),
    ids: bulkContactIdsSchema,
    fieldId: customFieldDefinitionIdSchema,
  }),
]);

export type BulkContactsJob = z.infer<typeof bulkContactsJobSchema>;
