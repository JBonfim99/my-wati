import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/api-tenant-context";
import { cancelCampaignQueue } from "@/lib/campaigns/cancel-campaign-queue";
import { getDb } from "@/lib/db";
import { canWriteCampaigns } from "@/lib/rbac";

type RouteCtx = {
  params: Promise<{ tenantId: string; campaignId: string }>;
};

const uuidParam = z.string().uuid();

/** Cancela jobs ainda na fila (agendados / não processados). */
export async function POST(_req: Request, route: RouteCtx) {
  const gate = await requireTenantContext((await route.params).tenantId);
  if (!gate.ok) return gate.response;
  const ctx = gate.ctx;
  if (!canWriteCampaigns(ctx)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { campaignId: raw } = await route.params;
  const parsed = uuidParam.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const db = getDb();
  const result = await cancelCampaignQueue(db, ctx.tenantId, parsed.data);

  if (!result.ok) {
    if (result.reason === "not_found") {
      return NextResponse.json({ error: "Não encontrada" }, { status: 404 });
    }
    return NextResponse.json(
      {
        error:
          "Não é possível cancelar: o envio já começou ou a campanha já terminou.",
      },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true });
}
