import type {
  ContactListsFilterClause,
  ContactSystemFieldClause,
  ContactTagFilterClause,
} from "@/lib/contacts/queries";
import {
  CUSTOM_FILTER_OPS_BY_TYPE,
  defaultCustomOpForType,
  systemFieldOpNeedsValue,
  customOpNeedsValue,
} from "@/lib/contacts/filter-operators";
import type { FieldType } from "@/lib/contacts/validate-custom-value";

export type TagFilterOp = "is" | "is_not";

export type SystemFieldFilterOp = ContactSystemFieldClause["op"];

export type ListFilterOp = ContactListsFilterClause["op"];

export type ContactFilterCondition =
  | { id: string; type: "tag"; tagId: string; op: TagFilterOp }
  | {
      id: string;
      type: "field";
      field: "phone" | "name" | "email";
      op: SystemFieldFilterOp;
      value: string;
    }
  | {
      id: string;
      type: "custom";
      fieldId: string;
      fieldType: FieldType;
      op: string;
      value: string;
    }
  | {
      id: string;
      type: "list";
      op: ListFilterOp;
      listIds: number[];
    };

export type ContactsListFilterState = {
  toolbarSearch: string;
  /** E = todas as partes (busca + condições); OU = pelo menos uma verdadeira. */
  conditionMatch: "any" | "all";
  conditions: ContactFilterCondition[];
};

/** Alinhado a `CONTACTS_PAGE_SIZE` na API (25). */
export const CONTACTS_LIST_PAGE_SIZE = 25;

export function emptyContactsListFilter(): ContactsListFilterState {
  return { toolbarSearch: "", conditionMatch: "all", conditions: [] };
}

function newConditionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function addTagCondition(
  state: ContactsListFilterState,
): ContactsListFilterState {
  return {
    ...state,
    conditions: [
      ...state.conditions,
      { id: newConditionId(), type: "tag", tagId: "", op: "is" },
    ],
  };
}

export function addFieldCondition(
  state: ContactsListFilterState,
  field: "phone" | "name" | "email",
): ContactsListFilterState {
  return {
    ...state,
    conditions: [
      ...state.conditions,
      {
        id: newConditionId(),
        type: "field",
        field,
        op: "contains",
        value: "",
      },
    ],
  };
}

export function addCustomFieldCondition(
  state: ContactsListFilterState,
  fieldId: string,
  fieldType: FieldType,
): ContactsListFilterState {
  return {
    ...state,
    conditions: [
      ...state.conditions,
      {
        id: newConditionId(),
        type: "custom",
        fieldId,
        fieldType,
        op: defaultCustomOpForType(fieldType),
        value: "",
      },
    ],
  };
}

export function addListCondition(
  state: ContactsListFilterState,
): ContactsListFilterState {
  return {
    ...state,
    conditions: [
      ...state.conditions,
      {
        id: newConditionId(),
        type: "list",
        op: "in_any",
        listIds: [],
      },
    ],
  };
}

function conditionIsMeaningful(c: ContactFilterCondition): boolean {
  if (c.type === "tag") return Boolean(c.tagId);
  if (c.type === "field") {
    if (!systemFieldOpNeedsValue(c.op)) return true;
    return Boolean(c.value.trim());
  }
  if (c.type === "custom") {
    if (!customOpNeedsValue(c.fieldType, c.op)) return true;
    return Boolean(c.value.trim());
  }
  if (c.type === "list") return c.listIds.length > 0;
  return false;
}

/** Quantidade de “partes” que entram no E/OU (busca da barra conta como 1). */
export function countMeaningfulFilterParts(f: ContactsListFilterState): number {
  let n = f.toolbarSearch.trim() ? 1 : 0;
  for (const c of f.conditions) {
    if (conditionIsMeaningful(c)) n += 1;
  }
  return n;
}

