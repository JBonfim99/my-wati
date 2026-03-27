import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveCustomClausesFromApi } from "@/lib/contacts/list-filters";
import type { ContactListFilters } from "@/lib/contacts/list-filters";
import type { ContactCustomFieldDefDto } from "@/lib/contacts/queries";

export const CONTACTS_PAGE_SIZE = 25;
export const CONTACTS_PAGE_MAX = 25;
export const CONTACT_IDS_CAP = 10_000;
export const CONTACT_BULK_MAX_IDS = 10_000;

const TAG_FILTER_MAX = 24;
const FIELD_CLAUSES_MAX = 12;

const systemFieldClauseSchema = z
  .object({
    field: z.enum(["phone", "name", "email"]),
    op: z.enum([
      "eq",
      "ne",
      "contains",
      "not_contains",
      "empty",
      "not_empty",
    ]),
    value: z.string().max(200).optional(),
  })
  .superRefine((c, ctx) => {
    const needs = ["eq", "ne", "contains", "not_contains"].includes(c.op);
    if (needs && !c.value?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "Valor obrigatório para este operador",
        path: ["value"],
      });
    }
  });

const systemFieldClausesQuerySchema = z
  .array(systemFieldClauseSchema)
  .max(FIELD_CLAUSES_MAX);

const tagClauseSchema = z.object({
  tagId: z.string().uuid(),
  op: z.enum(["is", "is_not"]),
});

const tagClausesQuerySchema = z
  .array(tagClauseSchema)
  .min(1)
  .max(TAG_FILTER_MAX);

const customFilterClauseSchema = z.object({
  fieldId: z.string().uuid(),
  op: z.string().max(32),
  value: z.string().max(200).optional(),
});

const customFiltersQuerySchema = z
  .array(customFilterClauseSchema)
  .max(FIELD_CLAUSES_MAX);

/**
 * Parse contact list filter query params (shared by GET /contacts e GET /contacts/ids).
 * `fieldDefs` deve ser o mesmo retorno de `listContactFieldDefs` (para resolver `cfc`).
 */
export function parseContactListFiltersFromSearchParams(
  searchParams: URLSearchParams,
  fieldDefs: ContactCustomFieldDefDto[],
): { ok: true; filters: ContactListFilters | undefined } | { ok: false; response: NextResponse } {
  const q = searchParams.get("q")?.trim() || undefined;
  const conditionMatch: NonNullable<ContactListFilters["conditionMatch"]> =
    searchParams.get("cm") === "any" ? "any" : "all";

  let systemFieldClauses: ContactListFilters["systemFieldClauses"];
  const sfcRaw = searchParams.get("sfc");
  if (sfcRaw) {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(decodeURIComponent(sfcRaw)) as unknown;
    } catch {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Parâmetro sfc inválido (JSON)" },
          { status: 400 },
        ),
      };
    }
    const sfcParsed = systemFieldClausesQuerySchema.safeParse(parsedJson);
    if (!sfcParsed.success) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error:
              sfcParsed.error.issues[0]?.message ??
              "Cláusulas de campo do sistema inválidas",
          },
          { status: 400 },
        ),
      };
    }
    systemFieldClauses =
      sfcParsed.data.length > 0 ? sfcParsed.data : undefined;
  }

  let tagClauses: ContactListFilters["tagClauses"];
  const tfRaw = searchParams.get("tf");
  if (tfRaw) {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(decodeURIComponent(tfRaw)) as unknown;
    } catch {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Parâmetro tf inválido (JSON)" },
          { status: 400 },
        ),
      };
    }
    const tfParsed = tagClausesQuerySchema.safeParse(parsedJson);
    if (!tfParsed.success) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error:
              tfParsed.error.issues[0]?.message ?? "Cláusulas de tag inválidas",
          },
          { status: 400 },
        ),
      };
    }
    tagClauses = tfParsed.data;
  }

  let customFieldClauses: ContactListFilters["customFieldClauses"];
  const cfcRaw = searchParams.get("cfc");
  if (cfcRaw) {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(decodeURIComponent(cfcRaw)) as unknown;
    } catch {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Parâmetro cfc inválido (JSON)" },
          { status: 400 },
        ),
      };
    }
    const cfcParsed = customFiltersQuerySchema.safeParse(parsedJson);
    if (!cfcParsed.success) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error:
              cfcParsed.error.issues[0]?.message ??
              "Filtro de campo personalizado inválido",
          },
          { status: 400 },
        ),
      };
    }
    const resolved = resolveCustomClausesFromApi(cfcParsed.data, fieldDefs);
    if (!resolved.ok) {
      return {
        ok: false,
        response: NextResponse.json({ error: resolved.error }, { status: 400 }),
      };
    }
    customFieldClauses =
      resolved.clauses.length > 0 ? resolved.clauses : undefined;
  }

  const hasFilters =
    Boolean(q) ||
    Boolean(systemFieldClauses && systemFieldClauses.length > 0) ||
    Boolean(tagClauses && tagClauses.length > 0) ||
    Boolean(customFieldClauses && customFieldClauses.length > 0);

  const filters: ContactListFilters | undefined = hasFilters
    ? {
        ...(q ? { q } : {}),
        conditionMatch,
        ...(systemFieldClauses && systemFieldClauses.length > 0
          ? { systemFieldClauses }
          : {}),
        ...(tagClauses && tagClauses.length > 0 ? { tagClauses } : {}),
        ...(customFieldClauses && customFieldClauses.length > 0
          ? { customFieldClauses }
          : {}),
      }
    : undefined;

  return { ok: true, filters };
}
