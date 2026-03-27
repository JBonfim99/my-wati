import { z } from "zod";

/** Máximo de linhas de dados (excl. cabeçalho) por job de importação. */
export const CONTACT_IMPORT_MAX_ROWS = 5_000;

export const contactImportColumnMappingSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("skip") }),
  z.object({
    kind: z.literal("system"),
    field: z.enum(["name", "phone", "email"]),
  }),
  z.object({
    kind: z.literal("custom"),
    fieldId: z.string().uuid(),
  }),
]);

export type ContactImportColumnMapping = z.infer<
  typeof contactImportColumnMappingSchema
>;

export const contactsImportPayloadSchema = z
  .object({
    headers: z.array(z.string()).min(1),
    rows: z
      .array(z.array(z.string()))
      .min(1)
      .max(CONTACT_IMPORT_MAX_ROWS),
    mapping: z.record(z.string(), contactImportColumnMappingSchema),
    tagIds: z.array(z.string().uuid()).max(3).optional().default([]),
  })
  .superRefine((data, ctx) => {
    const w = data.headers.length;
    if (w === 0) return;
    for (let i = 0; i < data.rows.length; i++) {
      const r = data.rows[i];
      if (r.length !== w) {
        ctx.addIssue({
          code: "custom",
          message: `Linha ${i + 2}: número de colunas não bate com o cabeçalho`,
          path: ["rows", i],
        });
      }
    }
    const hasPhone = Object.values(data.mapping).some(
      (m) => m.kind === "system" && m.field === "phone",
    );
    if (!hasPhone) {
      ctx.addIssue({
        code: "custom",
        message: "É obrigatório mapear uma coluna para Telefone",
        path: ["mapping"],
      });
    }
    for (const h of data.headers) {
      if (data.mapping[h] === undefined) {
        ctx.addIssue({
          code: "custom",
          message: `Coluna "${h}" sem mapeamento`,
          path: ["mapping"],
        });
      }
    }
  });

export type ContactsImportPayload = z.infer<typeof contactsImportPayloadSchema>;

export const contactsImportJobSchema = contactsImportPayloadSchema.and(
  z.object({
    tenantId: z.number().int().positive(),
  }),
);

export type ContactsImportJob = z.infer<typeof contactsImportJobSchema>;
