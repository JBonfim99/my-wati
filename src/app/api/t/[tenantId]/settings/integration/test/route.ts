import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireTenantContext } from "@/lib/api-tenant-context";
import { getDb } from "@/lib/db";
import { tenantIntegrations } from "@/lib/db/schema";
import { decryptSecret } from "@/lib/crypto";
import { fetchWhatsappPhoneNumberInfo } from "@/lib/meta/graph";
import { canManageIntegration } from "@/lib/rbac";

type RouteCtx = { params: Promise<{ tenantId: string }> };

/** POST — chama a Graph API com o token guardado (GET do phone number id). */
export async function POST(_req: Request, route: RouteCtx) {
  const gate = await requireTenantContext((await route.params).tenantId);
  if (!gate.ok) return gate.response;
  const ctx = gate.ctx;
  if (!canManageIntegration(ctx)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getDb();
  const [row] = await db
    .select()
    .from(tenantIntegrations)
    .where(eq(tenantIntegrations.tenantId, ctx.tenantId))
    .limit(1);

  if (!row) {
    return NextResponse.json(
      { error: "Nenhuma integração configurada." },
      { status: 400 },
    );
  }

  let token: string;
  try {
    token = decryptSecret(row.encryptedAccessToken);
  } catch {
    return NextResponse.json(
      { error: "Não foi possível ler o token guardado." },
      { status: 500 },
    );
  }

  const result = await fetchWhatsappPhoneNumberInfo(
    token,
    row.phoneNumberId,
    row.graphApiVersion,
  );

  if (!result.ok) {
    return NextResponse.json({
      ok: false,
      error: result.error,
      errorCode: result.errorCode,
    });
  }

  return NextResponse.json({
    ok: true,
    phoneNumberId: result.id,
    displayPhoneNumber: result.displayPhoneNumber ?? null,
    verifiedName: result.verifiedName ?? null,
  });
}
