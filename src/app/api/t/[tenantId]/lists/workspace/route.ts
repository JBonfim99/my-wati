import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/api-tenant-context";
import { getListsWorkspaceData } from "@/lib/lists/workspace-data";

type RouteCtx = { params: Promise<{ tenantId: string }> };

/** GET — listas do tenant com contagem de membros. */
export async function GET(_req: Request, route: RouteCtx) {
  const gate = await requireTenantContext((await route.params).tenantId);
  if (!gate.ok) return gate.response;
  const ctx = gate.ctx;
  const { lists } = await getListsWorkspaceData(ctx.tenantId);
  return NextResponse.json({
    lists: lists.map((l) => ({
      id: l.id,
      name: l.name,
      createdAt: l.createdAt.toISOString(),
      memberCount: l.memberCount,
    })),
  });
}
