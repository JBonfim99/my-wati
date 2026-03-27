import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { tenantIntegrations } from "@/lib/db/schema";
import { getCachedMessageTemplatesForTenant } from "@/lib/meta/cached-templates";
import { requireTenantContext } from "@/lib/api-tenant-context";

const CACHE_CONTROL =
  "private, s-maxage=120, stale-while-revalidate=240";

type RouteCtx = { params: Promise<{ tenantId: string }> };

/** GET — lista templates do WABA (Graph API), com cache server-side por tenant. */
export async function GET(_req: Request, route: RouteCtx) {
  const gate = await requireTenantContext((await route.params).tenantId);
  if (!gate.ok) return gate.response;
  const ctx = gate.ctx;

  const db = getDb();
  const [integration] = await db
    .select()
    .from(tenantIntegrations)
    .where(eq(tenantIntegrations.tenantId, ctx.tenantId))
    .limit(1);

  if (!integration) {
    return NextResponse.json(
      { error: "Integração não configurada" },
      { status: 400 },
    );
  }

  if (!integration.businessAccountId?.trim()) {
    return NextResponse.json(
      {
        error:
          "Defina o WABA ID (WhatsApp Business Account ID) em Integração para listar templates.",
      },
      { status: 400 },
    );
  }

  try {
    const templates = await getCachedMessageTemplatesForTenant(ctx.tenantId);
    return NextResponse.json(
      { templates },
      {
        headers: { "Cache-Control": CACHE_CONTROL },
      },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro ao listar templates";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
