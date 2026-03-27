import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCampaignPeriodMetrics } from "@/lib/campaigns/list-queries";
import { getDb } from "@/lib/db";
import { tenantIntegrations } from "@/lib/db/schema";
import { fetchWhatsappPhoneNumberHealth } from "@/lib/meta/graph";
import { requireTenantContext } from "@/lib/api-tenant-context";
import { decryptSecret } from "@/lib/crypto";
import { eq } from "drizzle-orm";

type RouteCtx = { params: Promise<{ tenantId: string }> };

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET(req: NextRequest, route: RouteCtx) {
  const gate = await requireTenantContext((await route.params).tenantId);
  if (!gate.ok) return gate.response;
  const ctx = gate.ctx;

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    from: url.searchParams.get("from") ?? "",
    to: url.searchParams.get("to") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Informe from e to no formato YYYY-MM-DD" },
      { status: 400 },
    );
  }
  const { from, to } = parsed.data;
  if (from > to) {
    return NextResponse.json(
      { error: "A data inicial não pode ser depois da final" },
      { status: 400 },
    );
  }

  const db = getDb();
  const [metrics, integrationRow] = await Promise.all([
    getCampaignPeriodMetrics(db, ctx.tenantId, from, to),
    db
      .select()
      .from(tenantIntegrations)
      .where(eq(tenantIntegrations.tenantId, ctx.tenantId))
      .limit(1)
      .then((r) => r[0]),
  ]);

  let phoneHealth:
    | {
        ok: true;
        data: Record<string, unknown>;
      }
    | { ok: false; error: string }
    | null = null;

  if (integrationRow) {
    try {
      const token = decryptSecret(integrationRow.encryptedAccessToken);
      const h = await fetchWhatsappPhoneNumberHealth(
        token,
        integrationRow.phoneNumberId,
        integrationRow.graphApiVersion,
      );
      if (h.ok) {
        phoneHealth = {
          ok: true,
          data: {
            displayPhoneNumber: h.data.displayPhoneNumber,
            verifiedName: h.data.verifiedName,
            qualityRating: h.data.qualityRating,
            messagingLimitTier: h.data.messagingLimitTier,
            whatsappBusinessManagerMessagingLimit:
              h.data.whatsappBusinessManagerMessagingLimit,
            throughput: h.data.throughput,
          },
        };
      } else {
        phoneHealth = { ok: false, error: h.error };
      }
    } catch (e) {
      phoneHealth = {
        ok: false,
        error: e instanceof Error ? e.message : "Erro ao ler integração",
      };
    }
  } else {
    phoneHealth = { ok: false, error: "Integração não configurada" };
  }

  return NextResponse.json({
    metrics,
    phoneHealth,
  });
}
