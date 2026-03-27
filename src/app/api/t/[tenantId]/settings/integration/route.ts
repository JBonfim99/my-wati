import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireTenantContext } from "@/lib/api-tenant-context";
import { getDb } from "@/lib/db";
import { tenantIntegrations } from "@/lib/db/schema";
import { wabaTemplatesCacheTag } from "@/lib/meta/cached-templates";
import { canManageIntegration } from "@/lib/rbac";
import { encryptSecret } from "@/lib/crypto";

type RouteCtx = { params: Promise<{ tenantId: string }> };

const putIntegrationSchema = z.object({
  phoneNumberId: z.string().trim().min(1, "phoneNumberId é obrigatório"),
  accessToken: z.string().trim().optional(),
  webhookVerifyToken: z.string().trim().optional(),
  appSecret: z.string().nullable().optional(),
  businessAccountId: z.string().nullable().optional(),
  graphApiVersion: z.string().trim().optional(),
});

export async function GET(_req: Request, route: RouteCtx) {
  const gate = await requireTenantContext((await route.params).tenantId);
  if (!gate.ok) return gate.response;
  const ctx = gate.ctx;
  if (!canManageIntegration(ctx)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const db = getDb();
  const [row] = await db
    .select({
      phoneNumberId: tenantIntegrations.phoneNumberId,
      businessAccountId: tenantIntegrations.businessAccountId,
      graphApiVersion: tenantIntegrations.graphApiVersion,
      hasToken: tenantIntegrations.encryptedAccessToken,
      appSecret: tenantIntegrations.appSecret,
      updatedAt: tenantIntegrations.updatedAt,
    })
    .from(tenantIntegrations)
    .where(eq(tenantIntegrations.tenantId, ctx.tenantId))
    .limit(1);

  return NextResponse.json({
    integration: row
      ? {
          phoneNumberId: row.phoneNumberId,
          businessAccountId: row.businessAccountId,
          graphApiVersion: row.graphApiVersion,
          hasAccessToken: Boolean(row.hasToken),
          hasVerifyToken: true,
          hasAppSecret: Boolean(row.appSecret),
          updatedAt: row.updatedAt.toISOString(),
        }
      : null,
  });
}

export async function PUT(req: NextRequest, route: RouteCtx) {
  const gate = await requireTenantContext((await route.params).tenantId);
  if (!gate.ok) return gate.response;
  const ctx = gate.ctx;
  if (!canManageIntegration(ctx)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = putIntegrationSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const db = getDb();
  const [existing] = await db
    .select()
    .from(tenantIntegrations)
    .where(eq(tenantIntegrations.tenantId, ctx.tenantId))
    .limit(1);

  const verifyToken =
    body.webhookVerifyToken || existing?.webhookVerifyToken || "";
  if (!verifyToken) {
    return NextResponse.json(
      {
        error:
          "Verify token do webhook é obrigatório na primeira configuração. Depois você pode deixar em branco para manter o valor salvo.",
      },
      { status: 400 },
    );
  }

  let enc = existing?.encryptedAccessToken ?? "";
  if (body.accessToken) {
    enc = encryptSecret(body.accessToken);
  }
  if (!enc) {
    return NextResponse.json(
      { error: "accessToken required on first save" },
      { status: 400 },
    );
  }

  const nextAppSecret =
    body.appSecret !== undefined
      ? body.appSecret === null || body.appSecret === ""
        ? null
        : body.appSecret
      : (existing?.appSecret ?? null);

  const graphVersion =
    body.graphApiVersion || existing?.graphApiVersion || "v21.0";

  const businessAccountId =
    body.businessAccountId !== undefined
      ? body.businessAccountId
      : (existing?.businessAccountId ?? null);

  await db
    .insert(tenantIntegrations)
    .values({
      tenantId: ctx.tenantId,
      phoneNumberId: body.phoneNumberId,
      encryptedAccessToken: enc,
      webhookVerifyToken: verifyToken,
      appSecret: nextAppSecret,
      businessAccountId,
      graphApiVersion: graphVersion,
    })
    .onConflictDoUpdate({
      target: tenantIntegrations.tenantId,
      set: {
        phoneNumberId: body.phoneNumberId,
        encryptedAccessToken: enc,
        webhookVerifyToken: verifyToken,
        appSecret: nextAppSecret,
        businessAccountId,
        graphApiVersion: graphVersion,
        updatedAt: new Date(),
      },
    });

  revalidateTag(wabaTemplatesCacheTag(ctx.tenantId));

  return NextResponse.json({ ok: true });
}
