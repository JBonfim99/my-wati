import { NextRequest, NextResponse } from "next/server";
import {
  CONTACT_IDS_CAP,
  parseContactListFiltersFromSearchParams,
} from "@/lib/contacts/contact-list-request";
import {
  listContactFieldDefs,
  listContactIdsForFilters,
} from "@/lib/contacts/queries";
import { getDb } from "@/lib/db";
import { requireTenantContext } from "@/lib/api-tenant-context";

type RouteCtx = { params: Promise<{ tenantId: string }> };

export async function GET(req: NextRequest, route: RouteCtx) {
  const gate = await requireTenantContext((await route.params).tenantId);
  if (!gate.ok) return gate.response;
  const ctx = gate.ctx;
  const db = getDb();

  const url = new URL(req.url);
  const fieldDefs = await listContactFieldDefs(db, ctx.tenantId);
  const parsed = parseContactListFiltersFromSearchParams(
    url.searchParams,
    fieldDefs,
  );
  if (!parsed.ok) return parsed.response;

  const { ids, truncated } = await listContactIdsForFilters(
    db,
    ctx.tenantId,
    parsed.filters,
    CONTACT_IDS_CAP,
  );

  return NextResponse.json({
    ids,
    truncated,
    cap: CONTACT_IDS_CAP,
  });
}
