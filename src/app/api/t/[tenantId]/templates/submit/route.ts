import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { requireTenantContext } from "@/lib/api-tenant-context";
import { getDb } from "@/lib/db";
import { canManageIntegration } from "@/lib/rbac";
import { createMessageTemplateOnWaba } from "@/lib/meta/graph";
import { wabaTemplatesCacheTag } from "@/lib/meta/cached-templates";
import { getTenantMetaIntegration } from "@/lib/meta/tenant-integration-meta";
import {
  normalizeTemplateCategoryForWrite,
  sanitizeTemplateComponentsForWrite,
  slugifyTemplateName,
} from "@/lib/meta/template-components";
import {
  parseTemplateFormPayload,
  validateForMetaSubmit,
} from "@/lib/meta/template-create-payload";
import { deleteMessageTemplateDraft } from "@/lib/templates/template-draft-queries";

type RouteCtx = { params: Promise<{ tenantId: string }> };

const formBodySchema = z.object({
  draftId: z.string().uuid().optional(),
  form: z.record(z.string(), z.unknown()),
});

const legacyBodySchema = z.object({
  draftId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(512),
  language: z.string().trim().min(1),
  category: z.string().trim().optional(),
  components: z.array(z.unknown()),
  parameter_format: z.string().trim().max(32).optional(),
});

/** POST — cria modelo na Meta (envio para aprovação / revisão). */
export async function POST(req: NextRequest, route: RouteCtx) {
  const gate = await requireTenantContext((await route.params).tenantId);
  if (!gate.ok) return gate.response;
  const ctx = gate.ctx;

  if (!canManageIntegration(ctx)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const raw: unknown = await req.json();
  const formParsed = formBodySchema.safeParse(raw);

  let name: string;
  let language: string;
  let category: ReturnType<typeof normalizeTemplateCategoryForWrite>;
  let components: unknown[];
  let parameter_format: string | undefined;
  let draftIdToDelete: string | undefined;

  if (formParsed.success) {
    draftIdToDelete = formParsed.data.draftId;
    const state = parseTemplateFormPayload(formParsed.data.form);
    const v = validateForMetaSubmit(state);
    if (!v.ok) {
      return NextResponse.json(
        {
          error: v.issues[0] ?? "Validação falhou",
          issues: v.issues,
        },
        { status: 422 },
      );
    }
    name = v.payload.name;
    language = v.payload.language;
    category = normalizeTemplateCategoryForWrite(v.payload.category);
    components = v.payload.components;
    parameter_format = v.payload.parameter_format;
  } else {
    const legParsed = legacyBodySchema.safeParse(raw);
    if (!legParsed.success) {
      return NextResponse.json(
        {
          error:
            legParsed.error.issues[0]?.message ?? "Dados inválidos",
        },
        { status: 400 },
      );
    }
    draftIdToDelete = legParsed.data.draftId;
    name = slugifyTemplateName(legParsed.data.name);
    if (!name) {
      return NextResponse.json(
        { error: "Nome do modelo inválido" },
        { status: 400 },
      );
    }
    language = legParsed.data.language.trim();
    category = normalizeTemplateCategoryForWrite(legParsed.data.category);
    components = sanitizeTemplateComponentsForWrite(legParsed.data.components);
    parameter_format = legParsed.data.parameter_format?.trim();
  }

  const db = getDb();
  const meta = await getTenantMetaIntegration(db, ctx.tenantId);
  if (!meta.ok) {
    return NextResponse.json({ error: meta.error }, { status: meta.status });
  }

  const hasBody = components.some(
    (c) =>
      typeof c === "object" &&
      c !== null &&
      (c as { type?: string }).type === "BODY",
  );
  if (!hasBody) {
    return NextResponse.json(
      {
        error:
          "O modelo precisa de um corpo de texto. Tipos só com mídia ou carrossel não podem ser enviados por aqui.",
      },
      { status: 422 },
    );
  }

  const { accessToken, businessAccountId, graphApiVersion } =
    meta.integration;

  const result = await createMessageTemplateOnWaba(
    accessToken,
    businessAccountId,
    {
      name,
      language,
      category,
      components,
      allow_category_change: true,
      ...(parameter_format ? { parameter_format } : {}),
    },
    graphApiVersion,
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  if (draftIdToDelete) {
    await deleteMessageTemplateDraft(db, ctx.tenantId, draftIdToDelete);
  }

  revalidateTag(wabaTemplatesCacheTag(ctx.tenantId));

  return NextResponse.json({
    item: {
      id: result.id,
      status: result.status,
      category: result.category,
      name,
      language,
    },
  });
}
