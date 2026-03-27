import type { MessageTemplateRecord } from "@/lib/meta/graph";
import { DB_TEMPLATE_DRAFT_STATUS } from "@/lib/meta/template-create-payload";
import type { WabaTemplateStatusSnapshotRow } from "@/lib/templates/waba-template-snapshot-queries";

export const TEMPLATES_LIST_PAGE_SIZE = 25;
export const TEMPLATES_LIST_PAGE_MAX = 100;

export type TemplatesListSortKey = "recent" | "nameAsc" | "nameDesc";

export type TemplatesListFilters = {
  /** Normalizado em maiúsculas: DB_DRAFT, APPROVED, PENDING, REJECTED */
  statuses: string[];
  /** MARKETING, UTILITY, AUTHENTICATION */
  categories: string[];
  q: string;
  sort: TemplatesListSortKey;
};

export function defaultTemplatesListFilters(): TemplatesListFilters {
  return {
    statuses: [],
    categories: [],
    q: "",
    sort: "recent",
  };
}

export function templateUpdatedMs(t: MessageTemplateRecord): number {
  const raw = t.last_updated_time;
  const n = Number(raw);
  if (Number.isNaN(n)) return 0;
  if (n > 1e12) return n;
  if (n > 1e8) return n * 1000;
  return 0;
}

function normalizeTemplateCategory(cat: string | undefined): string {
  const u = (cat ?? "").toUpperCase();
  if (u === "TRANSACTIONAL") return "UTILITY";
  return u;
}

function normalizeTemplateStatus(status: string | undefined): string {
  return (status ?? "").toUpperCase();
}

/**
 * Mescla Meta + rascunhos DB e ordena por data (mais recente primeiro).
 */
export function mergeTemplatesSorted(
  meta: MessageTemplateRecord[],
  drafts: MessageTemplateRecord[],
): MessageTemplateRecord[] {
  return [...meta, ...drafts].sort((a, b) => {
    const ta = templateUpdatedMs(a);
    const tb = templateUpdatedMs(b);
    if (ta !== tb) return tb - ta;
    return (a.name ?? "").localeCompare(b.name ?? "", "pt-BR");
  });
}

/**
 * Sobrepõe status / última atualização / rejeição a partir do último webhook da Meta.
 */
export function applyTemplateWebhookOverlay(
  meta: MessageTemplateRecord[],
  snapshots: WabaTemplateStatusSnapshotRow[],
): MessageTemplateRecord[] {
  if (snapshots.length === 0) return meta;
  const byId = new Map(snapshots.map((s) => [s.metaTemplateId, s]));
  return meta.map((t) => {
    const id = t.id?.trim();
    if (!id) return t;
    const snap = byId.get(id);
    if (!snap) return t;
    const next: MessageTemplateRecord = { ...t, status: snap.status };
    const ms = snap.webhookTime.getTime();
    next.last_updated_time = String(ms);
    if (snap.category?.trim()) next.category = snap.category;
    if (snap.rejectionInfo?.reason) {
      next.rejected_reason = { message: snap.rejectionInfo.reason };
    } else if (snap.status === "REJECTED" && snap.reason?.trim()) {
      next.rejected_reason = { message: snap.reason };
    }
    return next;
  });
}

export function filterTemplatesList(
  list: MessageTemplateRecord[],
  filters: TemplatesListFilters,
): MessageTemplateRecord[] {
  let out = list;

  if (filters.statuses.length > 0) {
    const want = new Set(filters.statuses.map((s) => s.toUpperCase()));
    out = out.filter((t) => want.has(normalizeTemplateStatus(t.status)));
  }

  if (filters.categories.length > 0) {
    const want = new Set(filters.categories.map((c) => c.toUpperCase()));
    out = out.filter((t) => want.has(normalizeTemplateCategory(t.category)));
  }

  const q = filters.q.trim().toLowerCase();
  if (q) {
    out = out.filter((r) => {
      const blob = [r.name, r.category, r.language, r.status, r.id]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }

  const sort = filters.sort;
  const sorted = [...out];
  if (sort === "nameAsc") {
    sorted.sort((a, b) =>
      (a.name ?? "").localeCompare(b.name ?? "", "pt-BR", {
        sensitivity: "base",
      }),
    );
  } else if (sort === "nameDesc") {
    sorted.sort((a, b) =>
      (b.name ?? "").localeCompare(a.name ?? "", "pt-BR", {
        sensitivity: "base",
      }),
    );
  } else {
    sorted.sort((a, b) => {
      const ta = templateUpdatedMs(a);
      const tb = templateUpdatedMs(b);
      if (ta !== tb) return tb - ta;
      return (a.name ?? "").localeCompare(b.name ?? "", "pt-BR");
    });
  }

  return sorted;
}

export type TemplatesListCursor = { o: number };

export function encodeTemplatesListCursor(offset: number): string {
  const json = JSON.stringify({ o: offset } satisfies TemplatesListCursor);
  return Buffer.from(json, "utf8").toString("base64url");
}

export function decodeTemplatesListCursor(raw: string | null): number {
  if (!raw?.trim()) return 0;
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const p = JSON.parse(json) as TemplatesListCursor;
    const o = typeof p.o === "number" && Number.isFinite(p.o) ? Math.floor(p.o) : 0;
    return Math.max(0, o);
  } catch {
    return 0;
  }
}

export function sliceTemplatesPage(
  sortedFull: MessageTemplateRecord[],
  offset: number,
  limit: number,
): { page: MessageTemplateRecord[]; nextCursor: string | null; total: number } {
  const total = sortedFull.length;
  const safeOffset = Math.max(0, Math.min(offset, total));
  const page = sortedFull.slice(safeOffset, safeOffset + limit);
  const nextOff = safeOffset + page.length;
  const nextCursor =
    nextOff < total ? encodeTemplatesListCursor(nextOff) : null;
  return { page, nextCursor, total };
}

/** Status exibidos nos filtros (valores da API / DB_DRAFT). */
export const TEMPLATE_FILTER_STATUS_VALUES = [
  DB_TEMPLATE_DRAFT_STATUS,
  "APPROVED",
  "PENDING",
  "REJECTED",
] as const;

export const TEMPLATE_FILTER_CATEGORY_VALUES = [
  "MARKETING",
  "UTILITY",
  "AUTHENTICATION",
] as const;
