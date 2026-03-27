import { NextRequest, NextResponse } from "next/server";
import { contactsImportPayloadSchema } from "@/lib/contacts/import-schema";
import { getContactsImportQueue } from "@/lib/queues/contacts-import-queue";
import { requireTenantContext } from "@/lib/api-tenant-context";
import { canWriteContacts } from "@/lib/rbac";

type RouteCtx = { params: Promise<{ tenantId: string }> };

export async function POST(req: NextRequest, route: RouteCtx) {
  const gate = await requireTenantContext((await route.params).tenantId);
  if (!gate.ok) return gate.response;
  const ctx = gate.ctx;
  if (!canWriteContacts(ctx)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = contactsImportPayloadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
      { status: 400 },
    );
  }

  const queue = getContactsImportQueue();
  const job = await queue.add("contacts-import", {
    tenantId: ctx.tenantId,
    ...parsed.data,
  });

  return NextResponse.json({ jobId: String(job.id) }, { status: 202 });
}
