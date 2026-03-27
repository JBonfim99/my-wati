import { NextResponse } from "next/server";
import { listDistinctCampaignTemplateNames } from "@/lib/campaigns/list-queries";
import { getDb } from "@/lib/db";
import { requireTenantContext } from "@/lib/api-tenant-context";

type RouteCtx = { params: Promise<{ tenantId: string }> };

export async function GET(_req: Request, route: RouteCtx) {
  const gate = await requireTenantContext((await route.params).tenantId);
  if (!gate.ok) return gate.response;
  const db = getDb();
  const names = await listDistinctCampaignTemplateNames(db, gate.ctx.tenantId);
  return NextResponse.json({ templateNames: names });
}
