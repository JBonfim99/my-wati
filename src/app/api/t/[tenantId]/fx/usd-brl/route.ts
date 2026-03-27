import { NextResponse } from "next/server";
import { getUsdBrlRate } from "@/lib/fx/usd-brl";
import { requireTenantContext } from "@/lib/api-tenant-context";

type RouteCtx = { params: Promise<{ tenantId: string }> };

/** Cotação USD→BRL (Frankfurter) para estimativas na UI. */
export async function GET(_req: Request, route: RouteCtx) {
  const gate = await requireTenantContext((await route.params).tenantId);
  if (!gate.ok) return gate.response;

  const fx = await getUsdBrlRate();
  if (!fx.ok) {
    return NextResponse.json({ error: fx.error }, { status: 502 });
  }
  return NextResponse.json({ rate: fx.rate, asOf: fx.asOf });
}
