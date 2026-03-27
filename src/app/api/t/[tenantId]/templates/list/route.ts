import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { tenantIntegrations } from "@/lib/db/schema";
import { getCachedMessageTemplatesForTenant } from "@/lib/meta/cached-templates";
import type { MessageTemplateRecord } from "@/lib/meta/graph";
import {
  draftRowToMessageTemplateRecord,
} from "@/lib/meta/template-create-payload";
import { requireTenantContext } from "@/lib/api-tenant-context";
import { listMessageTemplateDrafts } from "@/lib/templates/template-draft-queries";
import {
  applyTemplateWebhookOverlay,
  decodeTemplatesListCursor,
  filterTemplatesList,
  mergeTemplatesSorted,
  sliceTemplatesPage,
  TEMPLATES_LIST_PAGE_MAX,
  TEMPLATES_LIST_PAGE_SIZE,
  type TemplatesListFilters,
  type TemplatesListSortKey,
} from "@/lib/templates/template-list-query";
import { listWabaTemplateStatusSnapshots } from "@/lib/templates/waba-template-snapshot-queries";

type RouteCtx = { params: Promise<{ tenantId: string }> };

function parseMultiParam(
  url: URL,
  key: string,
): string[] {
  const all = url.searchParams.getAll(key);
  const out: string[] = [];
  for (const raw of all) {
    for (const part of raw.split(",")) {
      const t = part.trim();
      if (t) out.push(t);
    }
  }
  return out;
}

function parseSort(raw: string | null): TemplatesListSortKey {
  if (raw === "nameAsc" || raw === "nameDesc" || raw === "recent") return raw;
  return "recent";
}

/** GET — lista mesclada (Meta + rascunhos) com filtros e paginação por cursor (offset). */
export async function GET(req: NextRequest, route: RouteCtx) {
  const gate = await requireTenantContext((await route.params).tenantId);
  if (!gate.ok) return gate.response;
  const ctx = gate.ctx;

  const db = getDb();
  const [integration] = await db
    .select({
      businessAccountId: tenantIntegrations.businessAccountId,
    })
    .from(tenantIntegrations)
    .where(eq(tenantIntegrations.tenantId, ctx.tenantId))
    .limit(1);

  const integrationConfigured = Boolean(
    integration?.businessAccountId?.trim(),
  );

  const url = new URL(req.url);
  const cursor = decodeTemplatesListCursor(url.searchParams.get("cursor"));
  const limitRaw = Number.parseInt(
    url.searchParams.get("limit") ?? String(TEMPLATES_LIST_PAGE_SIZE),
    10,
  );
  const limit = Math.min(
    TEMPLATES_LIST_PAGE_MAX,
    Math.max(1, Number.isNaN(limitRaw) ? TEMPLATES_LIST_PAGE_SIZE : limitRaw),
  );

  const statuses = parseMultiParam(url, "status").map((s) => s.toUpperCase());
  const categories = parseMultiParam(url, "category").map((c) => c.toUpperCase());
  const q = url.searchParams.get("q") ?? "";
  const sort = parseSort(url.searchParams.get("sort"));

  const filters: TemplatesListFilters = {
    statuses,
    categories,
    q,
    sort,
  };

  let metaTemplates: MessageTemplateRecord[] = [];
  let loadError: string | null = null;

  if (integrationConfigured) {
    try {
      metaTemplates = await getCachedMessageTemplatesForTenant(ctx.tenantId);
    } catch (e) {
      loadError =
        e instanceof Error ? e.message : "Erro ao listar templates";
    }
  }

  const [draftRows, wabaSnapshots] = await Promise.all([
    listMessageTemplateDrafts(db, ctx.tenantId),
    listWabaTemplateStatusSnapshots(db, ctx.tenantId),
  ]);
  const draftRecords = draftRows.map((r) =>
    draftRowToMessageTemplateRecord({
      id: r.id,
      payload: r.payload,
      updatedAt: r.updatedAt,
    }),
  );

  const metaWithWebhook = applyTemplateWebhookOverlay(
    metaTemplates,
    wabaSnapshots,
  );
  const merged = mergeTemplatesSorted(metaWithWebhook, draftRecords);
  const filtered = filterTemplatesList(merged, filters);
  const { page, nextCursor, total } = sliceTemplatesPage(
    filtered,
    cursor,
    limit,
  );

  return NextResponse.json({
    templates: page,
    nextCursor,
    total,
    integrationConfigured,
    loadError,
  });
}
