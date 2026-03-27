import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/api-tenant-context";
import { getListsWorkspaceData } from "@/lib/lists/workspace-data";

type RouteCtx = { params: Promise<{ tenantId: string }> };

/** GET — listas + contatos do tenant num único round-trip (uma sessão, queries em paralelo). */
export async function GET(_req: Request, route: RouteCtx) {
  const gate = await requireTenantContext((await route.params).tenantId);
  if (!gate.ok) return gate.response;
  const ctx = gate.ctx;
  const { lists, contacts } = await getListsWorkspaceData(ctx.tenantId);
  return NextResponse.json({ lists, contacts });
}