/** Parâmetros serializados para GET /api/t/.../contacts */
export function filtersToQueryParams(f: ContactsListFilterState): {
  conditionMatch: "all" | "any";
  q?: string;
  systemFieldClauses?: ContactSystemFieldClause[];
  customRaw?: Array<{ fieldId: string; op: string; value?: string }>;
  tagClauses?: ContactTagFilterClause[];
  listClauses?: ContactListsFilterClause[];
} {
  const tagClauses = f.conditions
    .filter(
      (c): c is Extract<ContactFilterCondition, { type: "tag" }> =>
        c.type === "tag" && Boolean(c.tagId),
    )
    .map((c) => ({ tagId: Number(c.tagId), op: c.op }));

  const systemFieldClauses: ContactSystemFieldClause[] = f.conditions
    .filter((c): c is Extract<ContactFilterCondition, { type: "field" }> => {
      if (c.type !== "field") return false;
      if (!systemFieldOpNeedsValue(c.op)) return true;
      return Boolean(c.value.trim());
    })
    .map((c) => {
      const row: ContactSystemFieldClause = { field: c.field, op: c.op };
      if (systemFieldOpNeedsValue(c.op)) row.value = c.value.trim();
      return row;
    });

  const customRaw = f.conditions
    .filter((c): c is Extract<ContactFilterCondition, { type: "custom" }> => {
      if (c.type !== "custom" || !c.fieldId) return false;
      if (!customOpNeedsValue(c.fieldType, c.op)) return true;
      return Boolean(c.value.trim());
    })
    .map((c) => ({
      fieldId: c.fieldId,
      op: c.op,
      ...(c.value.trim() ? { value: c.value.trim() } : {}),
    }));

  const q = f.toolbarSearch.trim() || undefined;

  const listClauses: ContactListsFilterClause[] = f.conditions
    .filter(
      (c): c is Extract<ContactFilterCondition, { type: "list" }> =>
        c.type === "list" && c.listIds.length > 0,
    )
    .map((c) => ({
      op: c.op,
      listIds: [...new Set(c.listIds)],
    }));

  return {
    conditionMatch: f.conditionMatch,
    q,
    systemFieldClauses:
      systemFieldClauses.length > 0 ? systemFieldClauses : undefined,
    customRaw: customRaw.length > 0 ? customRaw : undefined,
    tagClauses: tagClauses.length > 0 ? tagClauses : undefined,
    listClauses: listClauses.length > 0 ? listClauses : undefined,
  };
}

export function hasMeaningfulFilters(f: ContactsListFilterState): boolean {
  if (f.toolbarSearch.trim()) return true;
  return f.conditions.some(conditionIsMeaningful);
}

/** Mesmos parâmetros de filtro da listagem, sem `limit` / `cursor` / `total`. */
export function buildContactsFilterQueryString(f: ContactsListFilterState): string {
  const built = filtersToQueryParams(f);
  const p = new URLSearchParams();
  const hasFilterPayload =
    Boolean(built.q) ||
    Boolean(built.systemFieldClauses?.length) ||
    Boolean(built.tagClauses?.length) ||
    Boolean(built.customRaw?.length) ||
    Boolean(built.listClauses?.length);
  if (hasFilterPayload) {
    p.set("cm", built.conditionMatch);
  }
  if (built.q) p.set("q", built.q);
  if (built.systemFieldClauses && built.systemFieldClauses.length > 0) {
    p.set(
      "sfc",
      encodeURIComponent(JSON.stringify(built.systemFieldClauses)),
    );
  }
  if (built.tagClauses && built.tagClauses.length > 0) {
    p.set("tf", encodeURIComponent(JSON.stringify(built.tagClauses)));
  }
  if (built.customRaw && built.customRaw.length > 0) {
    p.set("cfc", encodeURIComponent(JSON.stringify(built.customRaw)));
  }
  if (built.listClauses && built.listClauses.length > 0) {
    p.set("lf", encodeURIComponent(JSON.stringify(built.listClauses)));
  }
  return p.toString();
}

export function buildContactsListQuery(
  f: ContactsListFilterState,
  opts?: {
    cursor?: string | null;
    limit?: number;
    includeTotal?: boolean;
  },
): string {
  const limit = opts?.limit ?? CONTACTS_LIST_PAGE_SIZE;
  const built = filtersToQueryParams(f);
  const p = new URLSearchParams();
  p.set("limit", String(limit));
  if (opts?.cursor) p.set("cursor", opts.cursor);
  const hasFilterPayload =
    Boolean(built.q) ||
    Boolean(built.systemFieldClauses?.length) ||
    Boolean(built.tagClauses?.length) ||
    Boolean(built.customRaw?.length) ||
    Boolean(built.listClauses?.length);
  if (hasFilterPayload) {
    p.set("cm", built.conditionMatch);
  }
  if (built.q) p.set("q", built.q);
  if (built.systemFieldClauses && built.systemFieldClauses.length > 0) {
    p.set(
      "sfc",
      encodeURIComponent(JSON.stringify(built.systemFieldClauses)),
    );
  }
  if (built.tagClauses && built.tagClauses.length > 0) {
    p.set("tf", encodeURIComponent(JSON.stringify(built.tagClauses)));
  }
  if (built.customRaw && built.customRaw.length > 0) {
    p.set("cfc", encodeURIComponent(JSON.stringify(built.customRaw)));
  }
  if (built.listClauses && built.listClauses.length > 0) {
    p.set("lf", encodeURIComponent(JSON.stringify(built.listClauses)));
  }
  if (opts?.includeTotal) p.set("total", "1");
  return p.toString();
}

export { CUSTOM_FILTER_OPS_BY_TYPE };
