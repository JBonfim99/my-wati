import { z } from "zod";
import { CONTACT_BULK_MAX_IDS } from "@/lib/contacts/contact-list-request";

export const bulkContactIdsSchema = z
  .array(z.string().uuid())
  .min(1)
  .max(CONTACT_BULK_MAX_IDS);

/** Payload do POST /contacts/bulk (sem tenantId). */
export const bulkContactsPayloadSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("delete"), ids: bulkContactIdsSchema }),
  z.object({
    op: z.literal("add_tags"),
    ids: bulkContactIdsSchema,
    tagIds: z.array(z.string().uuid()).min(1).max(50),
  }),
  z.object({
    op: z.literal("remove_tags"),
    ids: bulkContactIdsSchema,
    tagIds: z.array(z.string().uuid()).min(1).max(50),
  }),
  z.object({
    op: z.literal("add_to_lists"),
    ids: bulkContactIdsSchema,
    listIds: z.array(z.string().uuid()).min(1).max(50),
  }),
  z.object({
    op: z.literal("remove_from_lists"),
    ids: bulkContactIdsSchema,
    listIds: z.array(z.string().uuid()).min(1).max(50),
  }),
  z.object({
    op: z.literal("set_custom_field"),
    ids: bulkContactIdsSchema,
    fieldId: z.string().uuid(),
    value: z.unknown(),
  }),
  z.object({
    op: z.literal("clear_custom_field"),
    ids: bulkContactIdsSchema,
    fieldId: z.string().uuid(),
  }),
]);

export type BulkContactsPayload = z.infer<typeof bulkContactsPayloadSchema>;

export const bulkContactsJobSchema = bulkContactsPayloadSchema.and(
  z.object({
    tenantId: z.number().int().positive(),
  }),
);

export type BulkContactsJob = z.infer<typeof bulkContactsJobSchema>;
