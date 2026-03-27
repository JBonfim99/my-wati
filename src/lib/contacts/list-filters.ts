import { and, eq, exists, ilike, not, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import {
  contactCustomFieldDefinitions,
  contactCustomValues,
  contactTags,
  contacts,
} from "@/lib/db/schema";
import {
  customOpNeedsValue,
  isCustomOpAllowed,
} from "@/lib/contacts/filter-operators";
import { normalizeE164 } from "@/lib/contacts/phone";
import type { FieldType } from "@/lib/contacts/validate-custom-value";

export type ContactTagFilterClause = { tagId: string; op: "is" | "is_not" };

export type ContactSystemFieldOp =
  | "eq"
  | "ne"
  | "contains"
  | "not_contains"
  | "empty"
  | "not_empty";

export type ContactSystemFieldClause = {
  field: "phone" | "name" | "email";
  op: ContactSystemFieldOp;
  value?: string;
};

export type ContactCustomFilterClause = {
  fieldId: string;
  fieldType: FieldType;
  op: string;
  value?: string;
};

export type ContactListFilters = {
  q?: string;
  /** E = todas as partes do filtro; OU = pelo menos uma (busca, cláusulas de painel). */
  conditionMatch?: "all" | "any";
  systemFieldClauses?: ContactSystemFieldClause[];
  tagClauses?: ContactTagFilterClause[];
  customFieldClauses?: ContactCustomFilterClause[];
};

function systemColumn(field: "phone" | "name" | "email") {
  if (field === "phone") return contacts.phoneE164;
  if (field === "name") return contacts.name;
  return contacts.email;
}

function colTrimEmpty(
  col:
    | typeof contacts.phoneE164
    | typeof contacts.name
    | typeof contacts.email,
): SQL {
  return sql`(coalesce(trim(${col}::text), '') = '')`;
}

function colTrimNotEmpty(
  col:
    | typeof contacts.phoneE164
    | typeof contacts.name
    | typeof contacts.email,
): SQL {
  return sql`(coalesce(trim(${col}::text), '') <> '')`;
}

function systemFieldClauseToSql(clause: ContactSystemFieldClause): SQL | null {
  const col = systemColumn(clause.field);
  const vRaw = clause.value?.trim() ?? "";

  switch (clause.op) {
    case "empty":
      return colTrimEmpty(col);
    case "not_empty":
      return colTrimNotEmpty(col);
    case "eq": {
      if (!vRaw) return null;
      if (clause.field === "phone") {
        const n = normalizeE164(vRaw);
        if (!n) return null;
        return eq(contacts.phoneE164, n);
      }
      if (clause.field === "name") {
        return sql`lower(trim(coalesce(${contacts.name}, ''))) = lower(${vRaw})`;
      }
      return sql`lower(trim(coalesce(${contacts.email}, ''))) = lower(${vRaw})`;
    }
    case "ne": {
      if (!vRaw) return null;
      if (clause.field === "phone") {
        const n = normalizeE164(vRaw);
        if (!n) return null;
        return not(eq(contacts.phoneE164, n));
      }
      if (clause.field === "name") {
        return sql`lower(trim(coalesce(${contacts.name}, ''))) <> lower(${vRaw})`;
      }
      return sql`lower(trim(coalesce(${contacts.email}, ''))) <> lower(${vRaw})`;
    }
    case "contains": {
      if (!vRaw) return null;
      const needle = vRaw.toLowerCase();
      return sql`strpos(lower(${col}::text), ${needle}) > 0`;
    }
    case "not_contains": {
      if (!vRaw) return null;
      const needle = vRaw.toLowerCase();
      return sql`strpos(lower(${col}::text), ${needle}) = 0`;
    }
    default:
      return null;
  }
}

/** Valor JSON “preenchido” na linha de ccv. */
function ccvHasMeaningfulValue(): SQL {
  return sql`(${contactCustomValues.value} IS NOT NULL AND ${contactCustomValues.value} <> 'null'::jsonb)`;
}

function existsCcv(
  db: AppDb,
  tenantId: number,
  fieldId: string,
  extra: SQL | undefined,
): SQL {
  return exists(
    db
      .select({ one: sql`1` })
      .from(contactCustomValues)
      .innerJoin(
        contactCustomFieldDefinitions,
        eq(
          contactCustomFieldDefinitions.id,
          contactCustomValues.fieldId,
        ),
      )
      .where(
        and(
          eq(contactCustomValues.contactId, contacts.id),
          eq(contactCustomFieldDefinitions.tenantId, tenantId),
          eq(contactCustomValues.fieldId, fieldId),
          ...(extra ? [extra] : []),
        ),
      ),
  );
}

function customClauseToSql(
  db: AppDb,
  tenantId: number,
  clause: ContactCustomFilterClause,
): SQL | null {
  const { fieldId, fieldType, op, value } = clause;
  const v = value?.trim() ?? "";

  const val = contactCustomValues.value;

  switch (fieldType) {
    case "text":
    case "select": {
      if (op === "empty") {
        return not(
          existsCcv(db, tenantId, fieldId, ccvHasMeaningfulValue()),
        );
      }
      if (op === "not_empty") {
        return existsCcv(db, tenantId, fieldId, ccvHasMeaningfulValue());
      }
      if (!v) return null;
      if (op === "eq") {
        return existsCcv(
          db,
          tenantId,
          fieldId,
          and(
            sql`jsonb_typeof(${val}) = 'string'`,
            sql`lower(trim(${val}#>>'{}')) = lower(${v})`,
          )!,
        );
      }
      if (op === "ne") {
        return existsCcv(
          db,
          tenantId,
          fieldId,
          and(
            sql`jsonb_typeof(${val}) = 'string'`,
            sql`lower(trim(${val}#>>'{}')) <> lower(${v})`,
          )!,
        );
      }
      if (op === "contains") {
        const needle = v.toLowerCase();
        return existsCcv(
          db,
          tenantId,
          fieldId,
          and(
            sql`jsonb_typeof(${val}) = 'string'`,
            sql`strpos(lower(coalesce(${val}#>>'{}', '')), ${needle}) > 0`,
          )!,
        );
      }
      if (op === "not_contains") {
        const needle = v.toLowerCase();
        return existsCcv(
          db,
          tenantId,
          fieldId,
          and(
            sql`jsonb_typeof(${val}) = 'string'`,
            sql`strpos(lower(coalesce(${val}#>>'{}', '')), ${needle}) = 0`,
          )!,
        );
      }
      return null;
    }
    case "number": {
      if (op === "empty") {
        return not(
          existsCcv(db, tenantId, fieldId, ccvHasMeaningfulValue()),
        );
      }
      if (op === "not_empty") {
        return existsCcv(db, tenantId, fieldId, ccvHasMeaningfulValue());
      }
      if (!v) return null;
      const n = Number.parseFloat(v);
      if (Number.isNaN(n)) return null;
      if (op === "eq") {
        return existsCcv(
          db,
          tenantId,
          fieldId,
          and(
            sql`jsonb_typeof(${val}) = 'number'`,
            sql`(${val}#>>'{}')::numeric = ${String(n)}::numeric`,
          )!,
        );
      }
      if (op === "ne") {
        return existsCcv(
          db,
          tenantId,
          fieldId,
          and(
            sql`jsonb_typeof(${val}) = 'number'`,
            sql`(${val}#>>'{}')::numeric <> ${String(n)}::numeric`,
          )!,
        );
      }
      if (op === "gte") {
        return existsCcv(
          db,
          tenantId,
          fieldId,
          and(
            sql`jsonb_typeof(${val}) = 'number'`,
            sql`(${val}#>>'{}')::numeric >= ${String(n)}::numeric`,
          )!,
        );
      }
      if (op === "lte") {
        return existsCcv(
          db,
          tenantId,
          fieldId,
          and(
            sql`jsonb_typeof(${val}) = 'number'`,
            sql`(${val}#>>'{}')::numeric <= ${String(n)}::numeric`,
          )!,
        );
      }
      return null;
    }
    case "boolean": {
      if (op === "empty") {
        return not(
          existsCcv(db, tenantId, fieldId, ccvHasMeaningfulValue()),
        );
      }
      if (op === "not_empty") {
        return existsCcv(db, tenantId, fieldId, ccvHasMeaningfulValue());
      }
      if (op === "is_true") {
        return existsCcv(
          db,
          tenantId,
          fieldId,
          sql`${val} = 'true'::jsonb`,
        );
      }
      if (op === "is_false") {
        return existsCcv(
          db,
          tenantId,
          fieldId,
          sql`${val} = 'false'::jsonb`,
        );
      }
      return null;
    }
    case "date": {
      if (op === "empty") {
        return not(
          existsCcv(db, tenantId, fieldId, ccvHasMeaningfulValue()),
        );
      }
      if (op === "not_empty") {
        return existsCcv(db, tenantId, fieldId, ccvHasMeaningfulValue());
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
      if (op === "before") {
        return existsCcv(
          db,
          tenantId,
          fieldId,
          and(
            sql`jsonb_typeof(${val}) = 'string'`,
            sql`(${val}#>>'{}')::date < ${v}::date`,
          )!,
        );
      }
      if (op === "after") {
        return existsCcv(
          db,
          tenantId,
          fieldId,
          and(
            sql`jsonb_typeof(${val}) = 'string'`,
            sql`(${val}#>>'{}')::date > ${v}::date`,
          )!,
        );
      }
      if (op === "on") {
        return existsCcv(
          db,
          tenantId,
          fieldId,
          and(
            sql`jsonb_typeof(${val}) = 'string'`,
            sql`(${val}#>>'{}')::date = ${v}::date`,
          )!,
        );
      }
      return null;
    }
    default:
      return null;
  }
}

export function buildContactListFilterConditions(
  db: AppDb,
  tenantId: number,
  filters: ContactListFilters | undefined,
): SQL[] {
  const conditions: SQL[] = [eq(contacts.tenantId, tenantId)];
  if (!filters) return conditions;

  const fragments: SQL[] = [];

  if (filters.q?.trim()) {
    const p = `%${filters.q.trim()}%`;
    fragments.push(
      or(
        ilike(contacts.phoneE164, p),
        ilike(contacts.name, p),
        ilike(contacts.email, p),
      )!,
    );
  }

  for (const clause of filters.systemFieldClauses ?? []) {
    const sqlPart = systemFieldClauseToSql(clause);
    if (sqlPart) fragments.push(sqlPart);
  }

  for (const cl of filters.tagClauses ?? []) {
    const ex = exists(
      db
        .select({ one: sql`1` })
        .from(contactTags)
        .where(
          and(
            eq(contactTags.contactId, contacts.id),
            eq(contactTags.tagId, cl.tagId),
          ),
        ),
    );
    fragments.push(cl.op === "is" ? ex : not(ex));
  }

  for (const clause of filters.customFieldClauses ?? []) {
    const sqlPart = customClauseToSql(db, tenantId, clause);
    if (sqlPart) fragments.push(sqlPart);
  }

  if (fragments.length === 0) return conditions;

  const match = filters.conditionMatch ?? "all";
  if (fragments.length === 1) {
    conditions.push(fragments[0]!);
  } else if (match === "any") {
    const o = or(...fragments);
    if (o) conditions.push(o);
  } else {
    const a = and(...fragments);
    if (a) conditions.push(a);
  }

  return conditions;
}

// ─── Resolução de cláusulas vindas da API ───────────────────────────────────

export function resolveCustomClausesFromApi(
  raw: Array<{ fieldId: string; op: string; value?: string }>,
  defs: Array<{ id: string; fieldType: string }>,
):
  | { ok: true; clauses: ContactCustomFilterClause[] }
  | { ok: false; error: string } {
  const byId = new Map(defs.map((d) => [d.id, d]));
  const out: ContactCustomFilterClause[] = [];
  for (const c of raw) {
    const def = byId.get(c.fieldId);
    if (!def) {
      return { ok: false, error: "Campo personalizado desconhecido" };
    }
    const ft = def.fieldType as FieldType;
    if (!isCustomOpAllowed(ft, c.op)) {
      return { ok: false, error: "Operador inválido para o tipo do campo" };
    }
    const v = c.value?.trim() ?? "";
    if (customOpNeedsValue(ft, c.op) && !v) {
      return { ok: false, error: "Valor obrigatório para este operador" };
    }
    if (ft === "date" && customOpNeedsValue(ft, c.op) && v) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        return { ok: false, error: "Use a data no formato AAAA-MM-DD" };
      }
    }
    if (ft === "number" && customOpNeedsValue(ft, c.op) && v) {
      if (Number.isNaN(Number.parseFloat(v))) {
        return { ok: false, error: "Número inválido" };
      }
    }
    out.push({
      fieldId: c.fieldId,
      fieldType: ft,
      op: c.op,
      ...(v ? { value: v } : {}),
    });
  }
  return { ok: true, clauses: out };
}
