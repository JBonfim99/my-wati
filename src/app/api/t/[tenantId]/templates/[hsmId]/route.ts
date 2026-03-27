import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { requireTenantContext } from "@/lib/api-tenant-context";
import { getDb } from "@/lib/db";
import { canManageIntegration } from "@/lib/rbac";
import {
  deleteMessageTemplateFromWaba,
  fetchMessageTemplateById,
  updateMessageTemplateById,
} from "@/lib/meta/graph";
import { wabaTemplatesCacheTag } from "@/lib/meta/cached-templates";
import { getTenantMetaIntegration } from "@/lib/meta/tenant-integration-meta";
import { isMessageTemplateEditableByMeta } from "@/lib/meta/template-editable";
import { sanitizeTemplateComponentsForWrite } from "@/lib/meta/template-components";

type RouteCtx = { params: Promise<{ tenantId: string; hsmId: string }> };

const patchSchema = z.object({
  components: z.array(z.unknown()).min(1),
  category: z.enum(["UTILITY", "MARKETING", "AUTHENTICATION"]).optional(),
  parameter_format: z.string().trim().max(32).optional(),
});

export async function DELETE(_req: NextRequest, route: RouteCtx) {
  const { tenantId: tp, hsmId } = await route.params;
  const gate = await requireTenantContext(tp);
  if (!gate.ok) return gate.response;
  const ctx = gate.ctx;

  if (!canManageIntegration(ctx)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = decodeURIComponent(hsmId).trim();
  if (!id) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const db = getDb();
  const meta = await getTenantMetaIntegration(db, ctx.tenantId);
  if (!meta.ok) {
    return NextResponse.json({ error: meta.error }, { status: meta.status });
  }

  const { accessToken, businessAccountId, graphApiVersion } =
    meta.integration;

  const result = await deleteMessageTemplateFromWaba(
    accessToken,
    businessAccountId,
    id,
    graphApiVersion,
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  revalidateTag(wabaTemplatesCacheTag(ctx.tenantId));
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, route: RouteCtx) {
  const { tenantId: tp, hsmId } = await route.params;
  const gate = await requireTenantContext(tp);
  if (!gate.ok) return gate.response;
  const ctx = gate.ctx;

  if (!canManageIntegration(ctx)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = decodeURIComponent(hsmId).trim();
  if (!id) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
      { status: 400 },
    );
  }

  const db = getDb();
  const meta = await getTenantMetaIntegration(db, ctx.tenantId);
  if (!meta.ok) {
    return NextResponse.json({ error: meta.error }, { status: meta.status });
  }

  const { accessToken, graphApiVersion } = meta.integration;

  let current;
  try {
    current = await fetchMessageTemplateById(accessToken, id, graphApiVersion);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Template não encontrado";
    return NextResponse.json({ error: msg }, { status: 404 });
  }

  if (!isMessageTemplateEditableByMeta(current.status)) {
    return NextResponse.json(
      { error: "Este modelo não pode ser editado no estado atual." },
      { status: 409 },
    );
  }

  const components = sanitizeTemplateComponentsForWrite(
    parsed.data.components,
  );
  const hasBody = components.some(
    (c) =>
      typeof c === "object" &&
      c !== null &&
      (c as { type?: string }).type === "BODY",
  );
  if (!hasBody) {
    return NextResponse.json(
      { error: "É necessário um componente BODY no modelo." },
      { status: 400 },
    );
  }

  const result = await updateMessageTemplateById(
    accessToken,
    id,
    {
      components,
      ...(parsed.data.category ? { category: parsed.data.category } : {}),
      ...(parsed.data.parameter_format
        ? { parameter_format: parsed.data.parameter_format }
        : {}),
    },
    graphApiVersion,
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  revalidateTag(wabaTemplatesCacheTag(ctx.tenantId));
  return NextResponse.json({ ok: true });
}
